import { Config } from "../../shared/Config.js";
import { UrlCleaner } from "../../domain/capture/services/UrlCleaner.js";
import { VideoAsset } from "../../domain/capture/entities/VideoAsset.js";
import { SessionStorageRepository } from "../../infrastructure/storage/SessionStorageRepository.js";
import { DnrRuleManager } from "../../infrastructure/network/DnrRuleManager.js";
import { BrowserHttpClient } from "../../infrastructure/network/BrowserHttpClient.js";

/**
 * Background Service Worker Adapter.
 * Central event routing bus and orchestrator for extension network interception lifecycle rules.
 */
class BackgroundController {
    constructor() {
        this.storageRepo = new SessionStorageRepository();
        this.dnrManager = new DnrRuleManager();
        this.httpClient = new BrowserHttpClient();

        this.requestCache = {}; // Temporary cache for processing send/receive header matching
        this.creatingOffscreen = null; // Mutex gate to prevent concurrent offscreen creation loops
        this.recentKeysGate = new Set(); // Concurrency lock to prevent race conditions during captures

        // Per-tab dynamic network media traffic counters
        this.tabMediaCounts = {};

        // Per-tab season/episode reported by a Kodik player iframe (see
        // ContentScraper.watchKodikSeasonEpisode) - the top frame has no
        // visibility into that cross-origin frame's own DOM.
        this.kodikEpisodeByTab = {};

        // Queue of browser-relay ingest jobs (fetch/assemble in the browser,
        // then upload to MediaHost). In-memory only, like tabMediaCounts above -
        // a job holds a live Blob mid-flight which can't be serialized to
        // chrome.storage anyway, so persisting anything beyond a status snapshot
        // buys nothing (a killed service worker loses the job regardless).
        // Entries: {id, videoKey, label, status, progress, error, url, headers, meta}
        // status: 'queued' | 'downloading' | 'uploading' | 'optimizing' | 'completed' | 'failed'
        this.relayQueue = [];
        this.relayQueueRunning = false;
        this.relayJobSeq = 0;

        this.initListeners();
        this.initCachePruner();
    }

