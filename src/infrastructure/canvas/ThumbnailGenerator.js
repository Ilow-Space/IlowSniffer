import { Config } from "../../shared/Config.js";

/**
 * Infrastructure Service managing HTML5 Canvas rendering manipulations.
 * Solves DRY violations by unifying video frame capture across extension scripts.
 */
export class ThumbnailGenerator {
    /**
     * Captures a still frame from a running video element.
     * Gracefully falls back to a null reference if cross-origin rules prevent reading pixel data.
     */
    static extractFrameAsDataUrl(videoElement, targetWidth = Config.VIDEO.THUMBNAIL_WIDTH) {
        try {
            if (!videoElement || videoElement.videoWidth === 0) return null;

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            // Calculate matching aspect ratio height dynamically to avoid warped images
            const aspectRatio = videoElement.videoHeight / videoElement.videoWidth;
            canvas.width = targetWidth;
            canvas.height = targetWidth * aspectRatio;

            // Paint frame data directly from video hardware memory onto canvas context
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

            // Export frame out as a compressed JPEG data URI
            return canvas.toDataURL("image/jpeg", 0.5);
        } catch (corsError) {
            console.warn("[Thumbnail Generator] Unable to exfiltrate canvas pixels due to strict host CORS policies.");
            return null;
        }
    }
}