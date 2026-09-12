import { ThumbnailGenerator } from "../../infrastructure/canvas/ThumbnailGenerator.js";
import { MetadataHeuristicsEngine } from "../../domain/heuristics/MetadataHeuristicsEngine.js";

/**
 * Content Script Adapter running inside isolated webpage contexts.
 * Discovers and parses active DOM media instances, including Shadow DOM boundaries.
 */
class ContentScraper {
    constructor() {
        this.initMessageListener();
        this.watchKodikSeasonEpisode();
    }

    /**
     * Sites like YummyAnime embed a third-party Kodik player in a cross-origin
     * <iframe> (kodikplayer.com and its mirrors). Its season/episode <select>
     * UI (.serial-panel) lives inside that frame's own document, never on the
     * host page, so `extract_page_heuristics` (which only ever queries the top
     * frame) can never see it. This content script also runs inside that iframe
     * directly (manifest matches <all_urls>, all_frames: true), so instead it
     * polls locally for the panel and pushes season/episode to the background
     * service worker whenever the selection changes; it's a silent no-op in
     * every frame that never has a Kodik panel.
     */
    watchKodikSeasonEpisode() {
        let lastKey = null;
        setInterval(() => {
            if (!document.querySelector(".serial-panel")) return;

            const seasonSelect = document.querySelector(".serial-seasons-box select");
            const episodeSelect = document.querySelector(".serial-series-box select");
            const season = parseInt(seasonSelect?.value, 10) || 1;
            const episode = parseInt(episodeSelect?.value, 10) || 1;

            const key = `${season}:${episode}`;
            if (key === lastKey) return;
            lastKey = key;

            // sendMessage can throw synchronously (not just reject) once the
            // extension is reloaded and this already-injected content script's
            // context is invalidated - only a page refresh fixes that, so just
            // swallow it rather than spamming an uncaught error every second
            // until the user reloads the tab.
            try {
                chrome.runtime.sendMessage({ action: "kodik_episode_detected", season, episode }).catch(() => { });
            } catch (e) { }
        }, 1000);
    }

    initMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "get_video_metadata") {
                this.handleMetadataScan(sendResponse);
                return; // Synchronous, no return needed
            }

            if (request.action === "get_media_counts") {
                this.handleMediaCounts(sendResponse);
                return; // Synchronous, no return needed
            }

            if (request.action === "extract_page_heuristics") {
                // Prevent iframes (like Voidboost video players) from intercepting
                // this request since they don't have the parent page's title elements.
                if (window !== window.top) return;

                const data = MetadataHeuristicsEngine.extractMetadata(document, window.location.href);
                sendResponse({ success: true, data });
                return; // Synchronous, no return needed
            }
        });
    }

    handleMediaCounts(sendResponse) {
        const counts = { video: 0, image: 0, audio: 0 };

        const scan = (root = document) => {
            counts.video += root.querySelectorAll("video").length;
            counts.image += root.querySelectorAll("img").length;
            counts.audio += root.querySelectorAll("audio").length;

            const allNodes = root.querySelectorAll("*");
            allNodes.forEach((node) => {
                if (node.shadowRoot) {
                    scan(node.shadowRoot);
                }
            });
        };

        scan();
        sendResponse(counts);
    }

    findVideoElements(root = document, found = []) {
        const videos = root.querySelectorAll("video");
        videos.forEach(v => found.push(v));

        const allNodes = root.querySelectorAll("*");
        allNodes.forEach(node => {
            if (node.shadowRoot) {
                this.findVideoElements(node.shadowRoot, found);
            }
        });

        return found;
    }

    handleMetadataScan(sendResponse) {
        const videoElements = this.findVideoElements();

        if (videoElements.length === 0) {
            sendResponse({ found: false });
            return;
        }

        let targetVideo = null;
        let maxVisibleArea = 0;

        for (const video of videoElements) {
            const rect = video.getBoundingClientRect();
            const area = rect.width * rect.height;
            const style = window.getComputedStyle(video);

            const isVisible = style.visibility !== "hidden" && style.display !== "none" && area > 0;

            if (isVisible && area > maxVisibleArea) {
                maxVisibleArea = area;
                targetVideo = video;
            }
        }

        if (targetVideo) {
            if (targetVideo.readyState > 0) {
                this.extractAndSend(targetVideo, sendResponse);
            } else {
                targetVideo.addEventListener("loadedmetadata", () => {
                    this.broadcastDelayedCapture(targetVideo);
                }, { once: true });

                sendResponse({ found: true, status: "pending", pageTitle: document.title });
            }
        } else {
            sendResponse({ found: false });
        }
    }

    extractAndSend(video, sendResponse) {
        let duration = video.duration;
        if (!Number.isFinite(duration)) duration = 0;

        const thumbnailData = ThumbnailGenerator.extractFrameAsDataUrl(video);

        sendResponse({
            found: true,
            status: "ready",
            duration: duration,
            thumbnail: thumbnailData,
            pageTitle: document.title
        });
    }

    broadcastDelayedCapture(video) {
        let duration = video.duration;
        if (!Number.isFinite(duration)) duration = 0;

        const thumbnailData = ThumbnailGenerator.extractFrameAsDataUrl(video);

        try {
            chrome.runtime.sendMessage({
                action: "delayed_metadata_capture",
                payload: {
                    duration: duration,
                    thumbnail: thumbnailData,
                    pageTitle: document.title
                }
            }).catch(() => { });
        } catch (e) { }
    }
}

new ContentScraper();