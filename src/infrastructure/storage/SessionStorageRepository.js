import { VideoAsset } from "../../domain/capture/entities/VideoAsset.js";
import { Config } from "../../shared/Config.js";

/**
 * Infrastructure Repository managing session-scoped data persistence.
 * Abstracts direct browser runtime storage side-effects.
 */
export class SessionStorageRepository {
    /**
     * Retrieves and restores all cached streams into validated domain objects.
     */
    async getCapturedVideos() {
        const data = await chrome.storage.session.get(Config.STORAGE.CAPTURED_VIDEOS); //
        const rawVideos = data[Config.STORAGE.CAPTURED_VIDEOS] || {}; //

        return Object.keys(rawVideos).reduce((entities, key) => {
            try {
                entities[key] = new VideoAsset(rawVideos[key]);
            } catch (e) {
                console.error(`[Storage Repository] Failed to hydrate entity for key ${key}:`, e);
            }
            return entities;
        }, {});
    }

    /**
     * Performs an atomic domain collection write operation with safe expiration filters.
     */
    async updateCapturedVideos(updateFn) {
        try {
            const currentMap = await this.getCapturedVideos(); //
            const updatedMap = updateFn(currentMap); //

            const serializedPayload = {};
            const now = Date.now();

            for (const key in updatedMap) {
                const asset = updatedMap[key];
                // Enforce the TTL lifecycle rule before serializing down to disk
                if (now - asset.capturedAt <= Config.VIDEO.TTL_MS) { //
                    serializedPayload[key] = Object.assign({}, asset);
                }
            }

            await chrome.storage.session.set({ [Config.STORAGE.CAPTURED_VIDEOS]: serializedPayload }); //
            return updatedMap;
        } catch (error) {
            console.error("[Storage Repository] Transaction error updating captured videos:", error); //
            throw error;
        }
    }

    /**
     * Pairs an active browser Download ID back to its original network stream target.
     */
    async mapDownloadToUrl(downloadId, originalUrl) {
        const data = await chrome.storage.session.get(Config.STORAGE.ACTIVE_DOWNLOADS_MAP); //
        const map = data[Config.STORAGE.ACTIVE_DOWNLOADS_MAP] || {}; //
        map[downloadId] = originalUrl; //
        await chrome.storage.session.set({ [Config.STORAGE.ACTIVE_DOWNLOADS_MAP]: map }); //
    }

    /**
     * Purges a tracker signature once its downstream local saving context completes.
     */
    async removeActiveDownload(downloadId) {
        const data = await chrome.storage.session.get(Config.STORAGE.ACTIVE_DOWNLOADS_MAP); //
        const map = data[Config.STORAGE.ACTIVE_DOWNLOADS_MAP] || {}; //
        delete map[downloadId]; //
        await chrome.storage.session.set({ [Config.STORAGE.ACTIVE_DOWNLOADS_MAP]: map }); //
    }
}