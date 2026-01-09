// Constants and Configuration for Ilöw Media Sniffer

// Background Script Constants
export const IGNORED_EXTENSIONS =
  /\.(ts|m4s|mbn|vtt|srt|key|aac|png|jpg|gif|css|js|woff|woff2)(\?|$)/i;
export const IGNORED_SEGMENTS = ["seg-", "fragment-", "chunk-", "acl="];
export const OFFSCREEN_PATH = "offscreen.html";
export const RECENT_KEYS_TIMEOUT = 10000; // ms

// Popup Script Configuration
export const API_BASE = "https://media.ilow.io/api";
export const COOKIE_DOMAIN = "https://media.ilow.io";
export const AUTH_COOKIE = "ilow_auth_token";
export const TMDB_IMG_BASE = "https://image.tmdb.org/t/p/w92";

// General Constants
export const STORAGE_KEY_CAPTURED_VIDEOS = "capturedVideos";
export const DOMAIN_FOR_COOKIE_ACCESS = "https://media.ilow.io"; // For chrome.cookies.get
export const OFFSCREEN_REASONS = ["DOM_SCRAPING"];

export const MESSAGE_ACTIONS = {
  GET_VIDEOS: "get_videos",
  CLEAR_VIDEOS: "clear_videos",
  GENERATE_THUMBNAIL: "generate_thumbnail",
  GET_VIDEO_METADATA: "get_video_metadata",
};
