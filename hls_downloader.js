// ======================================================================
// FILE PATH: C:\Users\User\OneDrive\Projects\ilow\IlowAgent\hls_downloader.js
// ======================================================================
// Logic for downloading and merging HLS streams (m3u8)

/**
 * Main entry point to download an HLS stream.
 * Returns a Blob of the merged video.
 */
export async function downloadHLS(masterUrl) {
  try {
    const manifestContent = await fetchUrl(masterUrl);

    // 1. Determine if Master or Media Playlist
    let segmentUrls = [];

    if (manifestContent.includes("#EXT-X-STREAM-INF")) {
      // It's a Master Playlist - Find best quality
      const bestVariantUrl = getBestVariantUrl(manifestContent, masterUrl);
      console.log(`[HLS] Switching to best variant: ${bestVariantUrl}`);
      const mediaManifest = await fetchUrl(bestVariantUrl);
      segmentUrls = parseSegments(mediaManifest, bestVariantUrl);
    } else {
      // It's already a Media Playlist
      segmentUrls = parseSegments(manifestContent, masterUrl);
    }

    if (segmentUrls.length === 0) {
      throw new Error("No segments found in manifest.");
    }

    console.log(`[HLS] Found ${segmentUrls.length} segments. Starting download...`);

    // 2. Download Segments (Batch processed to avoid OOM or Net errors)
    const chunks = await batchFetchSegments(segmentUrls, 5); // 5 concurrent requests

    // 3. Merge Segments
    console.log("[HLS] Merging segments...");
    const mergedBlob = new Blob(chunks, { type: "video/mp2t" });

    return mergedBlob;
  } catch (error) {
    console.error("[HLS] Download failed:", error);
    throw error;
  }
}

// --- HELPERS ---

async function fetchUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  return await response.text();
}

/**
 * Parses Master Playlist to find the variant with highest bandwidth
 */
function getBestVariantUrl(manifestText, baseUrl) {
  const lines = manifestText.split("\n");
  let maxBandwidth = 0;
  let bestUrl = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
      if (bandwidthMatch) {
        const bandwidth = parseInt(bandwidthMatch[1], 10);
        if (bandwidth > maxBandwidth) {
          maxBandwidth = bandwidth;
          // The next line is the URL
          if (i + 1 < lines.length) {
            bestUrl = lines[i + 1].trim();
          }
        }
      }
    }
  }

  // If no bandwidth tag found, just take the first m3u8 found
  if (!bestUrl) {
    const urlLine = lines.find((l) => l.trim().endsWith(".m3u8") && !l.startsWith("#"));
    bestUrl = urlLine ? urlLine.trim() : null;
  }

  if (!bestUrl) throw new Error("Could not find variant URL in master playlist");

  return resolveUrl(bestUrl, baseUrl);
}

/**
 * Parses Media Playlist to extract segment URLs
 */
function parseSegments(manifestText, baseUrl) {
  const lines = manifestText.split("\n");
  const urls = [];

  for (const line of lines) {
    const l = line.trim();
    if (l && !l.startsWith("#")) {
      urls.push(resolveUrl(l, baseUrl));
    }
  }
  return urls;
}

function resolveUrl(relative, base) {
  try {
    return new URL(relative, base).href;
  } catch (e) {
    return relative; // Fallback
  }
}

/**
 * Fetches segments in batches to respect network limits
 */
async function batchFetchSegments(urls, concurrency) {
  const results = new Array(urls.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < urls.length) {
      const index = currentIndex++;
      const url = urls[index];
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Segment fetch error ${response.status}`);
        const buffer = await response.arrayBuffer();
        results[index] = buffer;
      } catch (e) {
        console.warn(`[HLS] Failed segment ${index}, retrying once...`, e);
        // Simple retry logic
        try {
          const response = await fetch(url);
          results[index] = await response.arrayBuffer();
        } catch (retryErr) {
          console.error(`[HLS] Segment ${index} failed permanently.`);
          // Push empty buffer to keep sync
          results[index] = new ArrayBuffer(0);
        }
      }
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}
