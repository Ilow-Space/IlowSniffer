// ======================================================================
// FILE PATH: C:\Users\User\OneDrive\Projects\ilow\IlowAgent\background.js
// ======================================================================

import { IGNORED_EXTENSIONS, IGNORED_SEGMENTS, OFFSCREEN_PATH, MESSAGE_ACTIONS } from "./constants.js";

// --- CONFIG ---
const VIDEO_TTL = 60 * 60 * 1000;
const LOCK_TIMEOUT = 5000;
const IMPERSONATION_RULE_ID = 1001;

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
  chrome.storage.session.set({
    capturedVideos: {},
    activeDownloadsMap: {}, // New: Maps DownloadID -> Original URL
  });
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [IMPERSONATION_RULE_ID],
  });
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
      reasons: ["DOM_SCRAPING", "BLOBS"],
      justification: "Generate video thumbnails and process HLS downloads",
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
  return url.split("?")[0];
}

function getUrlPath(urlStr) {
  try {
    const url = new URL(urlStr);
    return url.pathname;
  } catch (e) {
    return urlStr;
  }
}

function getFilenameFromHeaders(headers) {
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

/**
 * Checks if a URL is valid/accessible via a lightweight HEAD request.
 */
async function probeUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return res.ok;
  } catch (e) {
    return false;
  }
}

// --- 1. CAPTURE REQUEST HEADERS ---
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (details.url.includes(".ilow.io")) return;
    if (details.url.match(IGNORED_EXTENSIONS) || IGNORED_SEGMENTS.some((s) => details.url.includes(s))) return;

    let headerObj = {};
    if (details.requestHeaders) {
      details.requestHeaders.forEach((h) => (headerObj[h.name] = h.value));
    }

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
      let finalUrl = requestInfo.url;
      const serverFilename = getFilenameFromHeaders(details.responseHeaders);

      (async () => {
        // --- SMART TRUNCATION LOGIC ---
        const dynamicSuffixRegex = /(.+?)(\:hls\:manifest\.m3u8)$/i;
        const match = finalUrl.match(dynamicSuffixRegex);

        if (match) {
          const potentialCleanUrl = match[1];
          const works = await probeUrl(potentialCleanUrl);
          if (works) {
            finalUrl = potentialCleanUrl;
          }
        }
        // -----------------------------

        const uniqueKey = generateVideoKey(finalUrl);

        if (recentKeys.has(uniqueKey)) return;
        recentKeys.add(uniqueKey);
        setTimeout(() => recentKeys.delete(uniqueKey), LOCK_TIMEOUT);

        let skipAdding = false;
        await Storage.update("capturedVideos", (videos) => {
          const now = Date.now();
          for (const k in videos) {
            if (now - videos[k].capturedAt > VIDEO_TTL) delete videos[k];
          }
          if (videos[uniqueKey]) {
            skipAdding = true;
            return videos;
          }
          videos[uniqueKey] = {
            ...requestInfo,
            url: finalUrl,
            key: uniqueKey,
            duration: null,
            thumbnail: null,
            resolution: null,
            processed: false,
            capturedAt: now,
            serverFilename: serverFilename,
            mimeType: typeHeader ? typeHeader.value : null,
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

// --- 3. METADATA & MESSAGING ---
async function processMetadata(videoKey, finalUrl) {
  const osData = await generateThumbnailOffscreen(finalUrl);

  await Storage.update("capturedVideos", (videos) => {
    if (videos[videoKey]) {
      if (osData) {
        videos[videoKey].duration = osData.duration;
        videos[videoKey].thumbnail = osData.thumbnail;
        videos[videoKey].resolution = {
          width: osData.width,
          height: osData.height,
        };
      }
      videos[videoKey].processed = true;
    }
    return videos;
  });
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "get_videos") {
    Storage.get("capturedVideos").then((videos) => {
      const allVideos = Object.values(videos);
      const seenPaths = new Set();
      const filteredList = [];

      allVideos.sort((a, b) => {
        const scoreA = (a.duration ? 10 : 0) + (a.thumbnail ? 10 : 0);
        const scoreB = (b.duration ? 10 : 0) + (b.thumbnail ? 10 : 0);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return b.capturedAt - a.capturedAt;
      });

      for (const video of allVideos) {
        if (!video.duration || video.duration === 0) continue;
        const path = getUrlPath(video.url);
        if (seenPaths.has(path)) continue;
        seenPaths.add(path);
        filteredList.push(video);
      }
      sendResponse(filteredList);
    });
    return true;
  }
  if (req.action === "clear_videos") {
    chrome.storage.session.set({ capturedVideos: {} });
    sendResponse({ success: true });
    return true;
  }
  if (req.action === MESSAGE_ACTIONS.DOWNLOAD_VIDEO) {
    handleVideoDownload(req.url, req.filename);
    sendResponse({ success: true, message: "Download started" });
    return true;
  }
});

// --- DNR HELPERS ---
async function setupImpersonationRules(targetUrl, headers) {
  if (!headers || Object.keys(headers).length === 0) return;
  try {
    const urlObj = new URL(targetUrl);
    const domain = urlObj.hostname;
    const headersToSet = Object.keys(headers)
      .filter((k) => !["content-length", "host", "connection", "accept-encoding"].includes(k.toLowerCase()))
      .map((k) => ({ header: k, operation: "set", value: headers[k] }));

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [IMPERSONATION_RULE_ID],
      addRules: [
        {
          id: IMPERSONATION_RULE_ID,
          priority: 1,
          action: { type: "modifyHeaders", requestHeaders: headersToSet },
          condition: { urlFilter: `||${domain}`, resourceTypes: ["xmlhttprequest", "media", "other"] },
        },
      ],
    });
  } catch (e) {
    console.error("[DNR] Error", e);
  }
}

async function clearImpersonationRules() {
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [IMPERSONATION_RULE_ID] });
}

