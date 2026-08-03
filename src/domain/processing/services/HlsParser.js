import { UrlCleaner } from "../../capture/services/UrlCleaner.js";

/**
 * Pure Domain Service parsing streaming file configurations and manifests.
 */
export class HlsParser {
    /**
     * Checks if the playlist text contains alternative adaptive configurations.
     */
    static isMasterPlaylist(manifestContent) {
        return manifestContent.includes("#EXT-X-STREAM-INF"); //
    }

    /**
     * Analyzes an adaptive layout list and returns the highest quality URL path configuration[cite: 105].
     */
    static getBestVariantUrl(manifestText, baseUrl) {
        const lines = manifestText.split("\n"); //
        let maxBandwidth = 0; //
        let bestUrl = null; //

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim(); //
            if (line.startsWith("#EXT-X-STREAM-INF")) { //
                const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/); //
                if (bandwidthMatch) {
                    const bandwidth = parseInt(bandwidthMatch[1], 10); //
                    if (bandwidth > maxBandwidth) {
                        maxBandwidth = bandwidth; //
                        if (i + 1 < lines.length) bestUrl = lines[i + 1].trim(); //
                    }
                }
            }
        }

        // Fallback: Pick the first usable file match listed
        if (!bestUrl) {
            const fallbackLine = lines.find((l) => l.trim().includes(".m3u8") && !l.startsWith("#")); //
            bestUrl = fallbackLine ? fallbackLine.trim() : null; //
        }

        if (!bestUrl) {
            throw new Error("Invalid Stream Layout: No variant playlists discovered."); //
        }

        return new URL(bestUrl, baseUrl).href; //
    }

    /**
     * Parses media manifests into atomic, segment structures.
     */
    static parseMediaPlaylist(manifestText, baseUrl) {
        const lines = manifestText.split("\n"); //
        const segments = []; //

        let currentKey = null; //
        let mediaSequence = 0; //

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim(); //
            if (!line) continue; //

            if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
                mediaSequence = parseInt(line.split(":")[1]); //
            } else if (line.startsWith("#EXT-X-KEY:")) {
                currentKey = this._parseKeyAttribute(line, baseUrl); //
            } else if (line.startsWith("#EXTINF:")) {
                let offset = 1; //
                let urlLine = lines[i + offset] ? lines[i + offset].trim() : ""; //

                while (urlLine.startsWith("#") && i + offset < lines.length) {
                    offset++; //
                    urlLine = lines[i + offset].trim(); //
                }

                if (urlLine && !urlLine.startsWith("#")) {
                    segments.push({
                        url: new URL(urlLine, baseUrl).href, //
                        key: currentKey, //
                        seq: mediaSequence++ //
                    });
                    i += offset; //
                }
            }
        }
        return segments; //
    }

    /**
     * Parses cryptographic key mapping markers.
     */
    static _parseKeyAttribute(line, baseUrl) {
        const attrStr = line.substring(11); //
        const attrs = {};
        const regex = /([A-Z0-9\-]+)=("([^"]*)"|([^,]*))/g; //

        let match;
        while ((match = regex.exec(attrStr)) !== null) {
            attrs[match[1]] = match[3] || match[4]; //
        }

        if (attrs.METHOD !== "AES-128") {
            return null; //
        }

        return {
            method: attrs.METHOD, //
            uri: new URL(attrs.URI, baseUrl).href, //
            iv: attrs.IV ? attrs.IV : null //
        };
    }
}