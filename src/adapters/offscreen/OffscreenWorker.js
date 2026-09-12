import { ThumbnailGenerator } from "../../infrastructure/canvas/ThumbnailGenerator.js";
import { BrowserHttpClient } from "../../infrastructure/network/BrowserHttpClient.js";
import { HlsParser } from "../../domain/processing/services/HlsParser.js";
import { Decryptor } from "../../domain/processing/services/Decryptor.js";
import { UrlCleaner } from "../../domain/capture/services/UrlCleaner.js";
import { Config } from "../../shared/Config.js";

/**
 * Offscreen DOM Worker Adapter.
 * Orchestrates heavy background processing, video data seeking, and file reconstruction.
 */
class OffscreenWorker {
    constructor() {
        this.httpClient = new BrowserHttpClient();
        this.initMessageListener();
    }

    initMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === "process_video_offscreen") {
                this.processVideoAnalysis(message.videoKey, message.url);
                return false;
            }

            if (message.action === "download_hls_offscreen") {
                this.processHlsStreamAssembly(message.url, message.headers, sendResponse);
                return true;
            }

            if (message.action === "relay_ingest_upload") {
                this.processRelayIngest(message.url, message.headers, message.meta, message.jobId, sendResponse);
                return true;
            }
        });
    }

    async processVideoAnalysis(videoKey, videoUrl) {
        const video = document.getElementById("video-renderer");
        let isCleanedUp = false;

        const timeoutTimer = setTimeout(() => {
            cleanup();
        }, 15000);

        const cleanup = () => {
            if (isCleanedUp) return;
            isCleanedUp = true;
            clearTimeout(timeoutTimer);
            video.removeAttribute("src");
            video.load();
            video.onloadeddata = null;
            video.onerror = null;
        };

        const seekTo = (time) => new Promise((resolve, reject) => {
            const onSeek = () => {
                video.removeEventListener("seeked", onSeek);
                video.removeEventListener("error", onError);
                resolve();
            };
            const onError = (e) => {
                video.removeEventListener("seeked", onSeek);
                video.removeEventListener("error", onError);
                reject(e);
            };
            video.addEventListener("seeked", onSeek);
            video.addEventListener("error", onError);
            video.currentTime = time;
        });

        video.crossOrigin = "use-credentials";
        video.src = videoUrl;
        video.muted = true;

        video.onloadeddata = async () => {
            try {
                let duration = video.duration;
                if (!Number.isFinite(duration)) duration = 0;

                // --- STAGE 1: Fast Path ---
                const thumbTime = Math.min(5, duration * 0.1);
                await seekTo(thumbTime);
                const thumbnail = ThumbnailGenerator.extractFrameAsDataUrl(video);

                // FIX: Catch unhandled promise rejections if the background script drops the channel
                chrome.runtime.sendMessage({
                    action: "offscreen_metadata_ready",
                    videoKey: videoKey,
                    data: { thumbnail, duration, width: video.videoWidth, height: video.videoHeight }
                }).catch(() => { });

                // --- STAGE 2: Slow Path (Visual Hash Deduplication) ---
                const hashCanvas = document.createElement("canvas");
                hashCanvas.width = 16;
                hashCanvas.height = 16;
                const hashCtx = hashCanvas.getContext("2d", { willReadFrequently: true });

                const sampleTimes = [0.5, 1.5, 2.5].filter((t) => t <= (duration || 3));
                const frameBuffers = [];

                for (const time of sampleTimes) {
                    await seekTo(time);
                    hashCtx.drawImage(video, 0, 0, 16, 16);
                    frameBuffers.push(hashCtx.getImageData(0, 0, 16, 16).data);
                }

                let contentHash = null;
                if (frameBuffers.length > 0) {
                    const totalLength = frameBuffers.reduce((sum, buf) => sum + buf.length, 0);
                    const combined = new Uint8Array(totalLength);
                    let offset = 0;
                    for (const buf of frameBuffers) {
                        combined.set(buf, offset);
                        offset += buf.length;
                    }
                    const digest = await crypto.subtle.digest("SHA-256", combined);
                    contentHash = Array.from(new Uint8Array(digest))
                        .map((b) => b.toString(16).padStart(2, "0"))
                        .join("");
                }

                if (contentHash) {
                    // FIX: Catch unhandled promise rejections
                    chrome.runtime.sendMessage({
                        action: "offscreen_hash_ready",
                        videoKey: videoKey,
                        contentHash: contentHash
                    }).catch(() => { });
                }
            } catch (err) {
                console.warn("[Offscreen Worker] Video analysis failed silently:", err);
            } finally {
                cleanup();
            }
        };

        video.onerror = () => {
            chrome.runtime.sendMessage({
                action: "offscreen_metadata_ready",
                videoKey: videoKey,
                data: { thumbnail: null, duration: 0, width: 0, height: 0 }
            }).catch(() => { });
            cleanup();
        };
    }

    async processHlsStreamAssembly(masterUrl, customHeaders, sendResponse) {
        try {
            const combinedMpegTsBlob = await this.assembleHlsBlob(masterUrl, customHeaders);
            const distributionUrl = URL.createObjectURL(combinedMpegTsBlob);
            sendResponse({ success: true, blobUrl: distributionUrl });
        } catch (assemblyError) {
            console.error("[Offscreen Assembly Engine] Processing failed:", assemblyError);
            sendResponse({ success: false, error: assemblyError.message });
        }
    }

    /**
     * Fetches and reassembles an HLS stream (master or media playlist) into a
     * single playable Blob. Shared by the local-download path (which wraps the
     * result in an object URL) and the server-relay upload path (which uploads
     * the Blob directly) so the manifest/segment/decrypt logic lives in one place.
     */
    async assembleHlsBlob(masterUrl, customHeaders, onSegmentProgress) {
        const manifestText = await this.httpClient.getResponseText(masterUrl, customHeaders);
        let targetPlaylistUrl = masterUrl;
        let manifestToParse = manifestText;

        if (HlsParser.isMasterPlaylist(manifestText)) {
            targetPlaylistUrl = HlsParser.getBestVariantUrl(manifestText, masterUrl);
            manifestToParse = await this.httpClient.getResponseText(targetPlaylistUrl, customHeaders);
        }

        const segmentDefinitions = HlsParser.parseMediaPlaylist(manifestToParse, targetPlaylistUrl);
        if (segmentDefinitions.length === 0) throw new Error("No media segments located inside stream layout.");

        const binaryChunks = await this.downloadAndDecryptSegmentsInBatches(segmentDefinitions, 5, customHeaders, onSegmentProgress);
        return new Blob(binaryChunks, { type: "video/mp2t" });
    }

    /**
     * Fetches a video (via the browser's own IP/cookies/TLS stack - bypassing
     * server-side anti-hotlink/IP-binding CDN restrictions the server can never
     * satisfy) and uploads the resulting bytes straight to MediaHost's existing
     * resumable upload API, instead of asking the server to fetch the URL itself.
     * jobId identifies this job's entry in BackgroundController's relay queue so
     * progress messages can be routed to the right queue item.
     */
    async processRelayIngest(url, headers, meta, jobId, sendResponse) {
        const reportStage = (status, progress, uploadId) => {
            chrome.runtime.sendMessage({ action: "relay_progress", jobId, status, progress, uploadId }).catch(() => { });
        };

        try {
            reportStage("downloading", 0);
            const isHls = UrlCleaner.isHlsUrl(url);
            const blob = isHls
                ? await this.assembleHlsBlob(url, headers, (completed, total) => {
                    reportStage("downloading", total > 0 ? Math.round((completed / total) * 100) : 0);
                })
                : await this.fetchDirectFileBlob(url, headers);

            const accessCode = await this.uploadBlobToServer(blob, meta, {
                // Once the server has issued an uploadId, it's tracking this job
                // itself (visible via /api/tasks/active with real byte-level
                // upload progress and real ffmpeg optimize progress) - report it
                // so the popup can switch from our own placeholder card to the
                // server-tracked one instead of showing both.
                onUploadIdKnown: (uploadId) => reportStage("uploading", 0, uploadId),
                onUploadProgress: (sent, total, uploadId) => {
                    reportStage("uploading", total > 0 ? Math.round((sent / total) * 100) : 0, uploadId);
                },
                onOptimizing: (uploadId) => reportStage("optimizing", null, uploadId)
            });

            sendResponse({ success: true, accessCode });
        } catch (relayError) {
            console.error("[Offscreen Relay Ingest] Failed:", relayError);
            sendResponse({ success: false, error: relayError.message });
        }
    }

    async fetchDirectFileBlob(url, headers) {
        const cleanHeaders = BrowserHttpClient.sanitizeHeaders(headers);
        const response = await fetch(url, { headers: cleanHeaders, credentials: "include" });
        if (!response.ok) {
            throw new Error(`Direct file fetch failed - Status: ${response.status}`);
        }
        return await response.blob();
    }

    async uploadBlobToServer(blob, meta, { onUploadIdKnown, onUploadProgress, onOptimizing } = {}) {
        const initResponse = await fetch(`${Config.API.BASE_URL}/upload/initiate`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fileName: meta.fileName,
                fileSize: blob.size,
                tmdbId: meta.tmdbId,
                mediaType: meta.mediaType,
                season: meta.season || 0,
                episode: meta.episode || 0
            })
        });
        if (!initResponse.ok) {
            throw new Error(`Upload initiate failed - Status: ${initResponse.status}`);
        }
        const { uploadId } = await initResponse.json();
        if (onUploadIdKnown) onUploadIdKnown(uploadId);

        const chunkSize = 5 * 1024 * 1024;
        let offset = 0;
        while (offset < blob.size) {
            const end = Math.min(offset + chunkSize, blob.size);
            const chunk = blob.slice(offset, end);

            const chunkResponse = await fetch(`${Config.API.BASE_URL}/upload/${uploadId}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Range": `bytes ${offset}-${end - 1}/${blob.size}` },
                body: chunk
            });
            if (!chunkResponse.ok) {
                throw new Error(`Upload chunk failed - Status: ${chunkResponse.status}`);
            }

            offset = end;
            if (onUploadProgress) onUploadProgress(offset, blob.size, uploadId);
        }

        // The server marks this upload "optimizing" (internal.storage.Store) and
        // runs ffmpeg CMAF repackaging synchronously before this call resolves -
        // this is our one hook to reflect that stage locally.
        if (onOptimizing) onOptimizing(uploadId);

        const completeResponse = await fetch(`${Config.API.BASE_URL}/upload/${uploadId}/complete`, {
            method: "POST",
            credentials: "include"
        });

        // A 409 Conflict means the file already exists (duplicate detected by
        // hash) - the server still returns the usable accessCode in that case.
        if (!completeResponse.ok && completeResponse.status !== 409) {
            throw new Error(`Upload finalize failed - Status: ${completeResponse.status}`);
        }

        const result = await completeResponse.json();
        return result.accessCode;
    }

    async downloadAndDecryptSegmentsInBatches(segments, concurrencyLimit, headers, onSegmentProgress) {
        const totalCount = segments.length;
        const outputBuffers = new Array(totalCount);
        const decryptionKeyCache = {};
        let rollingIndex = 0;
        let completedCount = 0;

        const workerThread = async () => {
            while (rollingIndex < totalCount) {
                const currentTaskIndex = rollingIndex++;
                const segment = segments[currentTaskIndex];

                try {
                    let fragmentBuffer = await this.httpClient.getResponseBuffer(segment.url, headers);

                    if (segment.key && segment.key.method === "AES-128") {
                        const cryptoKey = await this.resolveCryptoKeyViaCache(segment.key, headers, decryptionKeyCache);

                        if (cryptoKey) {
                            const ivBuffer = segment.key.iv
                                ? Decryptor.parseHexIV(segment.key.iv)
                                : Decryptor.createIVFromSequence(segment.seq);

                            fragmentBuffer = await Decryptor.decryptSegment(fragmentBuffer, cryptoKey, ivBuffer);
                        }
                    }

                    outputBuffers[currentTaskIndex] = fragmentBuffer;
                } catch (segmentError) {
                    console.error(`[Offscreen Engine] Segment collection failure at index ${currentTaskIndex}:`, segmentError);
                    outputBuffers[currentTaskIndex] = new ArrayBuffer(0);
                } finally {
                    completedCount++;
                    if (onSegmentProgress) onSegmentProgress(completedCount, totalCount);
                }
            }
        };

        const workerPool = Array.from({ length: concurrencyLimit }, () => workerThread());
        await Promise.all(workerPool);

        return outputBuffers;
    }

    async resolveCryptoKeyViaCache(keyInfo, headers, cacheRef) {
        if (!keyInfo || !keyInfo.uri) return null;
        if (cacheRef[keyInfo.uri]) return cacheRef[keyInfo.uri];

        try {
            const rawKeyBuffer = await this.httpClient.getResponseBuffer(keyInfo.uri, headers);
            const cryptoKey = await Decryptor.importRawKey(rawKeyBuffer);
            cacheRef[keyInfo.uri] = cryptoKey;
            return cryptoKey;
        } catch (e) {
            console.warn("[Offscreen Key Collector] Key acquisition failed:", keyInfo.uri, e);
            return null;
        }
    }
}

new OffscreenWorker();