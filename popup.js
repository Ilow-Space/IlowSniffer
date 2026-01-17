// ======================================================================
// FILE PATH: C:\Users\User\OneDrive\Projects\ilow\IlowAgent\popup.js
// ======================================================================
// ======================================================================
// POPUP.JS - Logic Controller
// ======================================================================

import { Templates, ICONS } from "./templates.js";

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
};

// --- API LAYER ---
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
    const defaultHeaders = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
    const response = await fetch(url, {
      ...options,
      headers: { ...defaultHeaders, ...options.headers },
    });
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return response.json();
  }

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
      // Fetch from https://media.ilow.io/api/tasks/active
      // Added cache: 'no-store' to ensure proactive fetching without browser caching
      const data = await this._fetch(`${CONFIG.API_BASE}/tasks/active`, { cache: "no-store" });

      // Expected format: {"downloads":[],"uploads":[]}
      const downloads = Array.isArray(data.downloads) ? data.downloads : [];
      const uploads = Array.isArray(data.uploads) ? data.uploads : [];

      return [...downloads, ...uploads];
    } catch (e) {
      console.warn("Failed to fetch active tasks", e);
      return [];
    }
  }

  async triggerDownload(payload) {
    return this._fetch(`${CONFIG.API_BASE}/download/url`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

// --- UI RENDERER ---
class UIRenderer {
  constructor(containerId, handlers) {
    this.app = document.getElementById(containerId);
    this.handlers = handlers;
  }

  renderError(title, msg, actionBtn = null) {
    this.app.innerHTML = Templates.errorState(title, msg, !!actionBtn, actionBtn?.text);
    if (actionBtn) document.getElementById("btn-err-action").onclick = actionBtn.onClick;
  }

  renderYouTube() {
    this.app.innerHTML = Templates.youtubeState();
  }

  renderVideoList(videos, activeTaskCount, isAuthenticated) {
    const leftBtn = `<button id="btn-clear" class="icon-btn" title="Clear All">${ICONS.TRASH}</button>`;
    const rightBtn = `<button id="btn-show-tasks" class="btn secondary" style="width:auto; padding:6px 12px; font-size:10px;">${activeTaskCount} Active Tasks &rarr;</button>`;

    const headerHtml = Templates.subNav("Detected Streams", leftBtn, rightBtn);

    if (videos.length === 0) {
      this.app.innerHTML = headerHtml + Templates.emptyList();
      // Safely attach refresh handler
      const refreshBtn = document.getElementById("btn-refresh-page");
      if (refreshBtn) refreshBtn.onclick = this.handlers.onRefreshPage;
      // Also attach clear handler if it exists in subnav (though list is empty, good practice)
      const clearBtn = document.getElementById("btn-clear");
      if (clearBtn) clearBtn.onclick = this.handlers.onClearList;
    } else {
      const listHtml = videos
        .map((v, i) => {
          const cleanDisplayUrl = Utils.getCleanVideoUrl(v.url);
          return Templates.videoCard(
            v,
            i,
            Utils.formatTime(v.duration),
            Utils.formatResolution(v.resolution),
            isAuthenticated,
            cleanDisplayUrl,
          );
        })
        .join("");

      // Wrap listHtml in scrollable container
      this.app.innerHTML =
        headerHtml +
        `<div style="flex: 1; overflow-y: auto; min-height: 0; padding-right: 2px; padding-bottom: 10px;">${listHtml}</div>`;

      document
        .querySelectorAll(".select-video-btn")
        .forEach((btn) => (btn.onclick = () => this.handlers.onSelectVideo(btn.getAttribute("data-index"))));
      document
        .querySelectorAll(".copy-trigger")
        .forEach((el) => (el.onclick = () => this.handlers.onCopyUrl(el.getAttribute("data-url"), el)));

      document.querySelectorAll(".btn-download-video").forEach((btn) => {
        btn.onclick = (e) => {
          // Prevent triggering parent clicks if any
          e.stopPropagation();

          const url = btn.getAttribute("data-url");
          const filename = btn.getAttribute("data-filename");

          // Visual feedback
          btn.innerHTML = `...`;
          btn.style.opacity = "0.7";

          this.handlers.onDownloadVideo(url, filename);

          // Reset icon after delay
          setTimeout(() => {
            btn.innerHTML = ICONS.DOWNLOAD; // Make sure ICONS is imported/accessible or pass it
            btn.style.opacity = "1";
          }, 2000);
        };
      });

      const clearBtn = document.getElementById("btn-clear");
      if (clearBtn) clearBtn.onclick = this.handlers.onClearList;
    }

    const tasksBtn = document.getElementById("btn-show-tasks");
    if (tasksBtn) tasksBtn.onclick = this.handlers.onViewTasks;
  }

  renderSearch(state) {
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
    const backBtn = `<button id="btn-back" class="icon-btn">${ICONS.BACK}</button>`;
    const headerHtml = Templates.subNav("Background Tasks", backBtn);

    const listHtml = tasks.length
      ? tasks.map((t) => Templates.taskItem(t)).join("")
      : `<div class="empty-state">// QUEUE_EMPTY</div>`;

    this.app.innerHTML = `${headerHtml}<div class="animate-fade-in">${listHtml}</div>`;
    document.getElementById("btn-back").onclick = this.handlers.onBack;
  }

  renderSuccess() {
    this.app.innerHTML = Templates.successScreen();
    document.getElementById("btn-view-tasks").onclick = this.handlers.onViewTasks;
    document.getElementById("btn-back").onclick = this.handlers.onBack;
  }
}

// --- APP CONTROLLER ---
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
    };

    this.debouncedLocalSearch = Utils.debounce((query) => {
      this.performLocalSearch(query);
    }, 400);
  }

  createHandlers() {
    return {
      onSelectVideo: (idx) => this.startMatchFlow(idx),
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
        if (text.length > 1) {
          this.debouncedLocalSearch(text);
        }
      },
      onGlobalSearch: (q) => this.performGlobalSearch(q),
      onSetType: (type) => {
        this.state.mediaType = type;
        if (!this.state.isLocalResult && this.state.searchQuery) {
          this.performGlobalSearch(this.state.searchQuery);
        } else {
          this.render();
        }
      },
      onSelectMeta: (idx) => this.selectMetaItem(idx),
      onUpdateEp: (s, e) => {
        if (s) this.state.season = s;
        if (e) this.state.episode = e;
      },
      onIngest: () => this.triggerIngest(),
      onDownloadVideo: (url, filename) => {
        chrome.runtime.sendMessage({
          action: "download_video",
          url: url,
          filename: filename,
        });
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
    // 1. Check if we are on YouTube
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      const url = tabs[0].url;
      if (url && (url.includes("youtube.com") || url.includes("youtu.be"))) {
        this.state.view = "youtube";
        this.render();
        return;
      }
    }

    // 2. Check Auth
    this.isAuthenticated = await this.api.initAuth();

    this.render();

    // 3. Start Polling
    this.fetchData();
    // Proactive Polling: 2 seconds interval
    setInterval(() => this.fetchData(), 2000);
  }

  async fetchData() {
    // Only fetch tasks if authenticated
    const newTasks = this.isAuthenticated ? await this.api.getActiveTasks() : [];

    if (this.state.view === "list") {
      chrome.runtime.sendMessage({ action: "get_videos" }, (newVideos) => {
        if (!newVideos) newVideos = [];

        const videosChanged = JSON.stringify(this.state.videos) !== JSON.stringify(newVideos);
        const tasksCountChanged = this.state.tasks.length !== newTasks.length;

        if (videosChanged || tasksCountChanged) {
          this.state.videos = newVideos;
          this.state.tasks = newTasks;
          this.render();
        } else {
          this.state.tasks = newTasks;
        }
      });
    } else if (this.state.view === "tasks") {
      const tasksChanged = JSON.stringify(this.state.tasks) !== JSON.stringify(newTasks);
      if (tasksChanged) {
        this.state.tasks = newTasks;
        this.render();
      }
    }
  }

  clearVideoList() {
    chrome.runtime.sendMessage({ action: "clear_videos" }, () => {
      this.state.videos = [];
      this.render();
    });
  }

  startMatchFlow(index) {
    if (!this.isAuthenticated) {
      this.ui.renderError(
        "Authentication Required",
        `You must be logged in to ingest media.<br><a href="${CONFIG.COOKIE_DOMAIN}" target="_blank" style="color:white;text-decoration:underline;">Go to Ilöw</a>`,
        {
          text: "Check Login Status",
          onClick: () => {
            this.api.initAuth().then((isAuth) => {
              this.isAuthenticated = isAuth;
              if (isAuth) this.startMatchFlow(index);
              else alert("Still not logged in.");
            });
          },
        },
      );
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
    if (!query) return;
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
    if (!query) return;
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
    const item = this.state.searchResults[idx];
    this.state.selectedMeta = item;
    if (item.mediaType) this.state.mediaType = item.mediaType;
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
      this.ui.renderVideoList(this.state.videos, this.state.tasks.length, this.isAuthenticated);
    else if (this.state.view === "youtube") this.ui.renderYouTube();
    else if (this.state.view === "search") this.ui.renderSearch(this.state);
    else if (this.state.view === "tasks") this.ui.renderTasks(this.state.tasks);
    else if (this.state.view === "success") this.ui.renderSuccess();
  }
}

const app = new AppController();
app.init();