    initListeners() {
        // 1. Extension Lifecycle Initialization
        chrome.runtime.onInstalled.addListener(() => {
            chrome.storage.session.set({
                [Config.STORAGE.CAPTURED_VIDEOS]: {},
                [Config.STORAGE.ACTIVE_DOWNLOADS_MAP]: {}
            });
            this.dnrManager.clearImpersonationRules();
            chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
                .catch((err) => console.error("[Background Init] Sidepanel failure:", err));
        });

        // Clear per-tab media request counters on navigation/tab closing
        chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
            if (changeInfo.status === "loading") {
                this.tabMediaCounts[tabId] = { video: 0, image: 0, audio: 0, urls: new Set() };
                delete this.kodikEpisodeByTab[tabId];
            }
        });
        chrome.tabs.onRemoved.addListener((tabId) => {
            delete this.tabMediaCounts[tabId];
            delete this.kodikEpisodeByTab[tabId];
        });

        // 2. Intercept Outbound Network Header Metadata
        chrome.webRequest.onBeforeSendHeaders.addListener(
            (details) => this.handleBeforeSendHeaders(details),
            { urls: ["<all_urls>"] },
            ["requestHeaders", "extraHeaders"]
        );

        // 3. Inspect Inbound Headers for Active Media Types
        chrome.webRequest.onHeadersReceived.addListener(
            (details) => this.handleHeadersReceived(details),
            { urls: ["<all_urls>"] },
            ["responseHeaders"]
        );

        // 4. Central Messages Coordination Router
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleIncomingRuntimeMessages(request, sender, sendResponse);
            return true; // Keep channel open for asynchronous responses
        });

        // 5. Cleanup Local Progress Mappings on Download Completion
        chrome.downloads.onChanged.addListener((delta) => {
            if (delta.state && (delta.state.current === "complete" || delta.state.current === "interrupted")) {
                this.storageRepo.removeActiveDownload(delta.id);
            }
        });
    }

    handleBeforeSendHeaders(details) {
        if (details.url.includes(".ilow.io")) return; // Guard uplink infinity loops

        const isSpecialSegment = details.url.includes(":hls:seg-");
        if (!isSpecialSegment) {
            if (details.url.match(Config.NETWORK.IGNORED_EXTENSIONS) ||
                Config.NETWORK.IGNORED_SEGMENTS.some((seg) => details.url.includes(seg))) {
                return; // Filter out tracking metrics or static image noise
            }
        }

        let headerObj = {};
        if (details.requestHeaders) {
            details.requestHeaders.forEach((h) => (headerObj[h.name] = h.value));
        }

        this.requestCache[details.requestId] = {
            url: details.url,
            method: details.method,
            headers: headerObj,
            tabId: details.tabId,
            timestamp: Date.now()
        };
    }

    handleHeadersReceived(details) {
        if (details.statusCode >= 300 && details.statusCode < 400) {
            return;
        }

        // Network Traffic Counter Engine for Video, Audio, and Images
        if (details.tabId > 0) {
            if (!this.tabMediaCounts[details.tabId]) {
                this.tabMediaCounts[details.tabId] = { video: 0, image: 0, audio: 0, urls: new Set() };
            }

            const tabStats = this.tabMediaCounts[details.tabId];
            const cleanUrl = details.url.split("?")[0];
            const urlLower = cleanUrl.toLowerCase();
            const typeHeader = details.responseHeaders?.find((h) => h.name.toLowerCase() === "content-type")?.value.toLowerCase() || "";

            const isImg = typeHeader.startsWith("image/") || urlLower.match(/\.(jpg|jpeg|png|webp|svg|gif|avif)$/i);
            const isAud = typeHeader.startsWith("audio/") || urlLower.match(/\.(mp3|wav|ogg|aac|flac|m4a)$/i);
            const isVid = typeHeader.startsWith("video/") || urlLower.match(/\.(mp4|mkv|mov|avi|m3u8)$/i) || typeHeader.includes("mpegurl") || typeHeader.includes("dash+xml");

            if (!tabStats.urls.has(cleanUrl)) {
                if (isImg) {
                    tabStats.image++;
                    tabStats.urls.add(cleanUrl);
                } else if (isAud) {
                    tabStats.audio++;
                    tabStats.urls.add(cleanUrl);
                } else if (isVid) {
                    tabStats.video++;
                    tabStats.urls.add(cleanUrl);
                }
            }
        }

        const isSpecialSegment = details.url.includes(":hls:seg-");
        if (!isSpecialSegment && details.url.match(Config.NETWORK.IGNORED_EXTENSIONS)) return;

        const cachedRequest = this.requestCache[details.requestId];
        let finalUrl = cachedRequest ? cachedRequest.url : details.url;

        const typeHeader = details.responseHeaders?.find((h) => h.name.toLowerCase() === "content-type");
        const isVideoType = typeHeader && (
            typeHeader.value.toLowerCase().startsWith("video/") ||
            typeHeader.value.includes("mpegurl") ||
            typeHeader.value.includes("vnd.apple.mpegurl") ||
            typeHeader.value.includes("dash+xml")
        );
        const isVideoExt = finalUrl.match(/\.(mp4|mkv|mov|avi|m3u8)(\?|$|:)/i);

        if (isVideoType || isVideoExt || isSpecialSegment) {
            const serverFilename = this.getFilenameFromHeaders(details.responseHeaders);

            (async () => {
                // Smart URL Reconstruction
                if (isSpecialSegment) {
                    const segmentRegex = /(.+?)(:hls:seg-.+)$/i;
                    const match = finalUrl.match(segmentRegex);
                    if (match) finalUrl = match[1] + ":hls:manifest.m3u8";
                }

                const baseUniqueKey = UrlCleaner.getBaseKey(finalUrl);
                if (this.recentKeysGate.has(baseUniqueKey)) return;
                this.recentKeysGate.add(baseUniqueKey);
                setTimeout(() => this.recentKeysGate.delete(baseUniqueKey), Config.VIDEO.LOCK_TIMEOUT_MS);

                let isDuplicate = false;
                await this.storageRepo.updateCapturedVideos((videosMap) => {
                    if (videosMap[baseUniqueKey]) {
                        isDuplicate = true;
                        return videosMap;
                    }

                    // Hydrate and track inside our strict domain container
                    videosMap[baseUniqueKey] = new VideoAsset({
                        url: finalUrl,
                        method: cachedRequest ? cachedRequest.method : "GET",
                        headers: cachedRequest ? cachedRequest.headers : {},
                        tabId: cachedRequest ? cachedRequest.tabId : details.tabId,
                        serverFilename: serverFilename,
                        mimeType: isSpecialSegment ? "application/vnd.apple.mpegurl" : (typeHeader ? typeHeader.value : null)
                    });
                    return videosMap;
                });

                if (!isDuplicate) {
                    this.triggerOffscreenMetadataProcessing(baseUniqueKey, finalUrl);

                    // NEW FIX: Explicitly target the top frame (frameId: 0) to bypass 
                    // cross-origin video player iframes that don't have DOM metadata.
                    if (details.tabId > 0) {
                        chrome.tabs.sendMessage(
                            details.tabId,
                            { action: "extract_page_heuristics" },
                            { frameId: 0 },
                            (res) => {
                                // Clear lastError just in case the top frame hasn't loaded the script yet
                                if (chrome.runtime.lastError) return;

                                if (res && res.data) {
                                    // Merge in season/episode reported separately by a
                                    // cross-origin Kodik player iframe, if we've seen one
                                    // for this tab (see "kodik_episode_detected" above).
                                    const kodikInfo = this.kodikEpisodeByTab[details.tabId];
                                    if (kodikInfo) {
                                        res.data.mediaType = "tv";
                                        res.data.season = kodikInfo.season;
                                        res.data.episode = kodikInfo.episode;
                                    }

                                    this.storageRepo.updateCapturedVideos((vMap) => {
                                        if (vMap[baseUniqueKey]) {
                                            vMap[baseUniqueKey].heuristics = res.data;
                                        }
                                        return vMap;
                                    });
                                }
                            }
                        );
                    }
                }
            })();
        }
    }

    async triggerOffscreenMetadataProcessing(videoKey, targetUrl) {
        try {
            await this.ensureOffscreenContextExists();
            // Dispatch task to offscreen worker. Do not wait for response; 
            // rely on specific event listeners to handle the two-stage pipeline.
            chrome.runtime.sendMessage({
                action: "process_video_offscreen",
                videoKey: videoKey,
                url: targetUrl
            });
        } catch (e) {
            console.error("[Background Context] Failed to dispatch offscreen worker:", e);
        }
    }

    async handleIncomingRuntimeMessages(req, sender, sendResponse) {

        if (req.action === "kodik_episode_detected") {
            const tabId = sender.tab?.id;
            if (tabId) {
                this.kodikEpisodeByTab[tabId] = { season: req.season, episode: req.episode };

                // Back-fill ONLY assets that don't already have a season/episode
                // (i.e. this Kodik update arrived after heuristics were computed
                // for a video that's still missing it) - never assets that already
                // have one set. Without this guard, switching episodes in the
                // Kodik player later on would retroactively relabel every already-
                // discovered older episode on this tab to match the new selection,
                // since they'd all still match `asset.tabId === tabId`.
                await this.storageRepo.updateCapturedVideos((vMap) => {
                    for (const key in vMap) {
                        const asset = vMap[key];
                        if (asset.tabId === tabId && asset.heuristics && !asset.heuristics.season && !asset.heuristics.episode) {
                            asset.heuristics.mediaType = "tv";
                            asset.heuristics.season = req.season;
                            asset.heuristics.episode = req.episode;
                        }
                    }
                    return vMap;
                });
            }
            return;
        }

        if (req.action === "delayed_metadata_capture") {
            // Acknowledge the delayed metadata from sleeping video elements
            sendResponse({ received: true });
            return;
        }
        // --- STAGE 1: Fast Metadata Unblocks UI ---
        if (req.action === "offscreen_metadata_ready") {
            await this.storageRepo.updateCapturedVideos((videosMap) => {
                if (videosMap[req.videoKey]) {
                    videosMap[req.videoKey].duration = req.data.duration;
                    videosMap[req.videoKey].thumbnail = req.data.thumbnail;
                    videosMap[req.videoKey].resolution = { width: req.data.width, height: req.data.height };
                    videosMap[req.videoKey].processed = true;
                }
                return videosMap;
            });
            return;
        }

        // --- STAGE 2: Silent Background Deduplication ---
        if (req.action === "offscreen_hash_ready") {
            await this.storageRepo.updateCapturedVideos((videosMap) => {
                const currentAsset = videosMap[req.videoKey];
                if (!currentAsset) return videosMap;

                currentAsset.contentHash = req.contentHash;

                // Look for existing streams matching this visual fingerprint
                const existingKey = Object.keys(videosMap).find(
                    (k) => k !== req.videoKey && videosMap[k].contentHash === req.contentHash
                );

                if (existingKey) {
                    const existingAsset = videosMap[existingKey];
                    // Overwrite duplicate with the newest valid link details
                    existingAsset.url = currentAsset.url;
                    if (currentAsset.headers) existingAsset.headers = currentAsset.headers;
                    if (currentAsset.serverFilename) existingAsset.serverFilename = currentAsset.serverFilename;

                    // Ensure heuristics carry over during link deduplication, but never
                    // regress an already-resolved season/episode (e.g. Kodik-backfilled -
                    // see kodik_episode_detected above): the re-captured duplicate's own
                    // heuristics come from a fresh top-frame extraction that hasn't been
                    // backfilled yet, so a blind overwrite here was wiping out season/
                    // episode every time the same stream got re-captured under a new URL
                    // (which happens routinely as HLS manifests get freshly re-signed).
                    if (currentAsset.heuristics) {
                        const resolvedSeason = existingAsset.heuristics?.season;
                        const resolvedEpisode = existingAsset.heuristics?.episode;
                        existingAsset.heuristics = { ...currentAsset.heuristics };
                        if (resolvedSeason && resolvedEpisode) {
                            existingAsset.heuristics.mediaType = "tv";
                            existingAsset.heuristics.season = resolvedSeason;
                            existingAsset.heuristics.episode = resolvedEpisode;
                        }
                    }

                    existingAsset.capturedAt = Date.now(); // Prioritize latest timeline

                    // Purge the temporary standalone record to merge them
                    delete videosMap[req.videoKey];
                }
                return videosMap;
            });
            return;
        }

        if (req.action === "get_tab_media_counts") {
            const counts = this.tabMediaCounts[req.tabId] || { video: 0, image: 0, audio: 0 };
            sendResponse({ video: counts.video, image: counts.image, audio: counts.audio });
            return;
        }

        if (req.action === "get_videos") {
            const videosMap = await this.storageRepo.getCapturedVideos();
            const allAssets = Object.values(videosMap);
            const uniquePathDeduplicator = new Set();
            const clientPayload = [];

            // Sort heuristics: prioritized complete, processed thumbnails first
            allAssets.sort((a, b) => {
                const scoreA = (a.duration ? 10 : 0) + (a.thumbnail ? 10 : 0);
                const scoreB = (b.duration ? 10 : 0) + (b.thumbnail ? 10 : 0);
                if (scoreA !== scoreB) return scoreB - scoreA;
                return b.capturedAt - a.capturedAt;
            });

            for (const asset of allAssets) {
                let payloadAsset = { ...asset, status: "ready" };
                // Domain protective guard check with pending status inclusion
                if (!asset.isValidForScanner()) {
                    payloadAsset.status = "pending";
                    payloadAsset.missingInfo = !asset.duration ? "duration" : "thumbnail";
                }

                const uniquePath = UrlCleaner.getUrlPath(asset.url);
                if (uniquePathDeduplicator.has(uniquePath)) continue;
                uniquePathDeduplicator.add(uniquePath);
                clientPayload.push(payloadAsset);
            }

            sendResponse(clientPayload);
        }

        if (req.action === "clear_videos") {
            await chrome.storage.session.set({ [Config.STORAGE.CAPTURED_VIDEOS]: {} });
            sendResponse({ success: true });
        }

        if (req.action === "dismiss_video") {
            await this.storageRepo.updateCapturedVideos((videosMap) => {
                delete videosMap[req.key];
                return videosMap;
            });
            sendResponse({ success: true });
            return;
        }

        if (req.action === "download_video") {
            this.executeDownloadPipeline(req.url, req.filename);
        }

        if (req.action === "relay_progress") {
            const job = this.relayQueue.find((j) => j.id === req.jobId);
            if (job) {
                job.status = req.status;
                job.progress = req.progress;
                if (req.uploadId) job.uploadId = req.uploadId;
            }
            return;
        }

        if (req.action === "get_relay_queue") {
            sendResponse(this.relayQueue);
            return;
        }

        if (req.action === "enqueue_relay_ingest") {
            // Dedup: don't let the same captured video be queued twice while an
            // earlier attempt for it is still queued/running (a failed entry can
            // be retried by re-enqueueing).
            const alreadyQueued = this.relayQueue.some(
                (j) => j.videoKey === req.videoKey && j.status !== "failed"
            );
            if (!alreadyQueued) {
                this.relayQueue.push({
                    id: ++this.relayJobSeq,
                    videoKey: req.videoKey,
                    label: req.meta?.fileName || "Untitled",
                    status: "queued",
                    progress: 0,
                    error: null,
                    url: req.url,
                    headers: req.headers,
                    meta: req.meta
                });
                this.processRelayQueue();
            }
            sendResponse({ success: true });
            return;
        }

        if (req.action === "execute_network_fetch") {
            // Perform standard browser fetch - Chrome automatically attaches 
            // the user's live 'ory_kratos_session' cookie from host permissions.
            fetch(`${Config.API.BASE_URL}${req.endpoint}`, {
                method: req.options?.method || "GET",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    ...(req.options?.headers || {})
                },
                body: req.options?.body ? req.options.body : undefined,
                credentials: "include" // Indistinguishable from real user browser navigation
            })
                .then(async (response) => {
                    if (response.status === 401) {
                        sendResponse({ success: false, status: 401, error: "Unauthorized" });
                        return;
                    }
                    if (!response.ok) {
                        sendResponse({ success: false, status: response.status, error: `HTTP ${response.status}` });
                        return;
                    }
                    const data = await response.json();
                    sendResponse({ success: true, data });
                })
                .catch((err) => sendResponse({ success: false, error: err.message }));

            return true; // Keep message channel open for async response
        }

        sendResponse({ received: false, error: "Unhandled message action" });
    }

    async executeDownloadPipeline(url, suggestedName) {
        try {
            const videosMap = await this.storageRepo.getCapturedVideos();
            const targetAsset = Object.values(videosMap).find((v) => v.url === url);

            const headers = targetAsset ? targetAsset.headers : {};
            const finalFilename = targetAsset?.serverFilename ? targetAsset.serverFilename : suggestedName;

            await this.dnrManager.setupImpersonationRules(url, headers);

            if (targetAsset?.isHls || UrlCleaner.isHlsUrl(url)) {
                await this.ensureOffscreenContextExists();
                const response = await chrome.runtime.sendMessage({
                    action: "download_hls_offscreen",
                    url: url,
                    headers: headers
                });

                if (!response || !response.success) {
                    throw new Error(response ? response.error : "Offscreen stream aggregation failed.");
                }

                const scrubbedFilename = finalFilename.replace(/\.(m3u8|mp4|mkv)$/i, "") + ".ts";
                chrome.downloads.download({
                    url: response.blobUrl,
                    filename: "IlowCaps/" + scrubbedFilename,
                    saveAs: false
                }, (downloadId) => {
                    if (!chrome.runtime.lastError && downloadId) {
                        this.storageRepo.mapDownloadToUrl(downloadId, url);
                    }
                });
                await this.dnrManager.clearImpersonationRules();
            } else {
                // Straight Direct File Downloads Line
                chrome.downloads.download({
                    url: url,
                    filename: "IlowCaps/" + finalFilename,
                    saveAs: false
                }, (downloadId) => {
                    if (downloadId) this.storageRepo.mapDownloadToUrl(downloadId, url);
                });
                setTimeout(() => this.dnrManager.clearImpersonationRules(), 5000);
            }
        } catch (err) {
            console.error("[Download Pipeline] Execution failed:", err);
            await this.dnrManager.clearImpersonationRules();
        }
    }

    async ensureOffscreenContextExists() {
        const activeContexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
        if (activeContexts.length > 0) return;

        if (this.creatingOffscreen) {
            await this.creatingOffscreen;
        } else {
            this.creatingOffscreen = chrome.offscreen.createDocument({
                url: Config.PATHS.OFFSCREEN_DOCUMENT,
                reasons: ["DOM_SCRAPING", "BLOBS"],
                justification: "Generate video thumbnails and process HLS downloads"
            });
            await this.creatingOffscreen;
            this.creatingOffscreen = null;
        }
    }

    /**
     * Server-side offload (MediaHost fetching the URL itself via /download/url)
     * is far more efficient than browser-relay when it works - no browser
     * bandwidth spent re-uploading what was just downloaded - so it's always
     * tried first. voidboost/rezka wrap an already-direct MP4 URL in the same
     * ":hls:manifest.m3u8" marker Kodik uses for a real manifest (see
     * PopupController's old truncation comment); for THOSE two sites the
     * truncated (direct MP4) form is the more likely one to work standalone,
     * so try it before falling back to the untruncated original. Any other
     * site just gets the one, untruncated URL.
     */
    getServerOffloadUrlVariants(url) {
        if (url.includes("voidboost") || url.includes("rezka")) {
            const truncated = url.replace(/:hls:manifest\.m3u8$/i, "");
            if (truncated !== url) return [truncated, url];
        }
        return [url];
    }

    /**
     * Kicks off a server-side /download/url fetch and does a bounded health
     * check - NOT a full-completion wait, since a legitimately slow (but
     * working) transfer/optimize can take minutes. Bails out fast on a
     * definitive failure; on any real sign of life (bytes actually flowing, or
     * having reached the post-download "optimizing" stage) trusts the server
     * to finish the rest on its own and hands off display duty to the normal
     * /api/tasks/active polling. Only a source that produces zero progress for
     * the whole check window is treated as "offload not supported here".
     */
    async tryServerOffload(url, meta, headers) {
        try {
            const initRes = await fetch(`${Config.API.BASE_URL}/download/url`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url,
                    tmdbId: meta.tmdbId,
                    mediaType: meta.mediaType,
                    season: meta.season || 0,
                    episode: meta.episode || 0,
                    originalName: meta.fileName,
                    headers: headers || {}
                })
            });
            if (!initRes.ok) return false;
            const { downloadId } = await initRes.json();
            if (!downloadId) return false;

            const CHECK_ATTEMPTS = 10;
            const CHECK_INTERVAL_MS = 2000;
            for (let i = 0; i < CHECK_ATTEMPTS; i++) {
                await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL_MS));

                const statusRes = await fetch(`${Config.API.BASE_URL}/download/${downloadId}/status`, {
                    credentials: "include"
                });
                if (!statusRes.ok) continue;
                const state = await statusRes.json();

                if (state.status === "completed") return true;
                if (state.status === "failed") return false;
                if (state.status === "optimizing" || state.bytesDownloaded > 0) return true;
            }
            return false; // no progress within the check window - treat as unsupported
        } catch (e) {
            return false;
        }
    }

    /**
     * Drains this.relayQueue sequentially, one job at a time. Re-entrant calls
     * (from enqueue_relay_ingest while a job is already running) are no-ops -
     * the currently-running loop will pick up the newly queued job itself.
     */
    async processRelayQueue() {
        if (this.relayQueueRunning) return;
        this.relayQueueRunning = true;

        try {
            let job;
            while ((job = this.relayQueue.find((j) => j.status === "queued"))) {
                try {
                    job.status = "checking";
                    let offloaded = false;
                    for (const variant of this.getServerOffloadUrlVariants(job.url)) {
                        if (await this.tryServerOffload(variant, job.meta, job.headers)) {
                            offloaded = true;
                            break;
                        }
                    }

                    if (offloaded) {
                        // MediaHost is fetching it directly from here - tracked via
                        // the normal /api/tasks/active polling from this point on,
                        // not this queue entry (see Popup.vue's status filter).
                        job.status = "offloaded";
                        job.finishedAt = Date.now();
                        continue;
                    }

                    // Offload didn't pan out for any URL variant - fall back to
                    // relaying the ORIGINAL (untruncated) URL through the browser;
                    // the offscreen HLS assembly needs the real manifest URL and is
                    // unaffected by the voidboost/rezka truncation above, which only
                    // ever mattered for a standalone server-side fetch.
                    job.status = "downloading";
                    job.progress = 0;

                    // Referer/Origin/User-Agent can't be set from a plain fetch() in
                    // the offscreen document (forbidden headers, silently dropped) -
                    // only declarativeNetRequest (background-only) can inject them at
                    // the network layer, same as the local-download pipeline already
                    // does for the same class of Referer-protected sources.
                    await this.dnrManager.setupImpersonationRules(job.url, job.headers);
                    await this.ensureOffscreenContextExists();
                    const response = await chrome.runtime.sendMessage({
                        action: "relay_ingest_upload",
                        url: job.url,
                        headers: job.headers,
                        meta: job.meta,
                        jobId: job.id
                    });

                    if (response && response.success) {
                        job.status = "completed";
                        job.progress = 100;
                    } else {
                        job.status = "failed";
                        job.error = response?.error || "Relay upload failed.";
                    }
                } catch (e) {
                    job.status = "failed";
                    job.error = e.message;
                } finally {
                    await this.dnrManager.clearImpersonationRules();
                    if (!job.finishedAt && (job.status === "completed" || job.status === "failed")) {
                        job.finishedAt = Date.now();
                    }
                }
            }
        } finally {
            this.relayQueueRunning = false;
        }
    }

    getFilenameFromHeaders(headers) {
        if (!headers) return null;
        const cd = headers.find((h) => h.name.toLowerCase() === "content-disposition");
        if (!cd || !cd.value) return null;

        let match = cd.value.match(/filename\*=UTF-8''([\w%\-\.]+)(?:;|$)/i);
        if (match && match[1]) return decodeURIComponent(match[1]);

        match = cd.value.match(/filename="([^"]+)"/i);
        if (match && match[1]) return match[1];

        match = cd.value.match(/filename=([^;]+)/i);
        if (match && match[1]) return match[1].trim();

        return null;
    }

    initCachePruner() {
        setInterval(async () => {
            const now = Date.now();

            // Clean active request header cache
            for (const id in this.requestCache) {
                if (now - this.requestCache[id].timestamp > 60000) delete this.requestCache[id];
            }

            // Drop finished relay queue entries a while after they settle, so the
            // popup has time to show the final completed/failed state.
            this.relayQueue = this.relayQueue.filter(
                (j) => !j.finishedAt || (now - j.finishedAt < 10000)
            );

            // GC: Purge Empty Media Candidates lingering in storage
            await this.storageRepo.updateCapturedVideos((videosMap) => {
                for (const key in videosMap) {
                    const asset = videosMap[key];
                    // If an asset sits for 45s and never gathers valid duration metadata, kill it.
                    if (!asset.isHls && asset.duration === 0 && (now - asset.capturedAt > 45000)) {
                        delete videosMap[key];
                    }
                }
                return videosMap;
            });
        }, 30000);
    }
}

// Start Background Controller orchestrations
new BackgroundController();