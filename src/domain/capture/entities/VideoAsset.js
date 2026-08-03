import { UrlCleaner } from "../services/UrlCleaner.js";
import { Config } from "../../../shared/Config.js";

/**
 * Domain Entity representing a captured video asset.
 * Guarantees internal structural data validity (Invariants).
 */
export class VideoAsset {
    constructor({
        url,
        method = "GET",
        headers = {},
        tabId = null,
        duration = null,
        thumbnail = null,
        resolution = null,
        processed = false,
        capturedAt = Date.now(),
        serverFilename = null,
        mimeType = null,
        contentHash = null,
        heuristics = null // <-- MUST BE HERE TO SURVIVE STORAGE HYDRATION
    }) {
        if (!url) {
            throw new Error("Domain Rule Violation: VideoAsset must possess a source URL.");
        }

        this.url = url;
        this.key = UrlCleaner.getBaseKey(url);
        this.method = method;
        this.headers = { ...headers };
        this.tabId = tabId;
        this.duration = Number.isFinite(duration) ? duration : 0;
        this.thumbnail = thumbnail;
        this.resolution = resolution ? { width: resolution.width, height: resolution.height } : null;
        this.processed = !!processed;
        this.capturedAt = capturedAt;
        this.serverFilename = serverFilename;
        this.mimeType = mimeType;
        this.contentHash = contentHash;
        this.heuristics = heuristics; // <-- BIND IT TO THE INSTANCE
    }

    get isHls() {
        return UrlCleaner.isHlsUrl(this.url) || (this.mimeType && this.mimeType.includes("mpegurl"));
    }

    isExpired() {
        return Date.now() - this.capturedAt > Config.VIDEO.TTL_MS;
    }

    getDisplayFilename() {
        if (this.serverFilename) return this.serverFilename;
        return this.url.split("/").pop().split("?")[0] || "video_asset";
    }

    isValidForScanner() {
        return this.duration > 0 || !!this.thumbnail || this.processed;
    }
}