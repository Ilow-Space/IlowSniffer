<template>
  <div class="flex flex-col h-full w-full">
    <!-- Top Bar Navigation with Dynamic Technical Counters -->
    <nav class="nav-header flex items-center justify-between px-3 py-2 border-b border-zinc-900 bg-zinc-950">
      <div class="flex items-center gap-2">
        <div class="w-5 h-5 bg-blue-600 rounded flex items-center justify-center shadow-[0_0_10px_rgba(59,130,246,0.3)]">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
        </div>
        <div class="flex flex-col leading-none">
          <span class="font-bold text-xs tracking-wider text-white">ILÖW</span>
          <span class="text-[9px] text-zinc-500 font-semibold tracking-tight">Sniffer</span>
        </div>
      </div>

      <!-- TECHNICAL DYNAMIC COUNTERS -->
      <div class="flex items-center gap-2 font-mono text-[9px] bg-zinc-900/90 px-2 py-1 rounded border border-zinc-800">
        <div class="flex items-center gap-1 text-cyan-400" title="Videos Detected">
          <span class="font-bold tracking-tighter">VID:</span>
          <span class="text-white font-semibold">{{ controller.state.mediaCounts.video }}</span>
        </div>
        <span class="text-zinc-700">|</span>
        <div class="flex items-center gap-1 text-emerald-400" title="Images Detected">
          <span class="font-bold tracking-tighter">IMG:</span>
          <span class="text-white font-semibold">{{ controller.state.mediaCounts.image }}</span>
        </div>
        <span class="text-zinc-700">|</span>
        <div class="flex items-center gap-1 text-amber-400" title="Audio Tracks Detected">
          <span class="font-bold tracking-tighter">AUD:</span>
          <span class="text-white font-semibold">{{ controller.state.mediaCounts.audio }}</span>
        </div>
      </div>
    </nav>

    <!-- LIST VIEW: Active Stream Scanner -->
    <main v-if="controller.state.view === 'list'" class="flex-1 flex flex-col p-3 min-h-0">
      <div class="section-header">
        <div class="flex items-center gap-2">
          <button @click="clearAllVideos" class="btn-icon" title="Clear All">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
          <span class="section-title">Detected Streams</span>
        </div>
        <button @click="controller.state.view = 'tasks'" class="btn-secondary">
          {{ controller.state.tasks.length }} Active Tasks &rarr;
        </button>
      </div>

      <!-- Empty State Fallback -->
      <div v-if="controller.state.videos.length === 0" class="empty-state-box">
        <div class="text-3xl text-zinc-800 mb-2 animate-pulse">◎</div>
        <div class="font-mono text-[10px] text-zinc-400 tracking-widest font-bold mb-1">// NO_SOURCES_FOUND</div>
        <p class="text-[11px] text-zinc-500 max-w-[200px] leading-normal mb-4">No media detected.<br>Refresh to capture active streams.</p>
        <button @click="refreshActivePage" class="btn-secondary">REFRESH PAGE</button>
      </div>

      <!-- Captured Streams List -->
      <div v-else class="flex-1 overflow-y-auto pr-0.5 space-y-2 pb-4 min-h-0">
        <div v-for="video in controller.state.videos" :key="video.key" class="panel-card overflow-hidden transition-all duration-300">
          
          <!-- COMPACT COLLAPSED PRELOADER STATE (UNLOADED MEDIA) -->
          <div v-if="!isFullyLoaded(video)" class="p-2.5 bg-zinc-950/90 border border-amber-500/20 rounded-md flex items-center justify-between gap-2.5 shadow-sm">
            <div class="flex items-center gap-2.5 min-w-0 flex-1">
              <div class="w-3.5 h-3.5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0"></div>
              <div class="flex flex-col min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="text-[9px] font-bold text-amber-400 font-mono tracking-wider">// PARSING_STREAM</span>
                  <span class="text-[8px] font-mono px-1 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                    {{ getMissingInfoLabel(video) }}
                  </span>
                </div>
                
                <!-- MINIATURE HEURISTICS TAG FOR COLLAPSED VIEW -->
                <div v-if="video.heuristics" class="flex items-center gap-1.5 mt-1">
                  <span class="px-1 py-0.5 bg-indigo-600/80 text-white text-[8px] font-bold rounded truncate max-w-[120px]">
                      {{ video.heuristics.title }}
                  </span>
                  <span v-if="video.heuristics.mediaType === 'tv'" class="px-1 py-0.5 bg-zinc-800/80 text-zinc-300 text-[8px] font-mono font-bold rounded border border-zinc-700">
                      S{{ video.heuristics.season }}E{{ video.heuristics.episode }}
                  </span>
                </div>
                <div v-else class="text-[10px] font-mono text-zinc-400 truncate mt-0.5" :title="video.url">
                  {{ video.serverFilename || video.url }}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-1.5 shrink-0">
              <button @click.stop="copyStreamUrl(video.url, $event)" class="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 text-[10px]" title="Copy URL">
                📋
              </button>
              <button @click="initializeSequence(video)" 
                      class="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 rounded text-[9px] font-bold font-mono tracking-wider transition-all"
                      :disabled="!isAuthenticated">
                INGEST
              </button>
            </div>
          </div>

          <!-- FULLY EXPANDED MEDIA CARD (LOADED MEDIA) -->
          <template v-else>
            <canvas :ref="(el) => attachCanvasProgress(el, video.key, video.url)" class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none transition-opacity duration-300"></canvas>

            <div class="relative w-full aspect-video bg-black overflow-hidden z-10 border-b border-zinc-900">
              <img :src="video.thumbnail || fallbackThumb" class="w-full h-full object-cover opacity-80" />
              <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent pointer-events-none"></div>
              
              <!-- FULL HEURISTICS TAG FOR EXPANDED VIEW (TOP LEFT) -->
              <div v-if="video.heuristics" class="absolute top-2 left-2 z-30 flex flex-col gap-1 pointer-events-none max-w-[70%]">
                <span class="px-1.5 py-0.5 bg-indigo-600/90 text-white text-[9px] font-bold rounded shadow-sm backdrop-blur-md truncate">
                  {{ video.heuristics.title }}
                </span>
                <span v-if="video.heuristics.mediaType === 'tv'" class="px-1.5 py-0.5 bg-zinc-900/90 text-zinc-300 text-[8px] font-mono font-bold rounded border border-zinc-700 w-max shadow-sm backdrop-blur-md">
                  S{{ video.heuristics.season }} E{{ video.heuristics.episode }}
                </span>
              </div>
              
              <button @click.stop="triggerLocalDownload(video)" 
                      class="absolute top-2 right-2 w-7 h-7 rounded-md text-white border flex items-center justify-center cursor-pointer backdrop-blur-md z-20 transition-all duration-200"
                      :class="isDownloading(video.url) ? 'bg-black border-cyan-500 text-cyan-400 animate-pulse' : 'bg-black/50 border-white/10 hover:bg-black/80 hover:border-white/30'">
                <span v-if="isDownloading(video.url)" class="text-xs">⏳</span>
                <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </button>

              <div class="absolute bottom-2 left-2 flex gap-1.5 z-20">
                <div class="badge-dark">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  <span>{{ formatTime(video.duration) }}</span>
                </div>
                <div v-if="video.resolution" class="badge-accent">
                  {{ video.resolution.height }}p
                </div>
              </div>
            </div>

            <div class="p-2.5 relative z-20 bg-zinc-950/40">
              <div @click="copyStreamUrl(video.url, $event)" class="mb-2 text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-1.5 rounded border border-zinc-800/60 whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer hover:text-zinc-200 hover:border-zinc-700 transition-all">
                {{ video.serverFilename || video.url }}
              </div>
              <button @click="initializeSequence(video)" 
                      :class="isAuthenticated ? 'btn-primary' : 'btn-disabled'"
                      :disabled="!isAuthenticated">
                {{ isAuthenticated ? "INITIALIZE SEQUENCE" : "LOGIN REQUIRED" }}
              </button>
            </div>
          </template>

        </div>
      </div>
    </main>

    <!-- SEARCH VIEW: Metadata Matcher -->
    <main v-if="controller.state.view === 'search'" class="flex-1 flex flex-col p-3 min-h-0 animate-fade-in">
      <div class="section-header">
        <button @click="controller.state.view = 'list'" class="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all font-bold text-xs">←</button>
        <span class="section-title">Metadata Injection</span>
      </div>

      <div class="flex mb-3 shadow-sm">
        <input type="text" v-model="controller.state.searchQuery" @input="debouncedSearch" class="flex-1 rounded-l-md rounded-r-none" placeholder="Search database..." />
        <button @click="controller.executeCloudGlobalSearch(controller.state.searchQuery)" class="px-3 bg-zinc-900 border border-l-0 border-zinc-800 rounded-r-md text-zinc-400 hover:text-white transition-colors text-xs">🔍</button>
      </div>

      <div class="grid grid-cols-2 gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-md mb-3">
        <button @click="setMediaType('movie')" class="tab-btn" :class="controller.state.mediaType === 'movie' ? 'tab-btn-active' : 'tab-btn-inactive'">MOVIE</button>
        <button @click="setMediaType('tv')" class="tab-btn" :class="controller.state.mediaType === 'tv' ? 'tab-btn-active' : 'tab-btn-inactive'">TV SERIES</button>
      </div>

      <div class="font-mono text-[9px] text-cyan-500 font-semibold mb-2 tracking-wide">// {{ controller.state.isLocalResult ? 'LIBRARY_MATCH' : 'GLOBAL_DATABASE_MATCH' }}</div>

      <div class="flex-1 overflow-y-auto pr-0.5 space-y-1 mb-3 min-h-0 border border-zinc-900/60 rounded-md p-1 bg-zinc-950/20">
        <div v-if="controller.state.searchResults.length === 0" class="h-full flex items-center justify-center text-zinc-600 font-mono text-[10px]">// NO_DATA_FOUND</div>
        <div v-for="result in controller.state.searchResults" :key="result.id" @click="controller.state.selectedMeta = result" 
             class="flex gap-2.5 p-1.5 rounded-md cursor-pointer transition-all border"
             :class="controller.state.selectedMeta?.id === result.id ? 'bg-blue-500/10 border-blue-500/60' : 'bg-transparent border-transparent hover:bg-zinc-900/40'">
          <div class="w-8 h-12 flex-shrink-0 bg-zinc-900 rounded overflow-hidden border border-zinc-800">
            <img :src="result.posterUrl || fallbackThumb" class="w-full h-full object-cover" />
          </div>
          <div class="flex-1 min-w-0 flex flex-col justify-center">
            <div class="text-[11px] font-bold text-white truncate mb-1">{{ result.title }}</div>
            <div class="flex items-center gap-2">
              <span class="text-[9px] font-mono text-zinc-500">{{ result.year }}</span>
              <span class="badge-pill" :class="result.isLocal ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'bg-sky-500/10 border-sky-500/30 text-sky-400'">
                {{ result.isLocal ? 'LIBRARY' : 'TMDB' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="controller.state.mediaType === 'tv'" class="flex gap-2 mb-3 animate-fade-in">
        <div class="flex-1">
          <label class="text-[9px] font-bold text-zinc-500 block mb-1 tracking-wider">SEASON</label>
          <input type="number" v-model="controller.state.season" min="1" class="w-full text-center">
        </div>
        <div class="flex-1">
          <label class="text-[9px] font-bold text-zinc-500 block mb-1 tracking-wider">EPISODE</label>
          <input type="number" v-model="controller.state.episode" min="1" class="w-full text-center">
        </div>
      </div>

      <button @click="controller.executeUplinkIngestCommand()" 
              class="btn-primary" 
              :disabled="!controller.state.selectedMeta">
        EXECUTE INGEST
      </button>
    </main>

    <!-- TASKS VIEW: Background Queue -->
    <main v-if="controller.state.view === 'tasks'" class="flex-1 flex flex-col p-3 min-h-0 animate-fade-in">
      <div class="section-header">
        <button @click="controller.state.view = 'list'" class="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all font-bold text-xs">←</button>
        <span class="section-title">Background Tasks</span>
      </div>

      <div class="flex-1 overflow-y-auto pr-0.5 space-y-2 pb-2 min-h-0">
        <div v-if="controller.state.tasks.length === 0" class="text-center py-8 text-zinc-600 font-mono text-[10px] bg-zinc-950/20 border border-zinc-900 border-dashed rounded-lg">// QUEUE_EMPTY</div>
        <div v-for="task in controller.state.tasks" :key="task.downloadId" class="panel-card p-3 shadow-sm">
          <div class="flex justify-between items-start mb-2.5">
            <div class="flex-1 min-w-0 pr-2">
              <div class="flex items-center gap-1.5 mb-1">
                <span class="px-1 rounded bg-zinc-900 border border-zinc-800 text-white text-[8px] font-bold font-mono tracking-tight">{{ task.mediaType === 'tv' ? 'TV' : 'MOV' }}</span>
                <span class="text-[9px] font-mono text-zinc-500">ID: {{ task.tmdbId || 'N/A' }}</span>
              </div>
              <div class="text-[11px] font-bold text-zinc-100 truncate" :title="task.originalName">{{ task.originalName }}</div>
            </div>
            <span class="text-[8px] font-bold px-1.5 py-0.5 border rounded uppercase tracking-wider font-mono shadow-sm"
                  :class="task.status === 'completed' ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5' : task.status === 'failed' ? 'border-red-500/40 text-red-400 bg-red-500/5' : 'border-blue-500/40 text-blue-400 bg-blue-500/5'">
              {{ task.status ? task.status.toUpperCase() : 'UNKNOWN' }}
            </span>
          </div>
          <div class="h-1 w-full bg-zinc-900 border border-zinc-800/40 rounded overflow-hidden">
            <div class="h-full transition-all duration-300"
                 :class="task.status === 'completed' ? 'bg-emerald-500' : task.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'"
                 :style="{ width: calculateTaskProgress(task) + '%' }"></div>
          </div>
        </div>
      </div>
    </main>

    <!-- SUCCESS VIEW: Transmit Confirmation -->
    <main v-if="controller.state.view === 'success'" class="empty-state-box animate-fade-in">
      <div class="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 flex items-center justify-center text-xl font-bold mb-4 shadow-[0_0_15px_rgba(16,185,129,0.15)]">✓</div>
      <h2 class="text-sm font-bold text-white mb-1.5 uppercase tracking-wide">Sequence Initiated</h2>
      <p class="text-[11px] text-zinc-400 max-w-[220px] leading-normal mb-6">The ingest protocol has been successfully transmitted to the server.</p>
      <div class="w-full space-y-2">
        <button @click="controller.state.view = 'tasks'" class="btn-primary">MONITOR PROGRESS</button>
        <button @click="controller.state.view = 'list'" class="btn-secondary w-full">RETURN TO SCANNER</button>
      </div>
    </main>
  </div>
</template>

<script>
import { ProgressManager } from "../../progress_manager.js";
import { UrlCleaner } from "../../domain/capture/services/UrlCleaner.js";

export default {
  name: "PopupComponent",
  props: {
    controller: {
      type: Object,
      required: true
    }
  },
  data() {
    return {
      fallbackThumb: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMjAiIGhlaWdodD0iMTgwIiB2aWV3Qm94PSIwIDAgMzIwIDE4MCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzE4MTgxYiIvPjwvc3ZnPg==",
      debounceTimer: null
    };
  },
  computed: {
    isAuthenticated() {
      return !!this.controller.authToken;
    }
  },
  methods: {
    isFullyLoaded(video) {
      return video.status === "ready" && (!!video.thumbnail || video.duration > 0 || video.processed);
    },
    getMissingInfoLabel(video) {
      if (!video.duration && !video.thumbnail) return "AWAITING METADATA";
      if (!video.duration) return "PARSING DURATION";
      if (!video.thumbnail) return "GENERATING PREVIEW";
      return "FETCHING STREAM";
    },
    formatTime(seconds) {
      if (!seconds) return "00:00:00";
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      return [h, m, s].map((v) => (v < 10 ? "0" + v : v)).join(":");
    },
    isDownloading(videoUrl) {
      const progress = this.controller.state.downloadProgressMap[videoUrl];
      return progress > 0 && progress < 100;
    },
    calculateTaskProgress(task) {
      if (task.status === "completed") return 100;
      if (task.totalSize > 0) {
        return Math.round((task.bytesDownloaded / task.totalSize) * 100);
      }
      return 0;
    },
    attachCanvasProgress(canvasElement, elementId, videoUrl) {
      if (!canvasElement) return;
      const currentProgress = this.controller.state.downloadProgressMap[videoUrl] || 0;
      ProgressManager.init(elementId, canvasElement, currentProgress);
      canvasElement.style.opacity = currentProgress > 0 ? "1" : "0";
    },
    clearAllVideos() {
      chrome.runtime.sendMessage({ action: "clear_videos" }, () => {
        this.controller.state.videos = [];
      });
    },
    triggerLocalDownload(video) {
      this.controller.state.downloadProgressMap[video.url] = 1;
      const fallbackFilename = video.serverFilename || "video_asset";
      chrome.runtime.sendMessage({
        action: "download_video",
        url: video.url,
        filename: fallbackFilename.split("/").pop()
      });
    },
    initializeSequence(video) {
      this.controller.initializeSequence(video);
    },
    setMediaType(type) {
      this.controller.state.mediaType = type;
      if (!this.controller.state.isLocalResult && this.controller.state.searchQuery) {
        this.controller.executeCloudGlobalSearch(this.controller.state.searchQuery);
      }
    },
    debouncedSearch() {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        const query = this.controller.state.searchQuery;
        if (query.length > 1) {
          this.controller.executeLocalLibraryDatabaseSearch(query);
        }
      }, 400);
    },
    copyStreamUrl(url, event) {
      const cleanUrl = UrlCleaner.extractCleanVideoUrl(url);
      navigator.clipboard.writeText(cleanUrl);
      
      const originalText = event.target.innerText;
      event.target.innerText = "✅ COPIED";
      setTimeout(() => {
        event.target.innerText = originalText;
      }, 1200);
    },
    refreshActivePage() {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
      });
    }
  }
};
</script>