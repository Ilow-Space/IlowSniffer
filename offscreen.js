// ======================================================================
// OFFSCREEN.JS
// Handles DOM-dependent tasks: Thumbnails & Blob URL creation
// ======================================================================

import { downloadHLS } from "./hls_downloader.js";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 1. THUMBNAIL GENERATION
  if (msg.action === "generate_thumbnail") {
    generateThumbnail(msg.url)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 2. HLS DOWNLOAD (Moved here to access URL.createObjectURL)
  if (msg.action === "download_hls_offscreen") {
    handleOffscreenDownload(msg.url, msg.headers)
      .then((blobUrl) => sendResponse({ success: true, blobUrl: blobUrl }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }
});

// --- HLS DOWNLOAD HANDLER ---
async function handleOffscreenDownload(url, headers) {
  try {
    // 1. Download & Decrypt (uses hls_downloader.js)
    const blob = await downloadHLS(url, headers);

    // 2. Create Object URL (This works here because we are in a DOM environment)
    const blobUrl = URL.createObjectURL(blob);

    return blobUrl;
  } catch (e) {
    console.error("[Offscreen] Download failed", e);
    throw e;
  }
}

// --- THUMBNAIL LOGIC (Existing) ---
async function generateThumbnail(url) {
  return new Promise((resolve, reject) => {
    const video = document.getElementById("video-renderer");
    const canvas = document.createElement("canvas");

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timeout loading video"));
    }, 8000);

    const cleanup = () => {
      clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
    };

    video.crossOrigin = "anonymous";
    video.src = url;
    video.muted = true;

    video.onloadeddata = () => {
      const seekTime = Math.min(5, video.duration * 0.1);
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      try {
        if (video.videoWidth === 0) throw new Error("Video has no width");

        const aspectRatio = video.videoHeight / video.videoWidth;
        canvas.width = 320;
        canvas.height = 320 * aspectRatio;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
        let duration = video.duration;
        if (!Number.isFinite(duration)) duration = 0;

        const width = video.videoWidth;
        const height = video.videoHeight;

        cleanup();

        resolve({
          thumbnail: dataUrl,
          duration: duration,
          width: width,
          height: height,
        });
      } catch (e) {
        cleanup();
        reject(e);
      }
    };

    video.onerror = (e) => {
      cleanup();
      reject(new Error("Video load error"));
    };
  });
}
