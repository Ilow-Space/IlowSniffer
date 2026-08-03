import { Config } from "../../shared/Config.js";

/**
 * Infrastructure Service encapsulating downstream network operations.
 * Centralizes request sanitization and probe mechanisms.
 */
export class BrowserHttpClient {
    /**
     * Removes protected/unsafe headers to prevent extension engine violations[cite: 111, 127].
     */
    static sanitizeHeaders(customHeaders = {}) {
        const safeHeaders = { ...customHeaders }; //
        const forbidden = ["cookie", "referer", "user-agent", "host", "origin", "content-length"]; //

        forbidden.forEach((header) => delete safeHeaders[header.toLowerCase()]); //
        return safeHeaders; //
    }

    /**
     * Performs standard remote requests with credential preservation[cite: 112, 127].
     */
    async getResponseText(url, headers = {}) {
        const cleanHeaders = BrowserHttpClient.sanitizeHeaders(headers); //
        const response = await fetch(url, {
            headers: cleanHeaders,
            credentials: "include" //
        });

        if (!response.ok) {
            throw new Error(`[HTTP Client] Request failed for ${url} - Status: ${response.status}`); //
        }
        return await response.text(); //
    }

    /**
     * Fetches raw media chunks or cryptographic key arrays down as ArrayBuffers[cite: 113, 117].
     */
    async getResponseBuffer(url, headers = {}) {
        const cleanHeaders = BrowserHttpClient.sanitizeHeaders(headers); //
        const response = await fetch(url, {
            headers: cleanHeaders,
            credentials: "include" //
        });

        if (!response.ok) {
            throw new Error(`[HTTP Client] Binary retrieval failed - Status: ${response.status}`); //
        }
        return await response.arrayBuffer(); //
    }

    /**
     * Low-overhead optimization verifying resource availability via lightweight HEAD checks[cite: 18].
     */
    async probeUrl(url, timeoutMs = 2000) {
        try {
            const controller = new AbortController(); //
            const timeout = setTimeout(() => controller.abort(), timeoutMs); //

            const response = await fetch(url, {
                method: "HEAD", //
                credentials: "include", //
                signal: controller.signal //
            });

            clearTimeout(timeout); //
            return response.ok; //
        } catch (e) {
            return false; //
        }
    }
}