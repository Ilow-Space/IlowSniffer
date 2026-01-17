// ======================================================================
// FILE PATH: C:\Users\User\OneDrive\Projects\ilow\IlowAgent\templates.js
// ======================================================================

export const ICONS = {
  TRASH: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  BACK: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`,
  SEARCH: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
  SUCCESS: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  YOUTUBE: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="#ef4444"></polygon></svg>`,
  FILM: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>`,
  CLOCK: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
  DOWNLOAD: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
};

export const Templates = {
  spinnerSvg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`,

  subNav: (title, leftBtnHtml = "", rightBtnHtml = "") => `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--border-dim);">
      <div style="display:flex; align-items:center; gap:8px;">
        ${leftBtnHtml}
        <span style="font-size:12px; font-weight:700; letter-spacing:0.5px; color:white; text-transform:uppercase;">${title}</span>
      </div>
      ${rightBtnHtml}
    </div>
  `,

  errorState: (title, message, showActionBtn = false, btnText = "Retry") => `
    <div class="empty-state" style="border-color: var(--status-error); background: rgba(239,68,68,0.05);">
      <h3 style="margin:0 0 8px 0; font-size:13px; color: var(--status-error);">// ERROR: ${title}</h3>
      <p style="font-size:12px; margin-bottom:12px;">${message}</p>
      ${
        showActionBtn
          ? `<button id="btn-err-action" class="btn secondary" style="width:auto; padding:6px 16px;">${btnText}</button>`
          : ""
      }
    </div>
  `,

  youtubeState: () => `
    <div class="animate-fade-in" style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding: 0 16px;">
      <div style="width:64px; height:64px; margin-bottom:16px; display:flex; align-items:center; justify-content:center; background:rgba(239, 68, 68, 0.1); border-radius:50%; box-shadow: 0 0 20px rgba(239, 68, 68, 0.15);">
        ${ICONS.YOUTUBE}
      </div>
      <h2 style="font-size:15px; margin-bottom:8px; color:white;">YouTube Detected</h2>
      <p style="font-size:12px; color:var(--text-muted); text-align:center; line-height:1.5; margin-bottom:20px;">
        Media sniffing is disabled on this domain due to Chrome Web Store policies.
      </p>
      <div style="width:100%; background:var(--bg-panel); border:1px solid var(--border-dim); border-radius:var(--radius-md); padding:12px 16px; margin-bottom:24px; text-align:center;">
         <div style="font-size:11px; font-weight:600; color:var(--text-main); margin-bottom:4px; display:flex; align-items:center; justify-content:center; gap:6px;">
            <span style="color:var(--status-success);">✔</span> Native Support Available
         </div>
         <div style="font-size:11px; color:var(--text-dim); line-height:1.4;">
            <strong>AtSync Player</strong> natively supports YouTube links. You can paste this URL directly into your room.
         </div>
      </div>
      <a href="https://atsync.ilow.io" target="_blank" class="btn" style="text-align:center; text-decoration:none;">
        Open AtSync
      </a>
    </div>
  `,

  // Note: Added uniqueId parameter for tracking
  videoCard: (video, index, formattedDuration, resolutionText, isAuth, cleanDisplayUrl, progress = 0, uniqueId) => {
    // Fallback if no thumbnail
    const thumbSrc =
      video.thumbnail ||
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMjAiIGhlaWdodD0iMTgwIiB2aWV3Qm94PSIwIDAgMzIwIDE4MCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzE4MTgxYiIvPjwvc3ZnPg==";

    const showProgress = progress > 0 && progress < 100;
    const isDownloading = showProgress;

    // Use spinner if downloading, else download icon
    const spinnerSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`;

    return `
    <div id="${uniqueId}" class="video-card animate-fade-in" style="position: relative; overflow: hidden; background: #0f172a;">
      <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
      
      <!-- PROGRESS OVERLAY (Z-Index 3) -->
      <!-- Added class 'js-progress-bar' for JS targeting -->
      <div class="js-progress-bar" style="
        position: absolute; 
        top: 0; 
        left: 0; 
        bottom: 0; 
        width: ${progress}%; 
        opacity: ${showProgress ? 1 : 0};
        background-color: rgba(6, 182, 212, 0.35);
        background-image: 
            linear-gradient(45deg, #06b6d4 25%, transparent 25%, transparent 75%, #06b6d4 75%, #06b6d4), 
            linear-gradient(45deg, #06b6d4 25%, transparent 25%, transparent 75%, #06b6d4 75%, #06b6d4);
        background-position: 0 0, 4px 4px;
        background-size: 8px 8px;
        border-right: 2px solid #06b6d4;
        box-shadow: 0 0 10px rgba(6, 182, 212, 0.4);
        z-index: 3; 
        pointer-events: none;
        transition: width 0.3s ease-out, opacity 0.2s ease;
        overflow: hidden;
      ">
         <!-- Scanline Decoration -->
         <div style="position:absolute; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.1); box-shadow: inset 0 0 20px rgba(0,0,0,0.5);"></div>
         
         <!-- Tech Label (Targetable via js-progress-text) -->
         <div class="js-progress-text" style="
            position: absolute; 
            bottom: 6px; 
            right: 8px; 
            font-family: 'JetBrains Mono', monospace; 
            font-size: 9px; 
            font-weight: 700;
            color: #fff; 
            background: #000;
            padding: 2px 4px;
            text-transform: uppercase;
         ">
            DL :: ${progress}%
         </div>
      </div>

      <!-- DOWNLOAD BUTTON (Z-Index 10) -->
      <button class="icon-btn btn-download-video ${isDownloading ? "downloading" : ""}" 
        data-url="${video.url}" 
        data-filename="${cleanDisplayUrl.split("/").pop() || "video"}"
        title="Download Video"
        style="
          position: absolute; 
          top: 6px; 
          right: 6px; 
          z-index: 10; 
          background: ${isDownloading ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0.7)"}; 
          color: ${isDownloading ? "#67e8f9" : "white"};
          border: 1px solid ${isDownloading ? "#06b6d4" : "rgba(255,255,255,0.2)"};
          border-radius: 4px;
          width: 26px; 
          height: 26px;
          display: flex; 
          align-items: center; 
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;">
        ${isDownloading ? spinnerSvg : ICONS.DOWNLOAD}
      </button>

      <!-- CONTENT (Thumbnail & Text) (Z-Index 2) -->
      <div class="vid-layout" style="position:relative; z-index:2;">
        <img src="${thumbSrc}" class="vid-thumb">
        
        <div class="vid-info">
          <div class="vid-meta">
            ${ICONS.CLOCK} <span>${formattedDuration}</span>
            <span style="width:1px; height:10px; background:var(--border-dim);"></span>
            ${
              resolutionText
                ? `<span class="badge badge-res">${resolutionText}</span>`
                : `<span class="badge badge-res">UNK</span>`
            }
          </div>
          
          <div class="vid-url copy-trigger" data-url="${video.url}" title="Click to copy stream URL">
            ${cleanDisplayUrl} 
          </div>
        </div>
      </div>
      
      <!-- MAIN ACTION BUTTON (Z-Index 10) -->
      <button class="btn select-video-btn" style="margin-top:10px; padding:8px; position:relative; z-index:10;" data-index="${index}">
        ${isAuth ? "INITIALIZE SEQUENCE" : "LOGIN REQUIRED"}
      </button>
    </div>
  `;
  },

  emptyList: () => `
    <div id="empty-state-msg" class="empty-state" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px; min-height: 200px;">
      <div style="font-size:24px; opacity:0.3; margin-bottom:12px;">◎</div>
      <div style="font-family:var(--font-mono); font-size:11px; margin-bottom:8px; color:var(--text-main);">NO_SOURCES_FOUND</div>
      <div style="font-size:11px; color:var(--text-dim); margin-bottom:16px; line-height:1.5;">
        No media detected.<br>Refresh the page to capture active streams.
      </div>
      <button id="btn-refresh-page" class="btn secondary" style="width:auto; padding:8px 16px; cursor:pointer;">
        REFRESH PAGE
      </button>
    </div>
  `,

  searchContainer: (state, headerHtml, sourceLabelHtml, resultsHtml) => {
    const isTv = state.mediaType === "tv";
    return `
      ${headerHtml}
      <div class="animate-fade-in">
        <div class="tech-input-group">
          <input type="text" id="inp-search" class="tech-input" value="${state.searchQuery}" placeholder="Search database..." autocomplete="off">
          <button id="btn-go-search" class="icon-btn" style="border-radius:0; border-left:1px solid var(--border-dim); width:32px;">${ICONS.SEARCH}</button>
        </div>
        <div class="toggle-box">
          <button class="toggle-opt ${!isTv ? "active" : ""}" id="set-movie">MOVIE</button>
          <button class="toggle-opt ${isTv ? "active" : ""}" id="set-tv">TV SERIES</button>
        </div>
        ${sourceLabelHtml}
        <div style="height:210px; overflow-y:auto; padding-right:2px; margin-bottom:12px; border-top:1px solid transparent;">
          ${resultsHtml || '<div class="empty-state" style="padding:20px;">// NO_DATA_FOUND</div>'}
        </div>
        ${isTv ? `<div style="display:flex; gap:10px; margin-bottom:12px;"><div style="flex:1;"><label class="text-xs" style="color:var(--text-dim); display:block; margin-bottom:4px;">SEASON</label><div class="tech-input-group" style="margin-bottom:0;"><input type="number" id="inp-season" class="tech-input" value="${state.season}" min="1" style="text-align:center;"></div></div><div style="flex:1;"><label class="text-xs" style="color:var(--text-dim); display:block; margin-bottom:4px;">EPISODE</label><div class="tech-input-group" style="margin-bottom:0;"><input type="number" id="inp-episode" class="tech-input" value="${state.episode}" min="1" style="text-align:center;"></div></div></div>` : ""}
        <button id="btn-ingest" class="btn" ${!state.selectedMeta ? "disabled" : ""}>EXECUTE INGEST</button>
      </div>
    `;
  },

  searchResultItem: (r, idx, isSelected, imgBaseUrl) => {
    const posterSrc = r.poster_path ? `${imgBaseUrl}${r.poster_path}` : "";
    const year = (r.release_date || r.first_air_date || "").substring(0, 4);
    return `
    <div class="search-card search-result ${isSelected ? "selected" : ""}" data-idx="${idx}" style="cursor:pointer;">
      <div class="search-res-layout">
        <img src="${posterSrc}" class="res-poster" onerror="this.style.opacity=0.3">
        <div class="res-info">
          <div class="res-title">${r.title || r.name}</div>
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
            <span class="text-xs font-mono" style="color:var(--text-muted);">${year}</span>
            ${r.is_local ? `<span class="badge badge-local">LIBRARY</span>` : `<span class="badge badge-tmdb">TMDB</span>`}
          </div>
          <div class="res-desc">${r.overview || "No description available."}</div>
        </div>
      </div>
    </div>`;
  },

  taskItem: (task) => {
    // Logic for Status Colors including "failed"
    let statusColor = "var(--accent-primary)";
    if (task.status === "completed") statusColor = "var(--status-success)";
    else if (task.status === "failed") statusColor = "var(--status-error)";
    else if (task.error) statusColor = "var(--status-error)";

    // Calculate Progress safe against div/0
    const progress =
      task.status === "completed"
        ? 100
        : task.totalSize > 0
          ? Math.round((task.bytesDownloaded / task.totalSize) * 100)
          : 0;

    // Generate Meta Badge HTML (e.g. "TV | S01E02" or "MOVIE")
    let metaInfoHtml = "";
    if (task.mediaType) {
      const typeLabel = task.mediaType === "tv" ? "TV" : "MOV";
      metaInfoHtml += `<span class="badge badge-tmdb" style="margin-right:4px;">${typeLabel}</span>`;
    }
    if (task.mediaType === "tv" && task.season && task.episode) {
      // Pad numbers (e.g., S01E05)
      const s = task.season < 10 ? `0${task.season}` : task.season;
      const e = task.episode < 10 ? `0${task.episode}` : task.episode;
      metaInfoHtml += `<span class="badge badge-local">S${s}E${e}</span>`;
    }

    return `
    <div class="task-card animate-fade-in" data-id="${task.downloadId || ""}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
        <div style="flex:1; padding-right:8px;">
            <div style="display:flex; align-items:center; margin-bottom:4px;">
                ${metaInfoHtml}
                <span style="font-size:10px; color:var(--text-dim); font-family:var(--font-mono);">ID: ${task.tmdbId || "N/A"}</span>
            </div>
            <div style="font-size:11px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${task.originalName}">
                ${task.originalName}
            </div>
        </div>
        <span class="badge" style="background:transparent; border:1px solid ${statusColor}; color:${statusColor}; font-size:9px;">
            ${task.status ? task.status.toUpperCase() : "UNKNOWN"}
        </span>
      </div>
      
      <div class="progress-container">
        <div class="progress-bar" style="width: ${progress}%; background:${statusColor};"></div>
      </div>
      
      ${
        task.error
          ? `
        <div style="font-size:10px; color:var(--status-error); margin-top:4px; font-family:var(--font-mono); word-break:break-all; line-height:1.2;">
            // ${task.error}
        </div>`
          : ""
      }
    </div>`;
  },

  successScreen: () => `
    <div class="animate-fade-in" style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center;">
      <div style="width:60px; height:60px; border-radius:50%; background:rgba(16, 185, 129, 0.1); color:var(--status-success); display:flex; align-items:center; justify-content:center; margin-bottom:20px; box-shadow:0 0 15px rgba(16, 185, 129, 0.2);">${ICONS.SUCCESS}</div>
      <h2 style="font-size:16px; margin-bottom:8px; color:white;">Sequence Initiated</h2>
      <p style="font-size:12px; color:var(--text-muted); text-align:center; margin-bottom:30px;">The ingest protocol has been successfully transmitted to the server.</p>
      <button class="btn" id="btn-view-tasks" style="margin-bottom:12px;">MONITOR PROGRESS</button>
      <button class="btn secondary" id="btn-back">RETURN TO SCANNER</button>
    </div>
  `,
};
