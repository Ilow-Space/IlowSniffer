// ======================================================================
// BACKGROUND.JS - Service Worker
// Strict Deduplication & Auto-Cleanup
// ======================================================================

import {
  IGNORED_EXTENSIONS,
  IGNORED_SEGMENTS,
  OFFSCREEN_PATH,
} from "./constants.js";
import { logger } from "./logger.js";

// --- CONFIG ---
const VIDEO_TTL = 60 * 60 * 1000; // 1 Hour (Auto-remove old videos)
const LOCK_TIMEOUT = 5000; // 5 seconds lock on same key

let requestCache = {};
let creatingOffscreen = null;
let recentKeys = new Set();

// --- STORAGE WRAPPER ---
const Storage = {
  get: async (key) => {
    const res = await chrome.storage.session.get(key);
    return res[key] || {};
  },
  update: async (key, updateFn) => {
    try {
      const currentData = await Storage.get(key);
      const updatedData = updateFn(currentData);
      await chrome.storage.session.set({ [key]: updatedData });
      return updatedData;
    } catch (error) {
      console.error(error);
    }
  },
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.set({ capturedVideos: {} });
});

// --- OFFSCREEN MANAGER ---
async function setupOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (existingContexts.length > 0) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["DOM_SCRAPING"],
      justification: "Generate video thumbnails",
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}

async function generateThumbnailOffscreen(videoUrl) {
  try {
    await setupOffscreenDocument();
    const response = await chrome.runtime.sendMessage({
      action: "generate_thumbnail",
      url: videoUrl,
    });
    return response.success ? response.data : null;
  } catch (e) {
    return null;
  }
}

// --- UTILS ---

/**
 * Generates a STRICT unique key.
 * 1. Removes Query Parameters (?)
 * 2. Removes Hash Fragments (#)
 * 3. Removes common dynamic segments like /manifest/ or /hls/
 */
function generateVideoKey(url) {
  try {
    const urlObj = new URL(url);
    // Use only Hostname + Pathname (ignore ?token=xyz)
    const rawPath = urlObj.hostname + urlObj.pathname;
    return rawPath.toLowerCase();
  } catch (e) {
    return url;
  }
}

// --- 1. CAPTURE HEADERS ---
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (
      details.url.match(IGNORED_EXTENSIONS) ||
      IGNORED_SEGMENTS.some((s) => details.url.includes(s))
    )
      return;

    let headerObj = {};
    if (details.requestHeaders)
      details.requestHeaders.forEach((h) => (headerObj[h.name] = h.value));

    requestCache[details.requestId] = {
      url: details.url,
      method: details.method,
      headers: headerObj,
      tabId: details.tabId,
      timestamp: Date.now(),
    };
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders", "extraHeaders"]
);

// --- 2. DETECT VIDEO ---
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.url.match(IGNORED_EXTENSIONS)) return;

    const requestInfo = requestCache[details.requestId];
    if (!requestInfo) return;

    const typeHeader = details.responseHeaders?.find(
      (h) => h.name.toLowerCase() === "content-type"
    );
    const isVideoType =
      typeHeader &&
      (typeHeader.value.toLowerCase().startsWith("video/") ||
        typeHeader.value.includes("mpegurl") ||
        typeHeader.value.includes("vnd.apple.mpegurl"));
    const isVideoExt = details.url.match(/\.(mp4|mkv|mov|avi|m3u8)(\?|$|:)/i);

    if (isVideoType || isVideoExt) {
      const finalUrl = requestInfo.url;
      const uniqueKey = generateVideoKey(finalUrl);

      // --- DEDUPLICATION LOCK ---
      if (recentKeys.has(uniqueKey)) return;
      recentKeys.add(uniqueKey);
      setTimeout(() => recentKeys.delete(uniqueKey), LOCK_TIMEOUT);

      (async () => {
        let skipAdding = false;

        await Storage.update("capturedVideos", (videos) => {
          const now = Date.now();

          // 1. GARBAGE COLLECTION (Remove old videos)
          for (const k in videos) {
            if (now - videos[k].capturedAt > VIDEO_TTL) {
              delete videos[k];
            }
          }

          // 2. CHECK EXACT DUPLICATE
          if (videos[uniqueKey]) {
            skipAdding = true; // Already exists
            return videos;
          }

          // 3. CHECK FUZZY DUPLICATE (Path match)
          // If we already have "movie.mp4", don't add "movie.mp4?token=2"
          const existingKey = Object.keys(videos).find(
            (k) => k.includes(uniqueKey) || uniqueKey.includes(k)
          );
          if (existingKey) {
            skipAdding = true;
            return videos;
          }

          // ADD NEW VIDEO
          console.log(`[IlowAgent] Captured: ${uniqueKey}`);
          videos[uniqueKey] = {
            ...requestInfo,
            url: finalUrl,
            key: uniqueKey,
            duration: null,
            thumbnail: null,
            resolution: null,
            capturedAt: now,
          };
          return videos;
        });

        if (!skipAdding) {
          processMetadata(uniqueKey, finalUrl);
        }
      })();
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

// --- 3. METADATA STRATEGY ---
async function processMetadata(videoKey, finalUrl) {
  const osData = await generateThumbnailOffscreen(finalUrl);
  if (osData) {
    await Storage.update("capturedVideos", (videos) => {
      if (videos[videoKey]) {
        videos[videoKey].duration = osData.duration;
        videos[videoKey].thumbnail = osData.thumbnail;
        videos[videoKey].resolution = {
          width: osData.width,
          height: osData.height,
        };
      }
      return videos;
    });
  }
}

// --- API ---
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "get_videos") {
    Storage.get("capturedVideos").then((videos) => {
      // Return sorted list
      const list = Object.values(videos).sort(
        (a, b) => b.capturedAt - a.capturedAt
      );
      sendResponse(list);
    });
    return true;
  }
  if (req.action === "clear_videos") {
    chrome.storage.session.set({ capturedVideos: {} });
    sendResponse({ success: true });
    return true;
  }
});

// Clean Request Cache periodically
setInterval(() => {
  const now = Date.now();
  for (let id in requestCache) {
    if (now - requestCache[id].timestamp > 60000) delete requestCache[id];
  }
}, 30000);
