// ======================================================================
// FILE PATH: C:\Users\User\OneDrive\Projects\ilow\IlowAgent\hls_downloader.js
// ======================================================================
// Logic for downloading, decrypting (AES-128), and merging HLS streams.
// Pure JS implementation - No WASM required.

export async function downloadHLS(masterUrl, headers = {}) {
  try {
    console.log(`[HLS] Fetching Manifest: ${masterUrl}`);
    const manifestContent = await fetchUrl(masterUrl, headers);

    let segmentData = [];
    let baseUrl = masterUrl;

    // 1. Check if Master Playlist (contains other streams)
    if (manifestContent.includes("#EXT-X-STREAM-INF")) {
      const bestVariantUrl = getBestVariantUrl(manifestContent, masterUrl);
      console.log(`[HLS] Switching to best variant: ${bestVariantUrl}`);
      const mediaManifest = await fetchUrl(bestVariantUrl, headers);
      baseUrl = bestVariantUrl;
      segmentData = parseMediaPlaylist(mediaManifest, baseUrl);
    } else {
      // It's already a Media Playlist
      segmentData = parseMediaPlaylist(manifestContent, masterUrl);
    }

    if (segmentData.length === 0) {
      throw new Error("No segments found in manifest.");
    }

    console.log(`[HLS] Found ${segmentData.length} segments. Starting download...`);

    // 2. Download & Decrypt Segments
    // We process in batches to allow parallel downloads but manage memory
    const chunks = await batchFetchAndDecrypt(segmentData, 5, headers);

    // 3. Merge Segments
    // We create a Blob of type video/mp2t (MPEG Transport Stream)
    // Most players (VLC, etc.) play .ts files natively.
    console.log("[HLS] Merging segments...");
    const mergedBlob = new Blob(chunks, { type: "video/mp2t" });

    return mergedBlob;
  } catch (error) {
    console.error("[HLS] Download failed:", error);
    throw error;
  }
}

// --- PARSING LOGIC ---

/**
 * Parses a Media Playlist to extract Segment URLs and Encryption Info
 */
function parseMediaPlaylist(manifestText, baseUrl) {
  const lines = manifestText.split("\n");
  const segments = [];

  let currentKey = null; // { method, uri, iv }
  let mediaSequence = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      mediaSequence = parseInt(line.split(":")[1]);
    } else if (line.startsWith("#EXT-X-KEY:")) {
      // Encryption Header found
      currentKey = parseKeyAttribute(line, baseUrl);
    } else if (line.startsWith("#EXTINF:")) {
      // Duration info (ignored for download logic, but marks start of segment)
      // The NEXT line is the URL (unless it's another tag)
      let urlLine = lines[i + 1] ? lines[i + 1].trim() : "";

      // Skip extra tags until we find the URL or run out
      let offset = 1;
      while (urlLine.startsWith("#") && i + offset < lines.length) {
        offset++;
        urlLine = lines[i + offset].trim();
      }

      if (urlLine && !urlLine.startsWith("#")) {
        segments.push({
          url: resolveUrl(urlLine, baseUrl),
          key: currentKey, // Attach current encryption state
          seq: mediaSequence++, // Used for IV generation if missing
        });
        i += offset; // Advance loop
      }
    }
  }
  return segments;
}

/**
 * Parses #EXT-X-KEY:METHOD=AES-128,URI="key.php",IV=0x...
 */
function parseKeyAttribute(line, baseUrl) {
  const attrStr = line.substring(11); // Remove #EXT-X-KEY:
  const attrs = {};

  // Regex to match KEY="VALUE" or KEY=VALUE
  const regex = /([A-Z0-9\-]+)=("([^"]*)"|([^,]*))/g;
  let match;
  while ((match = regex.exec(attrStr)) !== null) {
    attrs[match[1]] = match[3] || match[4];
  }

  if (attrs.METHOD !== "AES-128") {
    // We only support AES-128 or NONE
    return null;
  }

  return {
    method: attrs.METHOD,
    uri: resolveUrl(attrs.URI, baseUrl),
    iv: attrs.IV ? parseHexIV(attrs.IV) : null, // IV is optional in manifest
  };
}

