// Minimal path router (added 2026-09-19 with accounts). No library: the app has
// three paths and owns its own URL hash (`#config=` share payloads), so a
// 40-line store is simpler and safer than adopting a router.
//
//   /            → home (ScreenZero, or the running game)
//   /my-games    → the signed-in user's library (protected view)
//   /g/:id       → RESERVED for October's public game page
//
// Deep links work on Vercel through the SPA rewrite in vercel.json (which
// excludes /api/). Phaser asset loads are absolute (`load.setPath('/')` in
// GameManagerScene.preload) so nested paths can't break them.
import { useSyncExternalStore } from 'react';

const ROUTE_EVENT = 'pm-route-change';

export const parseRoute = (pathname) => {
  const path = (pathname || '/').replace(/\/+$/, '') || '/';
  if (path === '/') return { name: 'home', params: {} };
  if (path === '/my-games') return { name: 'my-games', params: {} };
  const game = path.match(/^\/g\/([A-Za-z0-9-]{6,64})$/);
  if (game) return { name: 'game', params: { id: game[1] } };
  return { name: 'not-found', params: {} };
};

// Navigation always lands on a URL WITHOUT a hash: routes are only ever shown
// while no game is running, and a stale `#config=` must not ride along.
export const navigate = (path, { replace = false } = {}) => {
  try {
    const url = path + window.location.search;
    if (replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
  } catch { /* history quirks must never break the app */ }
  window.dispatchEvent(new Event(ROUTE_EVENT));
};

const subscribe = (onChange) => {
  window.addEventListener('popstate', onChange);
  window.addEventListener(ROUTE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(ROUTE_EVENT, onChange);
  };
};

const getPathname = () => window.location.pathname;

// Snapshot is the pathname STRING (stable identity); parsing happens per render.
export const useRoute = () => parseRoute(useSyncExternalStore(subscribe, getPathname));
