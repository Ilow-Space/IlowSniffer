import { Config } from "../../shared/Config.js";
import { MetadataMatch } from "../../domain/ingestion/models/MetadataMatch.js";
import { reactive } from "vue";

class PopupController {
    constructor() {
        this.authToken = null;
        this.state = reactive({
            view: "list",
            videos: [],
            tasks: [],
            mediaCounts: {
                video: 0,
                image: 0,
                audio: 0
            },
            mediaType: "movie",
            searchQuery: "",
            searchResults: [],
            isLocalResult: false,
            selectedVideo: null,
            selectedMeta: null,
            season: 1,
            episode: 1,
            downloadProgressMap: {}
        });

        this.init();
    }

    async init() {
        this.authToken = await this.resolveSessionAuthentication();
        this.refreshIntervalData();
        setInterval(() => this.refreshIntervalData(), 1000);
    }

    async resolveSessionAuthentication() {
        return new Promise((resolve) => {
            chrome.cookies.getAll({ name: Config.NETWORK.AUTH_COOKIE_NAME }, (cookies) => {
                const matchingCookie = cookies?.find((c) => c.domain.includes("ilow.io"));
                resolve(matchingCookie ? matchingCookie.value : null);
            });
        });
    }

    /**
     * Delegates all requests to Background Service Worker.
     * Uses native browser cookie delegation (no custom headers attached).
     */
    async executeAuthenticatedFetch(endpoint, options = {}) {
        if (!this.authToken) {
            throw new Error("Session authentication missing.");
        }

        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: "execute_network_fetch",
                endpoint: endpoint,
                options: options
            }, (response) => {
                if (chrome.runtime.lastError) {
                    return reject(new Error(chrome.runtime.lastError.message));
                }

                if (!response || !response.success) {
                    if (response?.status === 401) {
                        this.authToken = null; // Session expired
                    }
                    return reject(new Error(response?.error || "Network request failed"));
                }

                resolve(response.data);
            });
        });
    }

    async refreshIntervalData() {
        try {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    chrome.runtime.sendMessage({ action: "get_tab_media_counts", tabId: tabs[0].id }, (res) => {
                        if (!chrome.runtime.lastError && res) {
                            this.state.mediaCounts = res;
                        }
                    });
                }
            });

            let activeTasks = [];
            if (this.authToken) {
                try {
                    const taskData = await this.executeAuthenticatedFetch("/tasks/active");
                    const downloads = taskData && Array.isArray(taskData.downloads) ? taskData.downloads : [];
                    const uploads = taskData && Array.isArray(taskData.uploads) ? taskData.uploads : [];
                    activeTasks = [...downloads, ...uploads];
                } catch (apiErr) {
                    // Silently absorb polling dropouts
                }
            }

            const store = await chrome.storage.session.get(Config.STORAGE.ACTIVE_DOWNLOADS_MAP);
            const downloadMap = store[Config.STORAGE.ACTIVE_DOWNLOADS_MAP] || {};

            chrome.downloads.search({ state: "in_progress" }, (items) => {
                const newProgressMap = {};
                const activeIds = new Set(Object.keys(downloadMap).map(Number));

                if (items && items.length > 0) {
                    items.forEach((item) => {
                        if (activeIds.has(item.id)) {
                            const originalUrl = downloadMap[item.id];
                            if (!originalUrl) return;

                            const pct = item.totalBytes > 0
                                ? Math.floor((item.bytesReceived / item.totalBytes) * 100)
                                : (this.state.downloadProgressMap[originalUrl] < 90 ? (this.state.downloadProgressMap[originalUrl] || 0) + 3 : 90);

                            newProgressMap[originalUrl] = pct;
                        }
                    });
                }
                this.state.downloadProgressMap = newProgressMap;

                if (this.state.view === "list") {
                    chrome.runtime.sendMessage({ action: "get_videos" }, (videos) => {
                        if (videos && Array.isArray(videos)) {
                            if (this.state.videos.length === 0) {
                                this.state.videos = videos;
                            } else {
                                videos.forEach(incomingVid => {
                                    const existingVid = this.state.videos.find(v => v.key === incomingVid.key);
                                    if (existingVid) {
                                        Object.assign(existingVid, incomingVid);
                                    } else {
                                        this.state.videos.push(incomingVid);
                                    }
                                });
                                this.state.videos = this.state.videos.filter(v => videos.some(inc => inc.key === v.key));
                            }
                        }
                        this.state.tasks = activeTasks;
                    });
                } else if (this.state.view === "tasks") {
                    this.state.tasks = activeTasks;
                }
            });
        } catch (e) {
            console.warn("[Popup Engine] Task polling routine failed structurally:", e);
        }
    }

    async initializeSequence(video) {
        this.state.selectedVideo = video;
        this.state.view = "search";
        this.state.searchResults = [];
        this.state.selectedMeta = null;

        const heuristics = video.heuristics || {};
        let targetYear = heuristics.year || null;

        if (heuristics.title) {
            this.state.searchQuery = heuristics.title;
            if (heuristics.mediaType) this.state.mediaType = heuristics.mediaType;
            if (heuristics.season) this.state.season = heuristics.season;
            if (heuristics.episode) this.state.episode = heuristics.episode;

            // Pass `true` to flag this as the automated startup sequence
            await this.executeLocalLibraryDatabaseSearch(this.state.searchQuery, targetYear, true);
        } else {
            const genericTitle = video.serverFilename
                ? video.serverFilename.split(".")[0].replace(/[-_]/g, " ")
                : (video.pageTitle ? video.pageTitle.split("-")[0].trim() : "");

            this.state.searchQuery = genericTitle;

            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    chrome.tabs.sendMessage(
                        tabs[0].id,
                        { action: "extract_page_heuristics" },
                        { frameId: 0 },
                        async (res) => {
                            if (!chrome.runtime.lastError && res && res.data) {
                                if (res.data.title) this.state.searchQuery = res.data.title;
                                if (res.data.mediaType) this.state.mediaType = res.data.mediaType;
                                if (res.data.season) this.state.season = res.data.season;
                                if (res.data.episode) this.state.episode = res.data.episode;
                                if (res.data.year) targetYear = res.data.year;
                            }
                            if (this.state.searchQuery) {
                                // Pass `true` here as well
                                await this.executeLocalLibraryDatabaseSearch(this.state.searchQuery, targetYear, true);
                            }
                        }
                    );
                } else if (genericTitle) {
                    this.executeLocalLibraryDatabaseSearch(genericTitle, null, true);
                }
            });
        }
    }

    async executeLocalLibraryDatabaseSearch(query, targetYear = null, isAutoFlow = false) {
        if (!query || !query.trim()) {
            this.state.searchResults = [];
            return;
        }

        try {
            const [movies, series] = await Promise.all([
                this.executeAuthenticatedFetch(`/library/search?type=movie&query=${encodeURIComponent(query)}`).catch(() => []),
                this.executeAuthenticatedFetch(`/library/search?type=tv&query=${encodeURIComponent(query)}`).catch(() => [])
            ]);

            const safeMovies = Array.isArray(movies) ? movies : (movies?.data || []);
            const safeSeries = Array.isArray(series) ? series : (series?.data || []);

            const combined = [
                ...safeMovies.map(m => MetadataMatch.fromLocalSchema(m, "movie")),
                ...safeSeries.map(s => MetadataMatch.fromLocalSchema(s, "tv"))
            ];

            if (combined.length > 0) {
                this.state.isLocalResult = true;
                this.autoSelectExactMetadataMatch(combined, targetYear, query, isAutoFlow);
            } else {
                await this.executeCloudGlobalSearch(query, targetYear, isAutoFlow);
            }
        } catch (err) {
            await this.executeCloudGlobalSearch(query, targetYear, isAutoFlow);
        }
    }

    async executeCloudGlobalSearch(query, targetYear = null, isAutoFlow = false) {
        if (!query || !query.trim()) {
            this.state.searchResults = [];
            return;
        }

        try {
            const response = await this.executeAuthenticatedFetch(
                `/tmdb/search?type=${this.state.mediaType}&query=${encodeURIComponent(query)}`
            );

            const safeResponse = Array.isArray(response) ? response : (response?.data || []);
            const matches = safeResponse.map(r => MetadataMatch.fromGlobalSchema(r, this.state.mediaType));

            this.state.isLocalResult = false;
            this.autoSelectExactMetadataMatch(matches, targetYear, query, isAutoFlow);
        } catch (e) {
            this.state.searchResults = [];
        }
    }

    /**
     * Advanced Zero-Touch Selection Engine
     */
    autoSelectExactMetadataMatch(results, targetYear, targetTitle, isAutoFlow = false) {
        if (!results || results.length === 0) {
            this.state.searchResults = [];
            this.state.selectedMeta = null;
            return;
        }

        let candidates = results;

        // 1. Primary Filter: Year Match
        if (targetYear) {
            const targetYearStr = String(targetYear);
            const yearMatches = candidates.filter(item => {
                const itemDate = item.release_date || item.first_air_date || "";
                return itemDate.startsWith(targetYearStr);
            });

            if (yearMatches.length > 0) {
                candidates = yearMatches;
            }
        }

        // 2. Secondary Filter: Exact Title Match
        if (candidates.length > 1 && targetTitle) {
            const titleMatches = candidates.filter(item => {
                const title = item.title || item.name || "";
                return title.toLowerCase() === targetTitle.toLowerCase();
            });

            if (titleMatches.length > 0) {
                candidates = titleMatches;
            }
        }

        // CRITICAL FIX: Always display the valid candidates so the Extension UI doesn't blank out!
        this.state.searchResults = candidates;

        // 3. Final Execution State
        if (candidates.length === 1) {
            this.state.selectedMeta = candidates[0];

            // ONLY Auto-Ingest if this was triggered by the page opening, NOT by manual typing!
            if (isAutoFlow) {
                console.log("[Popup Engine] Perfect match locked. Auto-executing ingest...");
                // Brief 150ms delay lets Vue render the selected visual state before freezing on the API call
                setTimeout(() => {
                    this.executeUplinkIngestCommand();
                }, 150);
            }
        } else {
            this.state.selectedMeta = null;
        }
    }
    async executeUplinkIngestCommand() {
        try {
            let targetUrl = this.state.selectedVideo.url;

            // HDRezka / Voidboost direct MP4 bypass heuristic
            if (targetUrl.includes("voidboost") || targetUrl.includes("rezka")) {
                targetUrl = targetUrl.replace(/:hls:manifest\.m3u8/i, "");
            }

            let dynamicName = this.state.selectedMeta.title || this.state.selectedMeta.name;
            if (this.state.mediaType === "tv") {
                dynamicName += ` S${String(this.state.season).padStart(2, '0')}E${String(this.state.episode).padStart(2, '0')}`;
            }

            // 🚀 BUG 2 FIX: Prioritize TMDB ID over local database primary key
            const targetTmdbId = this.state.selectedMeta.tmdbId
                || this.state.selectedMeta.tmdb_id
                || this.state.selectedMeta.id;

            const payload = {
                url: targetUrl,
                tmdbId: parseInt(targetTmdbId),
                mediaType: this.state.mediaType,
                originalName: dynamicName,
                headers: this.state.selectedVideo.headers || {}
            };

            if (this.state.mediaType === "tv") {
                payload.season = parseInt(this.state.season);
                payload.episode = parseInt(this.state.episode);
            }

            await this.executeAuthenticatedFetch("/download/url", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            this.state.view = "success";
        } catch (e) {
            alert(`Ingest Failed: ${e.message}`);
        }
    }
}

export { PopupController };