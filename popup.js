// ======================================================================
// FILE PATH: C:\Users\User\OneDrive\Projects\ilow\IlowAgent\popup.js
// ======================================================================

import { Templates, ICONS } from "./templates.js";

// ... [CONFIG and Utils object remain unchanged] ...
const CONFIG = {
  API_BASE: "https://media.ilow.io/api",
  COOKIE_DOMAIN: "https://media.ilow.io",
  AUTH_COOKIE: "ilow_auth_token",
  TMDB_IMG_BASE: "https://image.tmdb.org/t/p/w92",
};

const Utils = {
  getCleanVideoUrl: (url) => {
    if (!url) return "";
    const videoExtRegex = /(.*?\.(mp4|mkv|mov|avi|m3u8))/i;
    const match = url.match(videoExtRegex);
    return match && match[1] ? match[1] : url.split("?")[0].split("#")[0];
  },
  formatTime: (seconds) => {
    if (!seconds) return "00:00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map((v) => (v < 10 ? "0" + v : v)).join(":");
  },
  formatResolution: (resObj) => {
    if (!resObj || !resObj.height) return null;
    return `${resObj.height}p`;
  },
  debounce: (func, wait) => {
    let timeout;
    return function (...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  },
  generateId: (url) => {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `vid-${Math.abs(hash)}`;
  },
};

class ApiService {
  constructor() {
    this.token = null;
  }
  async initAuth() {
    return new Promise((resolve) => {
      chrome.cookies.get({ url: CONFIG.COOKIE_DOMAIN, name: CONFIG.AUTH_COOKIE }, (cookie) => {
        this.token = cookie ? cookie.value : null;
        resolve(!!this.token);
      });
    });
  }
  async _fetch(url, options = {}) {
    if (!this.token) throw new Error("Authentication token is missing.");
    const defaultHeaders = { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" };
    const response = await fetch(url, { ...options, headers: { ...defaultHeaders, ...options.headers } });

    // Graceful handling for non-JSON responses or auth errors
    if (response.status === 401) {
      this.token = null;
      throw new Error("Unauthorized");
    }
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return response.json();
  }

  // ... [searchLibrary and searchTMDB remain unchanged] ...
  async searchLibrary(query, type) {
    if (!this.token) return [];
    return this._fetch(`${CONFIG.API_BASE}/library/search?type=${type}&query=${encodeURIComponent(query)}`);
  }
  async searchTMDB(query, type) {
    if (!this.token) return [];
    return this._fetch(`${CONFIG.API_BASE}/tmdb/search?type=${type}&query=${encodeURIComponent(query)}`);
  }

  async getActiveTasks() {
    if (!this.token) return [];
    try {
      // Fetches regularly based on AppController polling
      const data = await this._fetch(`${CONFIG.API_BASE}/tasks/active`, { cache: "no-store" });

      // Robust handling of the provided JSON format
      const downloads = data && Array.isArray(data.downloads) ? data.downloads : [];
      const uploads = data && Array.isArray(data.uploads) ? data.uploads : [];

      return [...downloads, ...uploads];
    } catch (e) {
      console.warn("[API] Failed to fetch active tasks", e);
      return [];
    }
  }

  async triggerDownload(payload) {
    return this._fetch(`${CONFIG.API_BASE}/download/url`, { method: "POST", body: JSON.stringify(payload) });
  }
}

// ... [UIRenderer and AppController mostly unchanged, ensuring fetchData calls getActiveTasks] ...

class UIRenderer {
  constructor(containerId, handlers) {
    this.app = document.getElementById(containerId);
    this.handlers = handlers;
    this.currentView = null;
  }

  // ... [renderError, renderYouTube, renderVideoList, renderSearch remain unchanged] ...

  renderError(title, msg, actionBtn = null) {
    this.app.innerHTML = Templates.errorState(title, msg, !!actionBtn, actionBtn?.text);
    if (actionBtn) document.getElementById("btn-err-action").onclick = actionBtn.onClick;
    this.currentView = "error";
  }

  renderYouTube() {
    this.app.innerHTML = Templates.youtubeState();
    this.currentView = "youtube";
  }

  renderVideoList(videos, activeTaskCount, isAuthenticated, downloadProgressMap) {
    // (Keep existing implementation from previous file)
    // See previous file content for renderVideoList logic...
    // Just abbreviated here to focus on changes.
    if (this.currentView !== "list") {
      const leftBtn = `<button id="btn-clear" class="icon-btn" title="Clear All">${ICONS.TRASH}</button>`;
      const rightBtn = `<button id="btn-show-tasks" class="btn secondary" style="width:auto; padding:6px 12px; font-size:10px;">${activeTaskCount} Active Tasks &rarr;</button>`;
      const headerHtml = Templates.subNav("Detected Streams", leftBtn, rightBtn);

      this.app.innerHTML = `
            ${headerHtml}
            <div id="video-list-container" style="flex: 1; overflow-y: auto; min-height: 0; padding-right: 2px; padding-bottom: 10px;"></div>
          `;

      const clearBtn = document.getElementById("btn-clear");
      if (clearBtn) clearBtn.onclick = this.handlers.onClearList;
      const tasksBtn = document.getElementById("btn-show-tasks");
      if (tasksBtn) tasksBtn.onclick = this.handlers.onViewTasks;

      this.currentView = "list";
    } else {
      const tasksBtn = document.getElementById("btn-show-tasks");
      if (tasksBtn) tasksBtn.innerHTML = `${activeTaskCount} Active Tasks &rarr;`;
    }

    const container = document.getElementById("video-list-container");
    if (videos.length === 0) {
      if (!document.getElementById("empty-state-msg")) {
        container.innerHTML = Templates.emptyList();
        const refreshBtn = document.getElementById("btn-refresh-page");
        if (refreshBtn) refreshBtn.onclick = this.handlers.onRefreshPage;
      }
      return;
    }

    const emptyState = document.getElementById("empty-state-msg");
    if (emptyState) emptyState.remove();

    const processedIds = new Set();

    videos.forEach((v, i) => {
      const uniqueId = Utils.generateId(v.url);
      processedIds.add(uniqueId);

      const cleanDisplayUrl = v.serverFilename ? v.serverFilename : Utils.getCleanVideoUrl(v.url);
      const progress = downloadProgressMap[v.url] || 0;
      const existingCard = document.getElementById(uniqueId);

      if (existingCard) {
        const progBar = existingCard.querySelector(".js-progress-bar");
        if (progBar) {
          progBar.style.width = `${progress}%`;
          progBar.style.opacity = progress > 0 && progress < 100 ? "1" : "0";
        }
        const progText = existingCard.querySelector(".js-progress-text");
        if (progText) progText.innerText = `DL :: ${progress}%`;

        const dlBtn = existingCard.querySelector(".btn-download-video");
        if (dlBtn) {
          const isDownloading = progress > 0 && progress < 100;
          if (isDownloading && !dlBtn.classList.contains("downloading")) {
            dlBtn.classList.add("downloading");
            dlBtn.innerHTML = Templates.spinnerSvg;
            dlBtn.style.background = "rgba(0,0,0,0.8)";
            dlBtn.style.color = "#67e8f9";
            dlBtn.style.borderColor = "#06b6d4";
          } else if (!isDownloading && dlBtn.classList.contains("downloading")) {
            dlBtn.classList.remove("downloading");
            dlBtn.innerHTML = ICONS.DOWNLOAD;
            dlBtn.style.background = "rgba(0,0,0,0.7)";
            dlBtn.style.color = "white";
            dlBtn.style.borderColor = "rgba(255,255,255,0.2)";
          }
        }
      } else {
        const cardHtml = Templates.videoCard(
          v,
          i,
          Utils.formatTime(v.duration),
          Utils.formatResolution(v.resolution),
          isAuthenticated,
          cleanDisplayUrl,
          progress,
          uniqueId,
        );
        container.insertAdjacentHTML("beforeend", cardHtml);
        const newCard = document.getElementById(uniqueId);
        newCard.querySelector(".select-video-btn").onclick = () => this.handlers.onSelectVideo(i);
        const copyEl = newCard.querySelector(".copy-trigger");
        copyEl.onclick = () => this.handlers.onCopyUrl(copyEl.getAttribute("data-url"), copyEl);
        const dlBtn = newCard.querySelector(".btn-download-video");
        dlBtn.onclick = (e) => {
          e.stopPropagation();
          if (dlBtn.classList.contains("downloading")) return;
          this.handlers.onDownloadVideo(dlBtn.getAttribute("data-url"), dlBtn.getAttribute("data-filename"));
        };
      }
    });

    Array.from(container.children).forEach((child) => {
      if (child.id && !processedIds.has(child.id)) child.remove();
    });
  }

  renderSearch(state) {
    // (Keep existing implementation)
    // See previous file content for renderSearch logic...
    this.currentView = "search";
    const backBtn = `<button id="btn-back" class="icon-btn">${ICONS.BACK}</button>`;
    const headerHtml = Templates.subNav("Metadata Injection", backBtn);
    const sourceLabelHtml = state.isLocalResult
      ? `<div style="font-family:'JetBrains Mono'; font-size:9px; color:var(--status-success); margin-bottom:8px;">// LIBRARY_MATCH</div>`
      : `<div style="font-family:'JetBrains Mono'; font-size:9px; color:var(--accent-primary); margin-bottom:8px;">// GLOBAL_DATABASE_MATCH</div>`;
    const resultsHtml = state.searchResults
      .map((r, idx) => Templates.searchResultItem(r, idx, state.selectedMeta?.id === r.id, CONFIG.TMDB_IMG_BASE))
      .join("");
    this.app.innerHTML = Templates.searchContainer(state, headerHtml, sourceLabelHtml, resultsHtml);

    document.getElementById("btn-back").onclick = this.handlers.onBack;
    document.getElementById("btn-go-search").onclick = () =>
      this.handlers.onGlobalSearch(document.getElementById("inp-search").value);
    document.getElementById("inp-search").oninput = (e) => this.handlers.onSearchInput(e.target.value);
    document.getElementById("set-movie").onclick = () => this.handlers.onSetType("movie");
    document.getElementById("set-tv").onclick = () => this.handlers.onSetType("tv");

    if (state.mediaType === "tv") {
      document.getElementById("inp-season").onchange = (e) => this.handlers.onUpdateEp(e.target.value, null);
      document.getElementById("inp-episode").onchange = (e) => this.handlers.onUpdateEp(null, e.target.value);
    }

    document.getElementById("btn-ingest").onclick = this.handlers.onIngest;
    document.querySelectorAll(".search-result").forEach((el) => {
      el.onclick = () => this.handlers.onSelectMeta(el.getAttribute("data-idx"));
    });
  }

  renderTasks(tasks) {
    this.currentView = "tasks";
    const backBtn = `<button id="btn-back" class="icon-btn">${ICONS.BACK}</button>`;
    const headerHtml = Templates.subNav("Background Tasks", backBtn);

    // Sort: Failed/Processing first, Completed last
    const sortedTasks = [...tasks].sort((a, b) => {
      if (a.status === "failed" && b.status !== "failed") return -1;
      if (a.status !== "failed" && b.status === "failed") return 1;
      return 0;
    });

    const listHtml = sortedTasks.length
      ? sortedTasks.map((t) => Templates.taskItem(t)).join("")
      : `<div class="empty-state">// QUEUE_EMPTY</div>`;

    this.app.innerHTML = `${headerHtml}<div class="animate-fade-in" style="overflow-y:auto; padding-right:2px; height:100%;">${listHtml}</div>`;
    document.getElementById("btn-back").onclick = this.handlers.onBack;
  }

  renderSuccess() {
    // (Keep existing implementation)
    this.currentView = "success";
    this.app.innerHTML = Templates.successScreen();
    document.getElementById("btn-view-tasks").onclick = this.handlers.onViewTasks;
    document.getElementById("btn-back").onclick = this.handlers.onBack;
  }
}

class AppController {
  constructor() {
    this.api = new ApiService();
    this.ui = new UIRenderer("app", this.createHandlers());
    this.isAuthenticated = false;
    this.state = {
      view: "list",
      videos: [],
      tasks: [],
      mediaType: "movie",
      searchQuery: "",
      searchResults: [],
      isLocalResult: false,
      selectedVideo: null,
      selectedMeta: null,
      season: 1,
      episode: 1,
      downloadProgressMap: {},
    };
    this.debouncedLocalSearch = Utils.debounce((query) => {
      this.performLocalSearch(query);
    }, 400);
  }

  createHandlers() {
    return {
      onSelectVideo: (idx) => {
        if (this.state.videos[idx]) this.startMatchFlow(idx);
      },
      onClearList: () => this.clearVideoList(),
      onViewTasks: () => {
        this.state.view = "tasks";
        this.render();
      },
      onBack: () => {
        this.state.view = "list";
        this.render();
      },
      onSearchInput: (text) => {
        this.state.searchQuery = text;
        if (text.length > 1) this.debouncedLocalSearch(text);
      },
      onGlobalSearch: (q) => this.performGlobalSearch(q),
      onSetType: (type) => {
        this.state.mediaType = type;
        if (!this.state.isLocalResult && this.state.searchQuery) this.performGlobalSearch(this.state.searchQuery);
        else this.render();
      },
      onSelectMeta: (idx) => this.selectMetaItem(idx),
      onUpdateEp: (s, e) => {
        if (s) this.state.season = s;
        if (e) this.state.episode = e;
      },
      onIngest: () => this.triggerIngest(),
      onDownloadVideo: (url, filename) => {
        this.state.downloadProgressMap[url] = 1;
        this.render();
        chrome.runtime.sendMessage({ action: "download_video", url: url, filename: filename });
      },
      onCopyUrl: (url, el) => {
        const cleanUrlToCopy = Utils.getCleanVideoUrl(url);
        navigator.clipboard.writeText(cleanUrlToCopy);
        const originalText = el.innerText;
        el.innerText = "✅ COPIED";
        el.style.color = "var(--status-success)";
        el.style.borderColor = "var(--status-success)";
        setTimeout(() => {
          el.innerText = originalText;
          el.style.color = "";
          el.style.borderColor = "";
        }, 1200);
      },
      onRefreshPage: () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
        });
      },
    };
  }

  async init() {
    this.isAuthenticated = await this.api.initAuth();
    this.render();
    this.fetchData();
    // Handles the "Regularly Fetched" requirement
    setInterval(() => this.fetchData(), 1000);
  }

  async fetchData() {
    // Fetches uploads/downloads in the specified format
    const newTasks = this.isAuthenticated ? await this.api.getActiveTasks() : [];

    // Existing logic for local Chrome downloads
    const sessionStore = await chrome.storage.session.get("activeDownloadsMap");
    const downloadMap = sessionStore.activeDownloadsMap || {};

    chrome.downloads.search({ state: "in_progress" }, (items) => {
      const newProgressMap = {};
      const mapIds = new Set(Object.keys(downloadMap).map(Number));
      if (items && items.length > 0) {
        items.forEach((item) => {
          if (mapIds.has(item.id)) {
            const originalUrl = downloadMap[item.id];
            if (!originalUrl) return;
            const pct =
              item.totalBytes > 0
                ? Math.floor((item.bytesReceived / item.totalBytes) * 100)
                : this.state.downloadProgressMap[originalUrl] < 90
                  ? (this.state.downloadProgressMap[originalUrl] || 0) + 3
                  : 90;
            newProgressMap[originalUrl] = pct;
          }
        });
      }
      this.state.downloadProgressMap = newProgressMap;

      if (this.state.view === "list") {
        chrome.runtime.sendMessage({ action: "get_videos" }, (newVideos) => {
          this.state.videos = newVideos || [];
          this.state.tasks = newTasks;
          this.render();
        });
      } else if (this.state.view === "tasks") {
        // Simple diff to prevent DOM thrashing if tasks haven't changed
        if (JSON.stringify(this.state.tasks) !== JSON.stringify(newTasks)) {
          this.state.tasks = newTasks;
          this.render();
        }
      }
    });
  }

  // ... [clearVideoList, startMatchFlow, performLocalSearch, performGlobalSearch, selectMetaItem, triggerIngest, render remain unchanged] ...

  clearVideoList() {
    chrome.runtime.sendMessage({ action: "clear_videos" }, () => {
      this.state.videos = [];
      this.render();
    });
  }

  startMatchFlow(index) {
    if (!this.isAuthenticated) {
      alert("Please log in first.");
      return;
    }
    this.state.selectedVideo = this.state.videos[index];
    const query = this.state.selectedVideo.pageTitle
      ? this.state.selectedVideo.pageTitle.split("-")[0].split("|")[0].trim()
      : "";
    this.state.searchQuery = query;
    this.state.view = "search";
    this.state.searchResults = [];
    this.state.selectedMeta = null;
    this.render();
    if (query) this.performLocalSearch(query);
  }

  async performLocalSearch(query) {
    try {
      const [movies, series] = await Promise.all([
        this.api.searchLibrary(query, "movie"),
        this.api.searchLibrary(query, "tv"),
      ]);
      const combined = [
        ...(movies || []).map((m) => ({
          ...m,
          mediaType: "movie",
          is_local: true,
          title: m.title || m.name,
          release_date: m.release_date,
        })),
        ...(series || []).map((s) => ({
          ...s,
          mediaType: "tv",
          is_local: true,
          title: s.title || s.name,
          release_date: s.first_air_date,
        })),
      ];
      this.state.searchResults = combined;
      this.state.isLocalResult = true;
      this.render();
    } catch (e) {
      console.error(e);
    }
  }

  async performGlobalSearch(query) {
    try {
      const res = await this.api.searchTMDB(query, this.state.mediaType);
      this.state.searchResults = (res || []).map((r) => ({
        ...r,
        title: r.title || r.name,
        release_date: r.release_date || r.first_air_date,
        is_local: false,
        mediaType: this.state.mediaType,
      }));
      this.state.isLocalResult = false;
      this.render();
    } catch (e) {
      console.error(e);
    }
  }

  selectMetaItem(idx) {
    this.state.selectedMeta = this.state.searchResults[idx];
    if (this.state.selectedMeta.mediaType) this.state.mediaType = this.state.selectedMeta.mediaType;
    this.render();
  }

  async triggerIngest() {
    try {
      this.ui.app.innerHTML = `<div class="empty-state" style="padding:40px;">// INITIATING_UPLINK...</div>`;
      const cleanUrl = Utils.getCleanVideoUrl(this.state.selectedVideo.url);
      const payload = {
        url: cleanUrl,
        tmdbId: this.state.selectedMeta.tmdb_id || this.state.selectedMeta.id,
        mediaType: this.state.mediaType,
      };
      if (this.state.mediaType === "tv") {
        payload.season = parseInt(this.state.season);
        payload.episode = parseInt(this.state.episode);
      }
      await this.api.triggerDownload(payload);
      this.state.view = "success";
      this.render();
    } catch (e) {
      this.ui.renderError("Ingest Failed", e.message, {
        text: "Back",
        onClick: () => {
          this.state.view = "search";
          this.render();
        },
      });
    }
  }

  render() {
    if (this.state.view === "list")
      this.ui.renderVideoList(
        this.state.videos,
        this.state.tasks.length,
        this.isAuthenticated,
        this.state.downloadProgressMap,
      );
    else if (this.state.view === "youtube") this.ui.renderYouTube();
    else if (this.state.view === "search") this.ui.renderSearch(this.state);
    else if (this.state.view === "tasks") this.ui.renderTasks(this.state.tasks);
    else if (this.state.view === "success") this.ui.renderSuccess();
  }
}

const app = new AppController();
app.init();
