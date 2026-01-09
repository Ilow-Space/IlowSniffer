// ======================================================================
// OFFSCREEN.JS
// Captures Thumbnail, Duration, AND Resolution
// ======================================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "generate_thumbnail") {
    generateThumbnail(msg.url)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open
  }
});

async function generateThumbnail(url) {
  return new Promise((resolve, reject) => {
    const video = document.getElementById("video-renderer");
    const canvas = document.createElement("canvas");

    // Timeout safety (8 seconds)
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

    // Wait for metadata (Dimensions & Duration)
    video.onloadeddata = () => {
      // Seek to 2 seconds or 10%
      const seekTime = Math.min(2, video.duration * 0.1);
      video.currentTime = seekTime;
    };

    // Capture Frame
    video.onseeked = () => {
      try {
        if (video.videoWidth === 0) throw new Error("Video has no width");

        // Set canvas to match video aspect ratio, but max width 320
        const aspectRatio = video.videoHeight / video.videoWidth;
        canvas.width = 320;
        canvas.height = 320 * aspectRatio;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
        let duration = video.duration;
        if (!Number.isFinite(duration)) duration = 0;

        // Capture Resolution
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
