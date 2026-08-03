import { ThumbnailGenerator } from "../../infrastructure/canvas/ThumbnailGenerator.js";
import { MetadataHeuristicsEngine } from "../../domain/heuristics/MetadataHeuristicsEngine.js";

/**
 * Content Script Adapter running inside isolated webpage contexts.
 * Discovers and parses active DOM media instances, including Shadow DOM boundaries.
 */
class ContentScraper {
    constructor() {
        this.initMessageListener();
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

        chrome.runtime.sendMessage({
            action: "delayed_metadata_capture",
            payload: {
                duration: duration,
                thumbnail: thumbnailData,
                pageTitle: document.title
            }
        });
    }
}

new ContentScraper();