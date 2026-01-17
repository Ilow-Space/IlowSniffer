// ======================================================================
// FILE PATH: templates.js
// ======================================================================

const THEME = {
  colors: {
    bg: "#000000", // Pure Black
    bgPanel: "#050505", // Almost Black (for cards/modals)
    border: "#262626", // Visible dark grey outline
    borderHover: "#404040", // Lighter grey for hover states
    textMain: "#ffffff", // Pure White
    textMuted: "#888888", // Neutral Grey
    accent: "#3b82f6", // A rich, vibrant blue
    accentHover: "#3B82F6", // A slightly lighter, more luminous blue for hover
    success: "#10b981", // Emerald-500
    error: "#ff4444", // Red-500 (Slightly brighter)
    errorMuted: "rgba(255, 68, 68, 0.3)", // For borders/backgrounds
    errorTextMuted: "#fca5a5", // For muted error text
  },
  radius: "8px",
  fontMono: "'JetBrains Mono', monospace",
  shadow: "0 0 0 1px rgba(255, 255, 255, 0.05), 0 4px 6px rgba(0, 0, 0, 0.4)",
};

// --- HELPER STYLES ---
const S = {
  // Utility for flex layouts
  flexBetween: "display:flex; align-items:center; justify-content:space-between;",
  flexCenter: "display:flex; align-items:center; justify-content:center;",
  flexCol: "display:flex; flex-direction:column;",

  // Base button styles (Outline Style)
  btnBase: `
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 16px;
    border-radius: ${THEME.radius};
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    background: transparent;
    border: 1px solid ${THEME.colors.border};
    color: ${THEME.colors.textMuted};
    transition: all 0.2s ease;
    outline: none;
    font-family: inherit;
    &:hover {
      color: ${THEME.colors.textMain};
      border-color: ${THEME.colors.borderHover};
      background: rgba(255, 255, 255, 0.03);
    }
    &:active {
      transform: translateY(1px);
    }
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background: ${THEME.colors.bgPanel};
      color: ${THEME.colors.textMuted};
      border-color: ${THEME.colors.border};
    }
  `,

  // Input styles (Flat & Dark)
  input: `
    width: 100%;
    background: ${THEME.colors.bg};
    border: 1px solid ${THEME.colors.border};
    border-radius: ${THEME.radius};
    padding: 10px 12px;
    color: ${THEME.colors.textMain};
    font-size: 12px;
    font-family: ${THEME.fontMono};
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.2s;
    &:focus {
      border-color: ${THEME.colors.accent};
    }
    &::placeholder {
      color: ${THEME.colors.border};
    }
  `,

  // Badge styles (Glass/Outline)
  badge: `
    padding: 4px 8px;
    border-radius: 99px;
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid ${THEME.colors.border};
    color: ${THEME.colors.textMuted};
    backdrop-filter: blur(4px);
  `,

  // Card/Panel container style
  panel: `
    background: ${THEME.colors.bgPanel};
    border: 1px solid ${THEME.colors.border};
    border-radius: ${THEME.radius};
    box-shadow: ${THEME.shadow};
  `,
};

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
    <div style="${S.flexBetween} margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid ${THEME.colors.border};">
      <div style="display:flex; align-items:center; gap:8px;">
        ${leftBtnHtml}
        <span style="font-size:11px; font-weight:700; letter-spacing:0.5px; color:${THEME.colors.textMain}; text-transform:uppercase;">${title}</span>
      </div>
      ${rightBtnHtml}
    </div>
  `,

  errorState: (title, message, showActionBtn = false, btnText = "Retry") => `
    <div style="border: 1px solid ${THEME.colors.errorMuted}; background: rgba(255, 68, 68, 0.05); padding:16px; border-radius:${THEME.radius}; margin-bottom:16px;">
      <h3 style="margin:0 0 8px 0; font-size:11px; font-weight:700; color:${THEME.colors.error}; text-transform:uppercase;">// ERROR: ${title}</h3>
      <p style="font-size:11px; color:${THEME.colors.textMuted}; margin-bottom:12px; line-height:1.5;">${message}</p>
      ${
        showActionBtn
          ? `<button id="btn-err-action" style="${S.btnBase} border-color:${THEME.colors.errorMuted}; color:${THEME.colors.errorTextMuted};">${btnText}</button>`
          : ""
      }
    </div>
  `,

  youtubeState: () => `
    <div class="animate-fade-in" style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding: 24px 16px;">
      <div style="${S.flexCenter} width:64px; height:64px; margin-bottom:16px; background:rgba(239, 68, 68, 0.1); border-radius:50%; box-shadow: 0 0 20px rgba(239, 68, 68, 0.15);">
        ${ICONS.YOUTUBE}
      </div>
      <h2 style="font-size:14px; font-weight:600; margin-bottom:8px; color:${THEME.colors.textMain};">YouTube Detected</h2>
      <p style="font-size:11px; color:${THEME.colors.textMuted}; text-align:center; line-height:1.5; margin-bottom:20px; max-width:250px;">
        Media sniffing is disabled on this domain due to Chrome Web Store policies.
      </p>
      <div style="width:100%; background:${THEME.colors.bgPanel}; border:1px solid ${THEME.colors.border}; border-radius:${THEME.radius}; padding:12px; margin-bottom:24px; text-align:center;">
         <div style="font-size:10px; font-weight:600; color:${THEME.colors.textMain}; margin-bottom:4px; ${S.flexCenter} gap:6px;">
            <span style="color:${THEME.colors.success};">✔</span> Native Support Available
         </div>
         <div style="font-size:10px; color:${THEME.colors.textMuted}; line-height:1.4;">
            Paste URL directly in the AtSync Player.
         </div>
      </div>
      <a href="https://atsync.ilow.io" target="_blank" class="btn" style="${S.btnBase} background:${THEME.colors.accent}; color:white; border-color:${THEME.colors.accent}; text-decoration:none;">
        Open AtSync
      </a>
    </div>
  `,

  videoCard: (video, index, formattedDuration, resolutionText, isAuth, cleanDisplayUrl, progress = 0, uniqueId) => {
    const thumbSrc =
      video.thumbnail ||
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMjAiIGhlaWdodD0iMTgwIiB2aWV3Qm94PSIwIDAgMzIwIDE4MCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzE4MTgxYiIvPjwvc3ZnPg==";
    const isDownloading = progress > 0 && progress < 100;

    return `
    <div id="${uniqueId}" class="video-card animate-fade-in" style="
        position: relative; 
        overflow: hidden; 
        background: ${THEME.colors.bg}; 
        border: 1px solid ${THEME.colors.border}; 
        border-radius: ${THEME.radius}; 
        margin-bottom: 12px;
        display: block !important;
    ">
      <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
      
      <canvas class="js-progress-canvas" style="position: absolute; top:0; left:0; width:100%; height:100%; z-index:0; pointer-events:none; opacity: ${progress > 0 ? 1 : 0}; transition: opacity 0.3s ease;"></canvas>

      <div style="position: relative; width: 100%; aspect-ratio: 16/9; background: #000; overflow: hidden; z-index: 1;">
        <img src="${thumbSrc}" style="width:100%; height:100%; object-fit:cover; opacity:0.8; display: block;">
        <div style="position:absolute; bottom:0; left:0; width:100%; height:60%; background:linear-gradient(to top, rgba(0,0,0,0.8), transparent); pointer-events:none;"></div>

        <button class="btn-download-video ${isDownloading ? "downloading" : ""}" 
          data-url="${video.url}" 
          data-filename="${cleanDisplayUrl.split("/").pop() || "video"}"
          title="Download Video"
          style="
            position: absolute; top: 8px; right: 8px; 
            background: ${isDownloading ? THEME.colors.bg : "rgba(0,0,0,0.6)"}; 
            color: ${isDownloading ? THEME.colors.accent : THEME.colors.textMain};
            border: 1px solid ${isDownloading ? THEME.colors.accent : "rgba(255,255,255,0.2)"};
            border-radius: 4px; width: 28px; height: 28px;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; backdrop-filter: blur(4px); z-index: 10;
          ">
          ${isDownloading ? Templates.spinnerSvg : ICONS.DOWNLOAD}
        </button>

        <div style="position: absolute; bottom: 8px; left: 8px; display: flex; gap: 6px;">
             <div style="${S.badge} background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.15); color: #f1f5f9;">
                ${ICONS.CLOCK} 
                <span>${formattedDuration}</span>
            </div>
             ${resolutionText ? `<div style="${S.badge} background: rgba(11, 99, 246, 0.2); border: 1px solid rgba(11, 99, 246, 0.4); color: ${THEME.colors.accentHover};">${resolutionText}</div>` : ""}
        </div>
      </div>
      
      <div style="padding: 10px; position: relative; z-index: 2; border-top: 1px solid rgba(255,255,255,0.05); background: ${THEME.colors.bg};">
        <div class="copy-trigger" data-url="${video.url}" title="Click to copy stream URL" style="
          margin-bottom: 8px; color: ${THEME.colors.textMuted}; font-size: 10px; font-family: ${THEME.fontMono};
          background: ${THEME.colors.bgPanel}; padding: 6px 8px; border-radius: 4px; 
          border: 1px solid ${THEME.colors.border}; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis; cursor: pointer;
        ">
          ${cleanDisplayUrl} 
        </div>

        <button class="select-video-btn" style="
            ${S.btnBase} 
            width: 100%; 
            background: ${isAuth ? THEME.colors.accent : THEME.colors.bgPanel}; 
            color: ${isAuth ? THEME.colors.textMain : THEME.colors.textMuted}; 
            border-color: ${isAuth ? THEME.colors.accent : THEME.colors.border};
        " ${!isAuth ? "disabled" : ""} data-index="${index}">
            ${isAuth ? "INITIALIZE SEQUENCE" : "LOGIN REQUIRED"}
        </button>
      </div>
    </div>
  `;
  },

  emptyList: () => `
    <div id="empty-state-msg" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px; min-height: 200px;">
      <div style="font-size:32px; color:${THEME.colors.border}; margin-bottom:12px;">◎</div>
      <div style="font-family:${THEME.fontMono}; font-size:10px; margin-bottom:8px; color:${THEME.colors.textMain}; letter-spacing:1px;">NO_SOURCES_FOUND</div>
      <div style="font-size:11px; color:${THEME.colors.textMuted}; margin-bottom:16px; line-height:1.5; max-width:200px;">
        No media detected.<br>Refresh to capture active streams.
      </div>
      <button id="btn-refresh-page" style="${S.btnBase} background:${THEME.colors.bgPanel}; color:${THEME.colors.textMain}; border:1px solid ${THEME.colors.border};">
        REFRESH PAGE
      </button>
    </div>
  `,

  searchContainer: (state, headerHtml, sourceLabelHtml, resultsHtml) => {
    const isTv = state.mediaType === "tv";
    return `
      ${headerHtml}
      <div class="animate-fade-in">
        <div style="display:flex; margin-bottom:12px;">
          <input type="text" id="inp-search" style="${S.input} border-top-right-radius:0; border-bottom-right-radius:0; border-right:none;" value="${state.searchQuery}" placeholder="Search database..." autocomplete="off">
          <button id="btn-go-search" title="Execute Search" style="width:36px; background:${THEME.colors.bgPanel}; border:1px solid ${THEME.colors.border}; border-left:1px solid ${THEME.colors.bg}; border-top-right-radius:${THEME.radius}; border-bottom-right-radius:${THEME.radius}; color:${THEME.colors.textMuted}; cursor:pointer; display:flex; align-items:center; justify-content:center;">${ICONS.SEARCH}</button>
        </div>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:4px; background:${THEME.colors.bgPanel}; border:1px solid ${THEME.colors.border}; border-radius:${THEME.radius}; margin-bottom:12px;">
          <button class="toggle-opt" id="set-movie" style="padding:6px; font-size:10px; font-weight:700; border-radius:4px; cursor:pointer; border:none; ${!isTv ? `background:${THEME.colors.border}; color:white;` : `background:transparent; color:${THEME.colors.textMuted};`}">MOVIE</button>
          <button class="toggle-opt" id="set-tv" style="padding:6px; font-size:10px; font-weight:700; border-radius:4px; cursor:pointer; border:none; ${isTv ? `background:${THEME.colors.border}; color:white;` : `background:transparent; color:${THEME.colors.textMuted};`}">TV SERIES</button>
        </div>
        
        ${sourceLabelHtml}
        
        <div style="height:210px; overflow-y:auto; padding-right:2px; margin-bottom:12px;">
          ${resultsHtml || `<div style="height:100%; display:flex; align-items:center; justify-content:center; color:${THEME.colors.textMuted}; font-size:10px; font-family:${THEME.fontMono};">// NO_DATA_FOUND</div>`}
        </div>
        
        ${isTv ? `<div style="display:flex; gap:10px; margin-bottom:12px;"><div style="flex:1;"><label style="font-size:10px; font-weight:700; color:${THEME.colors.textMuted}; display:block; margin-bottom:4px;">SEASON</label><input type="number" id="inp-season" style="${S.input} text-align:center;" value="${state.season}" min="1"></div><div style="flex:1;"><label style="font-size:10px; font-weight:700; color:${THEME.colors.textMuted}; display:block; margin-bottom:4px;">EPISODE</label><input type="number" id="inp-episode" style="${S.input} text-align:center;" value="${state.episode}" min="1"></div></div>` : ""}
        
        <button id="btn-ingest" class="btn" style="${S.btnBase} width:100%; background:${THEME.colors.accent}; color:white; border-color:${THEME.colors.accent};" ${!state.selectedMeta ? "disabled" : ""}>EXECUTE INGEST</button>
      </div>
    `;
  },

  searchResultItem: (r, idx, isSelected, imgBaseUrl) => {
    const posterSrc = r.poster_path ? `${imgBaseUrl}${r.poster_path}` : "";
    const year = (r.release_date || r.first_air_date || "").substring(0, 4);

    const containerStyle = isSelected
      ? `background:rgba(11, 99, 246, 0.1); border:1px solid ${THEME.colors.accent};`
      : `background:transparent; border:1px solid transparent;`;

    return `
    <div class="search-result" data-idx="${idx}" style="display:flex; gap:10px; padding:8px; margin-bottom:4px; border-radius:${THEME.radius}; cursor:pointer; transition:all 0.2s; ${containerStyle}">
      <div style="width:36px; height:54px; flex-shrink:0; background:${THEME.colors.bgPanel}; border-radius:4px; overflow:hidden;">
        <img src="${posterSrc}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.opacity=0.3">
      </div>
      <div style="flex:1; min-width:0; display:flex; flex-direction:column; justify-content:center;">
        <div style="font-size:11px; font-weight:600; color:${THEME.colors.textMain}; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.title || r.name}</div>
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
            <span style="font-size:10px; color:${THEME.colors.textMuted}; font-family:${THEME.fontMono};">${year}</span>
            ${r.is_local ? `<span style="${S.badge} background:rgba(99,102,241,0.2); color:#a5b4fc; border:1px solid rgba(99,102,241,0.3);">LIBRARY</span>` : `<span style="${S.badge} background:rgba(14,165,233,0.2); color:#7dd3fc; border:1px solid rgba(14,165,233,0.3);">TMDB</span>`}
        </div>
      </div>
    </div>`;
  },

  taskItem: (task) => {
    let statusColor = THEME.colors.accent;
    let bgBar = THEME.colors.accent;

    if (task.status === "completed") {
      statusColor = THEME.colors.success;
      bgBar = THEME.colors.success;
    } else if (task.status === "failed" || task.error) {
      statusColor = THEME.colors.error;
      bgBar = THEME.colors.error;
    }

    const progress =
      task.status === "completed"
        ? 100
        : task.totalSize > 0
          ? Math.round((task.bytesDownloaded / task.totalSize) * 100)
          : 0;

    let metaInfoHtml = "";
    if (task.mediaType) {
      metaInfoHtml += `<span style="padding:1px 4px; background:${THEME.colors.border}; color:${THEME.colors.textMain}; font-size:9px; border-radius:3px; margin-right:4px;">${task.mediaType === "tv" ? "TV" : "MOV"}</span>`;
    }
    if (task.mediaType === "tv" && task.season && task.episode) {
      const s = task.season < 10 ? `0${task.season}` : task.season;
      const e = task.episode < 10 ? `0${task.episode}` : task.episode;
      metaInfoHtml += `<span style="padding:1px 4px; background:${THEME.colors.border}; color:${THEME.colors.textMain}; font-size:9px; border-radius:3px; margin-right:4px;">S${s}E${e}</span>`;
    }

    return `
    <div class="task-card animate-fade-in" data-id="${task.downloadId || ""}" style="background:${THEME.colors.bg}; border:1px solid ${THEME.colors.border}; border-radius:${THEME.radius}; padding:12px; margin-bottom:8px; display:block !important;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
        <div style="flex:1; padding-right:8px; min-width:0;">
            <div style="display:flex; align-items:center; margin-bottom:4px;">
                ${metaInfoHtml}
                <span style="font-size:10px; color:${THEME.colors.textMuted}; font-family:${THEME.fontMono};">ID: ${task.tmdbId || "N/A"}</span>
            </div>
            <div style="font-size:11px; font-weight:600; color:${THEME.colors.textMain}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${task.originalName}">
                ${task.originalName}
            </div>
        </div>
        <span style="font-size:9px; font-weight:700; padding:2px 6px; border:1px solid ${statusColor}; color:${statusColor}; border-radius:4px;">
            ${task.status ? task.status.toUpperCase() : "UNKNOWN"}
        </span>
      </div>
      
      <div style="height:4px; width:100%; background:${THEME.colors.bgPanel}; border-radius:2px; overflow:hidden;">
        <div style="height:100%; width:${progress}%; background:${bgBar}; transition:width 0.3s ease;"></div>
      </div>
      
      ${task.error ? `<div style="margin-top:8px; font-size:10px; color:${THEME.colors.error}; font-family:${THEME.fontMono}; background:rgba(239,68,68,0.1); padding:4px; border-radius:4px;">// ${task.error}</div>` : ""}
    </div>`;
  },

  successScreen: () => `
    <div class="animate-fade-in" style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:20px;">
      <div style="width:60px; height:60px; border-radius:50%; background:rgba(16, 185, 129, 0.1); color:${THEME.colors.success}; display:flex; align-items:center; justify-content:center; margin-bottom:20px; box-shadow:0 0 15px rgba(16, 185, 129, 0.2);">${ICONS.SUCCESS}</div>
      <h2 style="font-size:16px; margin-bottom:8px; color:white;">Sequence Initiated</h2>
      <p style="font-size:11px; color:${THEME.colors.textMuted}; text-align:center; margin-bottom:30px;">The ingest protocol has been successfully transmitted to the server.</p>
      <button class="btn" id="btn-view-tasks" style="${S.btnBase} width:100%; margin-bottom:12px; background:${THEME.colors.accent}; color:white; border-color:${THEME.colors.accent};">MONITOR PROGRESS</button>
      <button class="btn secondary" id="btn-back" style="${S.btnBase} width:100%; background:${THEME.colors.bgPanel}; color:${THEME.colors.textMain}; border-color:${THEME.colors.border};">RETURN TO SCANNER</button>
    </div>
  `,
};