/**
 * Finds the variant with highest BANDWIDTH
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
          if (i + 1 < lines.length) bestUrl = lines[i + 1].trim();
        }
      }
    }
  }

  // Fallback: Use first .m3u8 found
  if (!bestUrl) {
    const urlLine = lines.find((l) => l.trim().includes(".m3u8") && !l.startsWith("#"));
    bestUrl = urlLine ? urlLine.trim() : null;
  }

  if (!bestUrl) throw new Error("Could not find variant URL.");
  return resolveUrl(bestUrl, baseUrl);
}

// --- FETCH & DECRYPT ---

async function batchFetchAndDecrypt(segments, concurrency, headers) {
  const results = new Array(segments.length);
  let currentIndex = 0;
  const keyCache = {}; // Cache decryption keys to avoid re-fetching

  // Safe headers for fetch
  const safeHeaders = { ...headers };
  ["cookie", "referer", "user-agent", "host", "origin", "content-length"].forEach((k) => delete safeHeaders[k]);

  async function fetchKey(keyInfo) {
    if (!keyInfo || !keyInfo.uri) return null;
    if (keyCache[keyInfo.uri]) return keyCache[keyInfo.uri];

    try {
      const resp = await fetch(keyInfo.uri, { headers: safeHeaders, credentials: "include" });
      const buffer = await resp.arrayBuffer();
      // Import as CryptoKey
      const cryptoKey = await crypto.subtle.importKey("raw", buffer, "AES-CBC", false, ["decrypt"]);
      keyCache[keyInfo.uri] = cryptoKey;
      return cryptoKey;
    } catch (e) {
      console.warn("Failed to fetch key:", keyInfo.uri, e);
      return null;
    }
  }

  async function worker() {
    while (currentIndex < segments.length) {
      const index = currentIndex++;
      const segment = segments[index];

      try {
        // 1. Fetch Segment
        const response = await fetch(segment.url, { headers: safeHeaders, credentials: "include" });
        if (!response.ok) throw new Error(`Status ${response.status}`);
        let data = await response.arrayBuffer();

        // 2. Decrypt if needed
        if (segment.key && segment.key.method === "AES-128") {
          const keyObj = await fetchKey(segment.key);
          if (keyObj) {
            // Calculate IV: Use manifest IV or Sequence Number
            let iv = segment.key.iv;
            if (!iv) iv = createIVFromSequence(segment.seq);

            // Perform Decryption
            data = await crypto.subtle.decrypt({ name: "AES-CBC", iv: iv }, keyObj, data);
          }
        }

        results[index] = data;
      } catch (e) {
        console.error(`[HLS] Error Seg ${index}:`, e);
        // On error, push empty buffer to keep sync, or retry logic could go here
        results[index] = new ArrayBuffer(0);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);

  return results;
}

// --- UTILS ---

async function fetchUrl(url, customHeaders = {}) {
  const safeHeaders = { ...customHeaders };
  ["cookie", "referer", "user-agent", "host", "origin", "content-length"].forEach((k) => delete safeHeaders[k]);

  const response = await fetch(url, { headers: safeHeaders, credentials: "include" });
  if (!response.ok) throw new Error(`Failed to fetch ${url} - Status: ${response.status}`);
  return await response.text();
}

function resolveUrl(relative, base) {
  try {
    return new URL(relative, base).href;
  } catch (e) {
    return relative;
  }
}

function parseHexIV(hexStr) {
  const str = hexStr.startsWith("0x") ? hexStr.slice(2) : hexStr;
  const buffer = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    buffer[i] = parseInt(str.substr(i * 2, 2), 16);
  }
  return buffer;
}

/**
 * If IV is missing, HLS spec says to use the Media Sequence Number
 * padded to 128-bit big-endian.
 */
function createIVFromSequence(seqId) {
  const buffer = new Uint8Array(16);
  const view = new DataView(buffer.buffer);
  // JS handles integers up to 2^53. HLS sequence numbers rarely exceed this.
  // We write to the last 4 bytes (Big Endian).
  view.setUint32(12, seqId, false);
  return buffer;
}
