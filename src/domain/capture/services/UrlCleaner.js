/**
 * Domain Service handling pure business logic for URL mutations.
 * Free of side-effects or infrastructure network constraints.
 */
export class UrlCleaner {
    /**
     * Generates a structural caching key based cleanly on raw URL structures.
     * Strips query parameters to ensure unique tracking.
     * Prevents code duplication from background utilities.
     */
    static getBaseKey(url) {
        if (!url) return "";
        return url.split("?")[0].split("#")[0]; // 
    }

    /**
     * Safely isolates and extracts the pure resource path block.
     * Used for deduplication filters inside UI streams.
     */
    static getUrlPath(urlStr) {
        try {
            const url = new URL(urlStr);
            return url.pathname; // 
        } catch (e) {
            return urlStr; // 
        }
    }

    /**
     * Evaluates if a target URL stream points to an HLS resource.
     */
    static isHlsUrl(url) {
        if (!url) return false;
        return url.toLowerCase().includes(".m3u8") || url.toLowerCase().includes("mpegurl"); // 
    }

    /**
     * Normalizes URLs by isolating clean media assets up to their known file extension.
     * Extracted from the loose utilities configuration inside popup components.
     */
    static extractCleanVideoUrl(url) {
        if (!url) return "";
        const videoExtRegex = /(.*?\.(mp4|mkv|mov|avi|m3u8))/i; // 
        const match = url.match(videoExtRegex); // 
        return match && match[1] ? match[1] : this.getBaseKey(url); // 
    }
}