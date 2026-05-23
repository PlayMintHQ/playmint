/* Minimal SVG icons — colorless, stroke-based, currentColor aware */

const s = { verticalAlign: 'middle' };

export const IconShare = () => (
  <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={s}>
    <circle cx="15" cy="4" r="2.5" />
    <circle cx="5" cy="10" r="2.5" />
    <circle cx="15" cy="16" r="2.5" />
    <line x1="7.5" y1="11.5" x2="12.5" y2="14.5" />
    <line x1="12.5" y1="5.5" x2="7.5" y2="8.5" />
  </svg>
);

export const IconExport = () => (
  <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={s}>
    <path d="M17 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="14 7 10 3 6 7" />
    <line x1="10" y1="3" x2="10" y2="12" />
  </svg>
);

export const IconImport = () => (
  <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={s}>
    <path d="M17 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="6 9 10 13 14 9" />
    <line x1="10" y1="13" x2="10" y2="3" />
  </svg>
);

export const IconReset = () => (
  <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={s}>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a8 8 0 1 0 1.24-10.12L1 4" />
  </svg>
);

export const IconHome = () => (
  <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={s}>
    <path d="M3 9l7-7 7 7" />
    <path d="M5 8v8a1 1 0 0 0 1 1h3v-4h2v4h3a1 1 0 0 0 1-1V8" />
  </svg>
);

export const IconFullscreen = () => (
  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={s}>
    <path d="M3 8V3h5" />
    <path d="M17 12v5h-5" />
  </svg>
);

export const IconFullscreenExit = () => (
  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={s}>
    <path d="M8 3v5H3" />
    <path d="M12 17v-5h5" />
  </svg>
);

export const IconMenu = () => (
  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={s}>
    <line x1="2" y1="5" x2="18" y2="5" />
    <line x1="2" y1="10" x2="18" y2="10" />
    <line x1="2" y1="15" x2="18" y2="15" />
  </svg>
);
