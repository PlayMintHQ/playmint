// Auth-callback boot handling.
//
// The app OWNS the URL hash (`#config=` share links; App.jsx reads it in
// getInitialState and rewrites it while a game runs). Supabase's implicit flow
// returns its tokens in the hash too (`#access_token=…`), and our client is
// lazy. So an auth callback is consumed HERE, before React renders: main.jsx
// awaits consumeAuthCallback() only on boots whose hash carries auth params.
// By the time App mounts the hash is clean (or restored to the game the user
// left), which removes every race with App's hash reader and writer.

import { getSupabase, isAuthConfigured } from './supabaseClient';

const RETURN_KEY = 'PM_AUTH_RETURN';
const RETURN_TTL_MS = 15 * 60 * 1000;
const AUTH_PARAM_KEYS = ['access_token', 'error', 'error_code', 'error_description'];

// What the callback was, read BEFORE the client initializes. PASSWORD_RECOVERY
// and the signup confirmation fire during client init — before AuthProvider has
// subscribed — so late subscribers would never learn about them.
let bootIntent = null;

const readHashParams = () => {
  try {
    const raw = window.location.hash || '';
    if (!raw || raw.length < 2) return null;
    return new URLSearchParams(raw.slice(1));
  } catch {
    return null;
  }
};

// Parsed, not substring-matched: `#config=<base64>` parses to the single key
// `config` and can never be mistaken for an auth callback.
export const hasAuthCallbackParams = () => {
  const params = readHashParams();
  if (!params) return false;
  return AUTH_PARAM_KEYS.some((k) => params.has(k));
};

export const getBootAuthIntent = () => bootIntent;
export const clearBootAuthIntent = () => { bootIntent = null; };

// Remember where the user was right before a full-page OAuth redirect, so they
// come back to the game they were playing. sessionStorage is per-tab, which is
// exactly right: OAuth returns in the same tab; an emailed link opens a new tab
// and correctly lands on the home screen.
export const rememberReturnPath = () => {
  try {
    const path = window.location.pathname + window.location.search + window.location.hash;
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ path, at: Date.now() }));
  } catch { /* storage may be unavailable — returning home is fine */ }
};

const takeReturnPath = () => {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RETURN_KEY);
    const saved = JSON.parse(raw);
    if (!saved || typeof saved.path !== 'string' || !saved.path.startsWith('/')) return null;
    if (Date.now() - (saved.at || 0) > RETURN_TTL_MS) return null;
    return saved.path;
  } catch {
    return null;
  }
};

export const consumeAuthCallback = async () => {
  const params = readHashParams();
  if (params) {
    bootIntent = {
      type: params.get('type') || null, // 'signup' | 'recovery' | 'magiclink' | …
      errorCode: params.get('error_code') || params.get('error') || null,
      errorDescription: params.get('error_description') || null,
    };
  }

  try {
    if (isAuthConfigured()) {
      const supabase = await getSupabase();
      // getSession() awaits the client's initialization, which includes URL
      // detection: the session is stored and the hash cleared when it resolves.
      if (supabase) await supabase.auth.getSession();
    }
  } finally {
    // Always leave a clean URL. This also covers a deploy WITHOUT auth env vars
    // that receives a callback (a redirect that missed the allow-list falls
    // back to the Site URL): tokens must not sit in the address bar, and
    // auth-js's own `location.hash = ''` leaves a bare '#'.
    const back = takeReturnPath();
    try {
      window.history.replaceState(
        null,
        '',
        back || window.location.pathname + window.location.search
      );
    } catch { /* non-fatal */ }
  }
};
