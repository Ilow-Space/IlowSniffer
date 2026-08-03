/**
 * Global Configuration Registry
 * Single source of truth to avoid DRY violations across contexts.
 */
export const Config = {
    // Domain Business Rules
    VIDEO: {
        TTL_MS: 60 * 60 * 1000,         // Time-to-live for captured streams (1 hour) 
        LOCK_TIMEOUT_MS: 5000,          // Concurrency request gate delay 
        THUMBNAIL_WIDTH: 320,           // Target canvas widths 
        THUMBNAIL_HEIGHT: 180,          // Target canvas fallback height 
    },

    // Security & Extension Network Operations
    NETWORK: {
        IMPERSONATION_RULE_ID: 1001,    // Declarative Net Request static/dynamic partition rule ID 
        IGNORED_EXTENSIONS: /\.(ts|m4s|mbn|vtt|srt|key|aac|png|jpg|gif|css|js|woff|woff2)(\?|$)/i, // 
        IGNORED_SEGMENTS: ["seg-", "fragment-", "chunk-", "acl="], // 
    },

    // Remote Uplink / Cloud Api Orchestration
    API: {
        BASE_URL: "https://media.ilow.io/api",        // 
        COOKIE_DOMAIN: "https://media.ilow.io",       // 
        AUTH_COOKIE_NAME: "ory_kratos_session",       // 
        TMDB_IMAGE_BASE: "https://image.tmdb.org/t/p/w92", // 
        AUTH_URL: "https://id.ilow.io",
    },

    // Infrastructure Internal Storage Mapping Keys
    STORAGE: {
        CAPTURED_VIDEOS: "capturedVideos",            // 
        ACTIVE_DOWNLOADS_MAP: "activeDownloadsMap",   // 
    },

    // Extension Context Locations
    PATHS: {
        OFFSCREEN_DOCUMENT: "offscreen.html",        // 
    }
};