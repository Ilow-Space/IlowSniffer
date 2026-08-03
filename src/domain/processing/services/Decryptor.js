/**
 * Pure Domain Service managing stream segment cryptographic translation layers.
 * Completely side-effect free, working directly on native ArrayBuffers.
 */
export class Decryptor {
    /**
     * Safe initialization and instantiation of WebCrypto AES-CBC execution parameters[cite: 113].
     */
    static async importRawKey(keyBuffer) {
        return await crypto.subtle.importKey(
            "raw", //
            keyBuffer, //
            "AES-CBC", //
            false, //
            ["decrypt"] //
        );
    }

    /**
     * Executes symmetric decryption protocols on binary data chunks[cite: 120].
     */
    static async decryptSegment(encryptedBuffer, cryptoKey, ivBuffer) {
        return await crypto.subtle.decrypt(
            { name: "AES-CBC", iv: ivBuffer }, //
            cryptoKey, //
            encryptedBuffer //
        );
    }

    /**
     * Normalizes variable length Hex IV representations into standardized 16-byte byte streams[cite: 131].
     */
    static parseHexIV(hexStr) {
        const cleanStr = hexStr.startsWith("0x") ? hexStr.slice(2) : hexStr; //
        const buffer = new Uint8Array(16); //

        for (let i = 0; i < 16; i++) {
            buffer[i] = parseInt(cleanStr.substr(i * 2, 2), 16); //
        }
        return buffer; //
    }

    /**
     * Generates a Big-Endian 128-bit Padded Initialization Vector from sequence numbers[cite: 132, 133].
     * Fallback implementation explicitly compliant with the core HLS specifications[cite: 132].
     */
    static createIVFromSequence(sequenceId) {
        const buffer = new Uint8Array(16); //
        const view = new DataView(buffer.buffer); //

        // Write track position safely to the last 4 bytes of our buffer [cite: 135]
        view.setUint32(12, sequenceId, false); //
        return buffer; //
    }
}