// --- TRACK DOWNLOAD MAP ---
function mapDownloadToUrl(downloadId, originalUrl) {
  Storage.update("activeDownloadsMap", (map) => {
    map[downloadId] = originalUrl;
    return map;
  });
}

// Clean up finished downloads from the map
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && (delta.state.current === "complete" || delta.state.current === "interrupted")) {
    Storage.update("activeDownloadsMap", (map) => {
      delete map[delta.id];
      return map;
    });
  }
});

// --- MAIN DOWNLOAD LOGIC ---
async function handleVideoDownload(url, suggestedName) {
  try {
    console.log(`[Download] Starting: ${url}`);

    const videos = await Storage.get("capturedVideos");
    const videoData = Object.values(videos).find((v) => v.url === url);
    const headers = videoData ? videoData.headers : {};
    const finalFilename = videoData && videoData.serverFilename ? videoData.serverFilename : suggestedName;

    await setupImpersonationRules(url, headers);

    const isHls = url.includes(".m3u8") || url.includes("mpegurl");

    if (isHls) {
      console.log("[Download] Delegating HLS to Offscreen...");
      await setupOffscreenDocument();

      const response = await chrome.runtime.sendMessage({
        action: "download_hls_offscreen",
        url: url,
        headers: headers,
      });

      if (!response || !response.success) {
        throw new Error(response ? response.error : "Offscreen download failed");
      }

      const blobUrl = response.blobUrl;
      const filename = finalFilename.replace(/\.(m3u8|mp4|mkv)$/i, "") + ".ts";

      chrome.downloads.download(
        {
          url: blobUrl,
          filename: "IlowCaps/" + filename,
          saveAs: false,
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
          } else {
            // Map the Blob download ID back to the original HLS URL
            mapDownloadToUrl(downloadId, url);
          }
        },
      );
      await clearImpersonationRules();
    } else {
      // Direct Download
      chrome.downloads.download(
        {
          url: url,
          filename: "IlowCaps/" + finalFilename,
          saveAs: false,
        },
        (downloadId) => {
          if (downloadId) {
            mapDownloadToUrl(downloadId, url);
          }
        },
      );
      setTimeout(() => clearImpersonationRules(), 5000);
    }
  } catch (e) {
    console.error("[Download] Error:", e);
    await clearImpersonationRules();
  }
}

// Clean Request Cache
setInterval(() => {
  const now = Date.now();
  for (let id in requestCache) {
    if (now - requestCache[id].timestamp > 60000) delete requestCache[id];
  }
}, 30000);
