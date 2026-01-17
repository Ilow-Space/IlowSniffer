// ======================================================================
// BACKGROUND.JS - Service Worker
// Strict Deduplication & Auto-Cleanup
// ======================================================================

import { IGNORED_EXTENSIONS, IGNORED_SEGMENTS, OFFSCREEN_PATH, MESSAGE_ACTIONS } from "./constants.js";
import { logger } from "./logger.js";
import { downloadHLS } from "./hls_downloader.js";

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

function generateVideoKey(url) {
  return url;
}

// Helper to extract clean path for comparison (ignores subdomain/host differences)
function getUrlPath(urlStr) {
  try {
    const url = new URL(urlStr);
    return url.pathname; // Returns "/folder/video.mp4" ignoring "https://sub.domain.com"
  } catch (e) {
    return urlStr;
  }
}

// --- 1. CAPTURE HEADERS ---
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // IGNORE ILOW DOMAIN & OTHER EXTENSIONS
    if (details.url.includes(".ilow.io")) return;
    if (details.url.match(IGNORED_EXTENSIONS) || IGNORED_SEGMENTS.some((s) => details.url.includes(s))) return;

    let headerObj = {};
    if (details.requestHeaders) details.requestHeaders.forEach((h) => (headerObj[h.name] = h.value));

    requestCache[details.requestId] = {
      url: details.url,
      method: details.method,
      headers: headerObj,
      tabId: details.tabId,
      timestamp: Date.now(),
    };
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders", "extraHeaders"],
);

// --- 2. DETECT VIDEO ---
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.url.match(IGNORED_EXTENSIONS)) return;

    const requestInfo = requestCache[details.requestId];
    if (!requestInfo) return;

    const typeHeader = details.responseHeaders?.find((h) => h.name.toLowerCase() === "content-type");
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

          // 1. GARBAGE COLLECTION
          for (const k in videos) {
            if (now - videos[k].capturedAt > VIDEO_TTL) {
              delete videos[k];
            }
          }

          // 2. CHECK EXACT DUPLICATE
          if (videos[uniqueKey]) {
            skipAdding = true;
            return videos;
          }

          // 3. STORAGE LEVEL DEDUPLICATION (Keep strict)
          const existingKey = Object.keys(videos).find((k) => k === uniqueKey);
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
  ["responseHeaders"],
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
      const allVideos = Object.values(videos);

      // Separate videos that have successfully fetched metadata
      const goodVideos = allVideos.filter((v) => v.duration > 0 && v.thumbnail);

      // Filter logic
      const filteredList = allVideos.filter((video) => {
        // 1. If this video has metadata, we definitely keep it
        if (video.duration > 0 && video.thumbnail) return true;

        // 2. If this video is "bad" (no metadata), check if a "good" version exists
        // We compare ONLY the URL Pathname to ignore domain differences
        // (e.g., actinium.vdbmate vs vdbmate)
        const myPath = getUrlPath(video.url);

        const hasBetterDuplicate = goodVideos.some((goodVideo) => {
          return getUrlPath(goodVideo.url) === myPath;
        });

        // If a better version exists, hide this one. If not, keep showing it (it might be loading)
        return !hasBetterDuplicate;
      });

      const list = filteredList.sort((a, b) => b.capturedAt - a.capturedAt);
      sendResponse(list);
    });
    return true;
  }
  if (req.action === "clear_videos") {
    chrome.storage.session.set({ capturedVideos: {} });
    sendResponse({ success: true });
    return true;
  }
  // NEW: Handle Download
  if (req.action === MESSAGE_ACTIONS.DOWNLOAD_VIDEO) {
    handleVideoDownload(req.url, req.filename);
    sendResponse({ success: true, message: "Download started in background" });
    return true;
  }
});

async function handleVideoDownload(url, suggestedName) {
  try {
    console.log(`[Download] Starting: ${url}`);

    const isHls = url.includes(".m3u8") || url.includes("mpegurl");

    if (isHls) {
      // 1. Process HLS
      const blob = await downloadHLS(url);

      // 2. Create Object URL (Base64 is safer for background to download api sometimes)
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = function () {
        const base64data = reader.result;

        // 3. Trigger Download
        // Note: HLS segments are usually TS. We save as .ts
        const filename = suggestedName.replace(/\.(m3u8|mp4|mkv)$/i, "") + ".ts";

        chrome.downloads.download({
          url: base64data,
          filename: "IlowCaps/" + filename,
          saveAs: false,
        });
      };
    } else {
      // Direct Download (MP4, MKV, etc)
      chrome.downloads.download({
        url: url,
        filename: "IlowCaps/" + suggestedName,
        saveAs: false,
      });
    }
  } catch (e) {
    console.error("[Download] Error:", e);
    // Optional: Send error notification to user
  }
}

// Clean Request Cache periodically
setInterval(() => {
  const now = Date.now();
  for (let id in requestCache) {
    if (now - requestCache[id].timestamp > 60000) delete requestCache[id];
  }
}, 30000);
