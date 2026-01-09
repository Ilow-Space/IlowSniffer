// ======================================================================
// CONTENT.JS
// Runs inside the webpage to extract metadata (Duration, Thumbnail)
// ======================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "get_video_metadata") {
    const videos = Array.from(document.getElementsByTagName("video"));

    if (videos.length === 0) {
      sendResponse({ found: false });
      return;
    }

    // Logic: Find the "Main" video.
    // Heuristic: Largest Visible Area + Video that is actually loaded.
    let targetVideo = null;
    let maxScore = 0;

    for (let v of videos) {
      const rect = v.getBoundingClientRect();
      const area = rect.width * rect.height;

      // Check visibility
      const style = window.getComputedStyle(v);
      const isVisible =
        style.visibility !== "hidden" && style.display !== "none" && area > 0;

      if (isVisible && area > maxScore) {
        maxScore = area;
        targetVideo = v;
      }
    }

    // If video found but not ready (readyState 0 = HAVE_NOTHING)
    if (targetVideo && targetVideo.readyState > 0) {
      // 1. Get Duration
      let duration = targetVideo.duration;
      // Handle Infinity (Livestreams) or NaN
      if (!Number.isFinite(duration)) duration = 0;

      // 2. Get Thumbnail
      let thumb = null;
      try {
        if (targetVideo.videoWidth > 0) {
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = 180;
          const ctx = canvas.getContext("2d");

          // Draw image from video
          ctx.drawImage(targetVideo, 0, 0, canvas.width, canvas.height);

          // Attempt conversion. This throws error if video is cross-origin protected.
          thumb = canvas.toDataURL("image/jpeg", 0.5);
        }
      } catch (e) {
        // Quietly fail on CORS protection - we just won't have a thumbnail
        thumb = null;
      }

      sendResponse({
        found: true,
        duration: duration,
        thumbnail: thumb,
        pageTitle: document.title,
      });
    } else {
      // Video found but not ready yet, background will retry
      sendResponse({ found: false });
    }
  }
  return true; // Keep channel open
});
