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
            }
        });
        chrome.tabs.onRemoved.addListener((tabId) => {
            delete this.tabMediaCounts[tabId];
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
            this.handleIncomingRuntimeMessages(request, sendResponse);
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

    async handleIncomingRuntimeMessages(req, sendResponse) {

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

                    // Ensure heuristics carry over during link deduplication
                    if (currentAsset.heuristics) existingAsset.heuristics = currentAsset.heuristics;

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

        if (req.action === "download_video") {
            this.executeDownloadPipeline(req.url, req.filename);
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