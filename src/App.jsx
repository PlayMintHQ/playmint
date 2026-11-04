import React, { useState, useRef, useEffect } from 'react';
import GameComponent from './GameComponent';
import GameSelectorModal from './components/GameSelectorModal';
import HudHeader from './components/HudHeader';
import CreatorPanel from './components/CreatorPanel';
import ScreenZero from './components/ScreenZero';
import { GAME_PRESETS } from './gameConfig';
import { generateGameConfig } from './game/geminiService';
import { regenerateAssetSlots, createCancelToken, isGeminiConfigured } from './game/assetPipeline';
import { generateOrRestoreAssets, updateGameArt, makePromptKey, getGameById } from './game/assetCache';
import { encodeShareConfig, decodeShareConfig, hydrateAssetMetaLite, stripForShare } from './game/shareLink';
import { generateTitle } from './game/promptUtils';
import { interpretEditPrompt, resolveAssetTargets } from './game/gameEditor';
import GameOverOverlay from './components/GameOverOverlay';
import RegenOverlay from './components/RegenOverlay';
import QuickEditOverlay from './components/QuickEditOverlay';
import MobileControls from './components/MobileControls';
import * as metrics from './game/metrics';
import AuthDialog from './auth/AuthDialog';
import { useAuth } from './auth/authContext';
import { useRoute, navigate } from './router';
import { MyGamesPage, RouteStubPage } from './components/MyGamesPage';
import { PublicGamePage } from './components/PublicGamePage';
import { saveGame, attachThumbnail } from './game/savedGames';
import { captureGameFrameWhenReady } from './game/frameCapture';
import { mergeRedrawnArt, mergeDesign } from './game/editMerge';

// Capture mode (2026-08-20): a chrome-free view for recording demos and
// marketing footage. Driven by the URL so a recording setup is reproducible and
// survives the gameKey remounts that restyles and share-link restores trigger.
//   ?capture=1      — hide all chrome, keep the touch controls faintly visible
//   ?capture=clean  — also hide the touch controls (desktop/keyboard capture)
const readCaptureMode = () => {
  try {
    const value = new URLSearchParams(window.location.search).get('capture');
    if (!value || value === '0' || value === 'false') return null;
    return value === 'clean' ? 'clean' : 'on';
  } catch {
    return null;
  }
};

// ── Fullscreen API notes ─────────────────────────────────────────────────────
// The API is still vendor-prefixed on Safari, and the previous code
// only ever called the unprefixed form — which is why fullscreen silently did
// nothing there.

/**
 * A short unique token identifying ONE boot's config. crypto.randomUUID is not
 * universal (and this module is evaluated in every browser the app supports, some
 * without it on http:// origins), so fall back to a timestamp+random pair.
 */
const newRunId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* fall through */ }
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
};

/** Stamp a fresh per-boot identity on a config that is becoming the live game. */
const withRunId = (config) => ({ ...(config || {}), saveRunId: newRunId() });
// A game the user GENERATED in this session (prompt, Quick Start, remix, an
// in-game regenerate). Auto-save is limited to these: the default preset that
// sits behind the home screen, a preset switch, an imported link and a public
// play are never "created" by the viewer (client report 2026-11-04: a stray
// "PlayMint Core" row appeared in a library whose owner had generated nothing).
const withNewGame = (config) => ({ ...withRunId(config), createdInSession: true });
// gameType → the preset key generateGameConfig takes as its mode hint.
const MODE_FOR_TYPE = { runner: 'standard', platformer: 'action_quest', shooter: 'shooter_arena' };

/**
 * Fold a boot-time player-animation repair's spend into the game's existing
 * cost block, so the cost report reflects what the game ACTUALLY cost instead
 * of the generation run alone. Per-call entries are concatenated (both runs
 * logged their own calls) and every total is re-summed from the merged list —
 * counting off `kind` rather than adding the two tallies, so the two runs can
 * never disagree with the call log the report prints.
 */
const mergeRepairCost = (existing, repair) => {
  if (!repair) return existing || { estUsd: 0, imageCalls: 0, visionCalls: 0, calls: [] };
  const calls = [...(existing?.calls || []), ...(repair.calls || [])];
  const sum = (key) => calls.reduce((n, c) => n + (Number(c?.[key]) || 0), 0);
  const byKind = (kind) => calls.filter((c) => c?.kind === kind).length;
  return {
    ...(existing || {}),
    ...repair,
    calls,
    imageCalls: byKind('image'),
    visionCalls: byKind('vision'),
    imageFailures: calls.filter((c) => c?.kind === 'image' && c?.failed).length,
    visionFailures: calls.filter((c) => c?.kind === 'vision' && c?.failed).length,
    promptTokens: sum('promptTokens'),
    outputTokens: sum('outputTokens'),
    thoughtsTokens: sum('thoughtsTokens'),
    estUsd: Math.round(((existing?.estUsd || 0) + (repair.estUsd || 0)) * 1e6) / 1e6
  };
};

const requestFullscreenOn = (el) => {
  if (!el) return Promise.resolve();
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.msRequestFullscreen;
  try {
    return Promise.resolve(fn ? fn.call(el) : undefined);
  } catch {
    return Promise.resolve();
  }
};

const exitFullscreenNow = () => {
  const fn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  try {
    if (fullscreenElement()) return Promise.resolve(fn ? fn.call(document) : undefined);
  } catch {
    /* ignore — leaving fullscreen must never throw into the app */
  }
  return Promise.resolve();
};

const fullscreenElement = () =>
  document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;

const getInitialState = () => {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#config=')) {
      try {
        const importedConfig = hydrateAssetMetaLite(decodeShareConfig(hash.replace('#config=', '')));
        if (typeof importedConfig === 'object' && importedConfig !== null && Object.keys(importedConfig).length > 0) {
          if (!importedConfig.gameName) importedConfig.gameName = 'PlayMint Core';
          // Auto-save exemption marker (see the auto-save effect). A boolean on
          // the config, NOT a derived string: a link to a static-art game
          // carries no gameId, and the exemption used to compare only that id,
          // so a static fallback boot reached through a shared link was written
          // into the reader's own library — which the contract forbids. The old
          // attempt at this (a name+prompt string key) collided whenever a
          // reader regenerated the same prompt from inside the link, silently
          // exempting their OWN new game. The flag rides the config object, so
          // it survives the restore remount and dies with the first generation.
          importedConfig.autoSaveExempt = true;
          // Links carry config only — boot on built-in theme art first. If the
          // link's gameId is in this browser's asset cache, an App effect
          // upgrades the boot to the cached AI art right after (one remount).
          importedConfig.dynamicAssetUrls = null;
          return {
            presetKey: 'custom',
            liveParams: importedConfig,
            isImported: true,
            pendingRestoreId: importedConfig.gameId || null
          };
        }
      } catch (error) {
        console.error('Failed to parse config from URL:', error);
      }
    }
  }

  // Presets boot on built-in theme art (no AI generation without a prompt).
  const initialPreset = { ...GAME_PRESETS['standard'], gameName: 'PlayMint Core', dynamicAssetUrls: null };

  return { presetKey: 'standard', liveParams: initialPreset, isImported: false };
};

function App() {
  const [initialConfig] = useState(getInitialState);
  const [presetKey, setPresetKey] = useState(initialConfig.presetKey);
  const [liveParams, setLiveParams] = useState(() => ({
    ...initialConfig.liveParams,
    // A per-boot identity, used ONLY to dedup auto-save and to make a late save
    // result land on the right config. A static-art boot has no gameId, so this
    // is the only thing that tells two different static games apart. It is
    // stripped from the share payload and from the saved row (shareLink.stripForShare),
    // so it is never persisted and never crosses a link.
    saveRunId: initialConfig.liveParams?.saveRunId || newRunId()
  }));
  const [hasStarted, setHasStarted] = useState(initialConfig.isImported);
  const [regenState, setRegenState] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const fullscreenContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFullscreenSupported, setIsFullscreenSupported] = useState(true);
  // Shown when the browser refuses native fullscreen (notably iOS Safari
  // portrait). Self-clearing: it is guidance, not a modal.
  const [fullscreenHint, setFullscreenHint] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [score, setScore] = useState(0);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameOverData, setGameOverData] = useState(null);
  const [gameKey, setGameKey] = useState(0);
  const [activeError, setActiveError] = useState(null);
  // Run ids whose "built-in world" notice was dismissed (or timed out).
  const [dismissedNotice, setDismissedNotice] = useState(null);
  const [captureMode, setCaptureMode] = useState(readCaptureMode);

  // Accounts + routes (2026-09-19). `route` only matters while no game is
  // running: /my-games and the reserved /g/:id replace ScreenZero. The sign-in
  // dialog pauses the game exactly like the Creator Panel does.
  const route = useRoute();
  const { dialog: authDialog, status: authStatus, user, requireAuth } = useAuth();
  const isSignInOpen = !!authDialog;

  // Saved games (2026-09-27, contract §2B). 'idle' | 'saving' | 'saved' | 'error'
  // drives the Save button in the HUD and in the Creator Panel; one action, two
  // entry points, so a slider tweak is saved the same way however it is reached.
  const [saveState, setSaveState] = useState('idle');
  // gameIds already auto-saved this session. Auto-save fires ONCE per game; the
  // Save button is the update path from then on ("tweaks update the saved config
  // when the user chooses Save").
  const autoSavedRef = useRef(new Set());
  // Boots whose row was written in THIS session. Only those receive the captured
  // in-game frame: attaching a thumbnail to a row that is merely being replayed
  // bumped its updated_at, so an old card in My Games showed today's date.
  const savedRunsRef = useRef(new Set());
  // The captured in-game frame, keyed by the per-boot identity. This is the
  // My Games card art: an actual frame of the running game, not a reconstruction
  // from its assets and never a bare colour (game/frameCapture.js).
  const frameRef = useRef(null);
  // Player-animation repair (one attempt per game) + its cancel token, so
  // starting another game or unmounting stops an in-flight redraw.
  const repairAttemptedRef = useRef(false);
  const repairTokenRef = useRef(null);
  const [repairState, setRepairState] = useState(null);
  // In-flight Quick Edit / Creator Panel redraw. Cancel drops its result, keeps
  // the current game and resumes it.
  const editTokenRef = useRef(null);

  // Timing telemetry (src/game/metrics.js). Two jobs, both of which have to be
  // set up before Phaser's first boot can land:
  //   1. A shared link's run starts at NAVIGATION, not at any click — that is
  //      what the "5-7s on mobile" figure actually measures.
  //   2. `phaser-load-complete` is the only signal that the scene is up. It
  //      fires once per boot, and a share link boots twice by design (theme art,
  //      then a remount onto cached art), so both are recorded on one run.
  useEffect(() => {
    if (initialConfig.isImported) {
      metrics.beginRun('sharelink', {
        gameId: initialConfig.pendingRestoreId || null,
        gameType: initialConfig.liveParams?.gameType || null
      });
      // The restore lookup below may trigger a second boot; hold the record open
      // until it resolves so a slow server fetch isn't filed as "no cached art".
      if (initialConfig.pendingRestoreId) metrics.holdRun();
    }
    const handlePlayable = () => metrics.notePlayable();
    window.addEventListener('phaser-load-complete', handlePlayable);
    return () => window.removeEventListener('phaser-load-complete', handlePlayable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handlePlaymintError = (e) => {
      const msg = e.detail?.message;
      if (msg) {
        setActiveError(msg);
      }
    };
    window.addEventListener('playmint-error', handlePlaymintError);
    return () => {
      window.removeEventListener('playmint-error', handlePlaymintError);
    };
  }, []);

  // Share-link / F5 art restore: when the imported link names a game cached in
  // THIS browser, upgrade the static boot to the cached AI art (one remount).
  // A miss changes nothing — the static boot IS the fallback.
  useEffect(() => {
    const id = initialConfig.pendingRestoreId;
    if (!id) return;
    let stale = false;
    getGameById(id).then((cached) => {
      if (stale) return;
      if (!cached) {
        // No cached art anywhere: the static boot already on screen IS the final
        // state, so the run can close on the boot it already recorded.
        metrics.releaseRun();
        return;
      }
      setLiveParams(prev => ({
        ...prev, // the link's config wins (it may carry post-generation tweaks)
        dynamicAssetUrls: true,
        gameId: id,
        preloadedImages: cached.preloadedImages,
        // The cache entry's own metadata is authoritative. The link's slim
        // metadata only fills fields an older/partial entry is missing — the
        // one case that matters is `frames`, which decides whether the player
        // animates at all.
        assetMeta: hydrateAssetMetaLite({ assetMeta: cached.assetMeta }).assetMeta
      }));
      setGameKey(k => k + 1);
      // Released after the remount is queued: the record now closes on the
      // boot that shows the real art, not the theme-art placeholder.
      metrics.releaseRun();
    }).catch(() => metrics.releaseRun());
    return () => { stale = true; };
  }, [initialConfig]);

  // While a generated game is running, keep the share payload in the URL so F5
  // restores the exact game (art via the local cache) and any copied URL is a
  // working share link. Keyed on gameKey/hasStarted — NOT liveParams — so
  // slider drags don't churn the address bar.
  useEffect(() => {
    if (!hasStarted) return;
    try {
      // Config-only hashes (no gameId) are valid too — they restore the same
      // static-art game on F5, and never leave a STALE previous game in the URL.
      window.history.replaceState(null, '', '#config=' + encodeShareConfig(liveParams));
    } catch { /* URL/history quirks must never break the game */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey, hasStarted]);

  // Right before a full-page OAuth redirect the sign-in dialog asks for the
  // FRESHEST config in the hash (the effect above is deliberately not keyed on
  // liveParams), so slider tweaks survive the round trip to Google and back.
  useEffect(() => {
    if (!hasStarted) return undefined;
    const flush = () => {
      try {
        const live = window.__GAME_LIVE_CONFIG;
        if (live) window.history.replaceState(null, '', '#config=' + encodeShareConfig(live));
      } catch { /* non-fatal */ }
    };
    window.addEventListener('pm-flush-share-hash', flush);
    return () => window.removeEventListener('pm-flush-share-hash', flush);
  }, [hasStarted]);

  // Back/forward. Only the move between '/' and '/my-games' stays in-SPA (the
  // router re-renders on popstate by itself). Anything involving a game — one
  // is running, or the URL we landed on carries a share payload — reloads, which
  // reuses the well-tested getInitialState share-link import path.
  useEffect(() => {
    const onPop = () => {
      if (hasStarted || (window.location.hash || '').startsWith('#config=')) {
        window.location.reload();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [hasStarted]);

  // In development, persist environment variables to localStorage for quick iteration.
  // In production, ensure no client-side Gemini API key persists in localStorage.
  useEffect(() => {
    if (!import.meta.env.PROD) {
      const geminiEnv = import.meta.env.VITE_GEMINI_API_KEY;
      if (geminiEnv) {
        localStorage.setItem('GEMINI_API_KEY', geminiEnv);
      }
    } else {
      localStorage.removeItem('GEMINI_API_KEY');
    }
    // Dev/ops console tool: bulk cache population (see assetCache/bulkRunner.js).
    // Lazy import keeps the runner + prompt list out of the hot path.
    window.__PM_BULK = (list, opts) =>
      import('./game/assetCache/bulkRunner.js').then((m) => m.runBulkPopulation(list, opts));
  }, []);

  // Detect touch device or narrow screen layout dynamically for mobile virtual D-pad
  useEffect(() => {
    const checkLayout = () => {
      setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 1024);
    };
    checkLayout();
    window.addEventListener('resize', checkLayout);
    return () => window.removeEventListener('resize', checkLayout);
  }, []);

  // Global capture-phase keyboard event interceptor.
  // Stops keyboard event propagation if the target is an HTML input or textarea,
  // or sits inside a [data-pm-modal] surface (sign-in dialog, account menu) — so
  // Space/Enter on a dialog BUTTON can't jump, restart the run, or be
  // preventDefault-ed by the scene. Consequence: React onKeyDown never fires
  // inside those surfaces; they use native window-capture listeners instead.
  // This guarantees Phaser never captures key events (preventing defaults) while typing.
  useEffect(() => {
    const handleCaptureKeyboard = (e) => {
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.closest?.('[data-pm-modal]'))) {
        e.stopPropagation();
      }
    };
    
    window.addEventListener('keydown', handleCaptureKeyboard, true);
    window.addEventListener('keyup', handleCaptureKeyboard, true);
    window.addEventListener('keypress', handleCaptureKeyboard, true);
    
    return () => {
      window.removeEventListener('keydown', handleCaptureKeyboard, true);
      window.removeEventListener('keyup', handleCaptureKeyboard, true);
      window.removeEventListener('keypress', handleCaptureKeyboard, true);
    };
  }, []);

  // Capture mode: one class on <body> drives every "hide this" rule in the CSS,
  // so no component needs to know the mode exists. Esc always gets you out —
  // browsers also fire it to leave fullscreen, which is the same intent.
  useEffect(() => {
    const body = document.body;
    body.classList.toggle('pm-capture', !!captureMode);
    body.classList.toggle('pm-capture--clean', captureMode === 'clean');
    if (!captureMode) return undefined;

    const onKey = (e) => {
      if (e.key === 'Escape') exitCaptureMode();
    };
    // Fullscreen cannot be requested without a user gesture, so arm the first
    // tap/click to enter it. Once only — after that the page is already clean.
    const onFirstGesture = () => {
      if (!fullscreenElement() && fullscreenContainerRef.current) {
        requestFullscreenOn(fullscreenContainerRef.current);
      }
      window.removeEventListener('pointerdown', onFirstGesture);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onFirstGesture);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onFirstGesture);
    };
  }, [captureMode]);

  // Fullscreen API detection & listener
  useEffect(() => {
    const isSupported = document.fullscreenEnabled || 
                       document.webkitFullscreenEnabled || 
                       document.mozFullScreenEnabled || 
                       document.msFullscreenEnabled;
    setIsFullscreenSupported(!!isSupported);

    const onFullscreenChange = () => {
      setIsFullscreen(!!fullscreenElement());
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);

  // Score listener from Phaser
  useEffect(() => {
    const handleScoreUpdate = (e) => setScore(e.detail);
    window.addEventListener('update-score', handleScoreUpdate);
    return () => window.removeEventListener('update-score', handleScoreUpdate);
  }, []);

  // Pause game when the CreatorPanel menu OR the sign-in dialog is open. ONE
  // derived flag on purpose: closing the panel must not resume the game under a
  // still-open dialog.
  useEffect(() => {
    if (!liveParams?.staticNotice || !liveParams.saveRunId) return undefined;
    const runId = liveParams.saveRunId;
    const t = setTimeout(() => setDismissedNotice(runId), 14000);
    return () => clearTimeout(t);
  }, [liveParams?.staticNotice, liveParams?.saveRunId]);

  // regenState: a Quick Edit / Creator Panel redraw closes its overlay so the
  // progress screen is visible — the game must STAY paused until the edit is
  // applied or cancelled (client report 2026-11-04: typed edits let the run end
  // in Game Over behind the progress screen).
  const shouldPause = isMenuOpen || isSignInOpen || isQuickEditOpen || !!regenState;
  useEffect(() => {
    window.__PM_SHOULD_PAUSE = shouldPause;
    window.dispatchEvent(new CustomEvent('toggle-pause-game', { detail: { isPaused: shouldPause } }));
    if (!shouldPause) return undefined;
    // A gameKey remount (share-link art restore) boots a fresh scene with
    // isGamePaused = false — re-assert the pause once that scene is up.
    // Deferred: the event fires from the loader's 'complete', one step BEFORE
    // create() registers the scene's pause listener.
    const reassert = () => setTimeout(() =>
      window.dispatchEvent(new CustomEvent('toggle-pause-game', { detail: { isPaused: true } })), 50);
    window.addEventListener('phaser-load-complete', reassert);
    return () => window.removeEventListener('phaser-load-complete', reassert);
  }, [shouldPause]);

  // Score listener from Phaser
  useEffect(() => {
    const handleGameOver = (e) => {
      setGameOverData(e.detail);
      setIsGameOver(true);
    };
    const handleGameReset = () => {
      setIsGameOver(false);
      setGameOverData(null);
    };
    window.addEventListener('game-over', handleGameOver);
    window.addEventListener('game-reset', handleGameReset);
    return () => {
      window.removeEventListener('game-over', handleGameOver);
      window.removeEventListener('game-reset', handleGameReset);
    };
  }, []);

  const handleRestartGame = () => {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    setIsGameOver(false);
    window.dispatchEvent(new CustomEvent('restart-game'));
  };

  const handleTweakSettings = () => {
    setIsGameOver(false);
    setIsMenuOpen(true);
  };

  // Sync live params to Phaser via global + CustomEvent
  if (typeof window !== 'undefined') {
    window.__GAME_LIVE_CONFIG = liveParams;
    window.__GAME_IS_TRANSITIONING = isTransitioning;
  }

  // (Removed 2026-08-20) An effect here used to mirror the --pm-safe-area-*
  // CSS vars onto window.__pmSafeArea{Top,Right,Bottom,Left}. Nothing ever read
  // them. The real need — telling the game layer how much screen the touch
  // controls occupy — is now served by src/game/uiZones.js, which MobileControls
  // populates from measured DOM rects.

  useEffect(() => {
    console.log('[App] update-game-config dispatched, gameType=', liveParams.gameType, 'hasStarted=', hasStarted);
    window.dispatchEvent(new CustomEvent('update-game-config', { detail: liveParams }));
  }, [liveParams, hasStarted]);

  // --- Handlers ---

  const handleFullscreen = () => {
    if (fullscreenContainerRef.current && !fullscreenElement()) {
      const req = requestFullscreenOn(fullscreenContainerRef.current);
      // requestFullscreenOn swallows a missing API and errors, so an unsupported
      // browser would otherwise make the button a silent no-op — which is the
      // state the button is now VISIBLE in. Say what to do instead.
      if (req && typeof req.catch === 'function') {
        req.catch(() => setFullscreenHint(true));
      } else if (!isFullscreenSupported) {
        setFullscreenHint(true);
      }
    }
  };

  const handleExitFullscreen = () => {
    exitFullscreenNow();
  };

  // Leaving capture mode: drop the flag AND the URL param, so a reload does not
  // silently drop the user back into a chrome-free screen with no way out.
  const exitCaptureMode = () => {
    setCaptureMode(null);
    exitFullscreenNow();
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('capture');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* URL quirks must never trap the user in capture mode */
    }
  };

  const handleSliderChange = (e) => {
    const { name, value } = e.target;
    setLiveParams(prev => ({
      ...prev,
      [name]: parseFloat(value) || 0
    }));
  };

  const applyPreset = (key) => {
    const mode = key === 'action_quest' ? 'action_quest'
      : key === 'shooter_arena' ? 'shooter_arena'
      : 'standard';
    const theme = 'ice';

    setPresetKey(key);
    setLiveParams(withRunId({
      ...GAME_PRESETS[key],
      themeKey: theme,
      gameName: generateTitle("", mode, theme),
      dynamicAssetUrls: null // presets use built-in theme art
    }));
  };

  const handleOpenSelector = () => {
    setIsSelectorOpen(true);
    setIsMenuOpen(false);
  };

  const handleGenerate = (key, customConfig) => {
    setPresetKey(key);
    setGameKey(k => k + 1);
    // Fresh run id: this is a NEW game, so it must be free to auto-save as its
    // own row even if the previous game was the same preset.
    setLiveParams(withNewGame(customConfig));
    setHasStarted(true);
    setIsPromptOpen(false);
    setIsGameOver(false);
    setGameOverData(null);
  };

  const handleOverlayGenerate = (key, customConfig) => {
    setPresetKey(key);
    setGameKey(k => k + 1);
    setLiveParams(withNewGame(customConfig));
    setIsPromptOpen(false);
    setIsGameOver(false);
    setGameOverData(null);
  };

  // Automatically blur active input element when the game starts, config updates, or game restarts
  // to ensure keyboard focus shifts back to the game/body.
  useEffect(() => {
    const active = document.activeElement;
    // Never steal focus from the sign-in dialog / account menu (on iOS a blur
    // also dismisses the keyboard mid-typing).
    if (active && active.closest?.('[data-pm-modal]')) return;
    // Nor from ANY text field: this effect runs on every liveParams change, and a
    // background update (auto-save stamp, art restore, repair) used to close the
    // phone keyboard mid-word in the Creator Panel's name/prompt inputs.
    const tag = active?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || active?.isContentEditable) return;
    if (active && typeof active.blur === 'function') {
      active.blur();
    }
  }, [hasStarted, presetKey, liveParams, isGameOver]);

  // Leaving the running game, either way. isTransitioning is cleared HERE as
  // well as in onCompleteTransition: that callback only fires when the
  // ScreenZero phase machine reaches 'fading' (ScreenZero.jsx:262), so a boot
  // that stops short — a cancelled run, a failed load, a second generation
  // started from the preset path — left the flag stuck true forever, and the
  // route gates below never mounted anything. Navigating away is a second,
  // unconditional exit from that state.
  const leaveRunningGame = () => {
    setHasStarted(false);
    setIsMenuOpen(false);
    setIsQuickEditOpen(false);
    setIsPromptOpen(false);
    setIsGameOver(false);
    setGameOverData(null);
    setIsTransitioning(false);
  };

  const handleGoHome = () => {
    leaveRunningGame();
    // A clean Create screen: no leftover "Remixing: X" banner or parent link.
    setLiveParams(prev => ({ ...prev, remixParentId: null, remixParentTitle: null, remixBase: null, sourcePrompt: '' }));
    // Leaving the game: drop the share hash so a reload lands on ScreenZero.
    // Pinned to '/' (not the current pathname) now that the app has routes.
    navigate('/', { replace: true });
  };

  // Account menu → My Games while a game is running: leave the game first.
  const handleGoMyGames = () => {
    leaveRunningGame();
    navigate('/my-games');
  };

  // Play a public game directly on /g/:id
  const handlePlayPublicGame = (publicGame) => {
    if (!publicGame) return;
    const isOwner = authStatus === 'authed' && user?.id === publicGame.owner_id;
    const config = {
      ...(publicGame.config || {}),
      gameId: publicGame.art_id || publicGame.config?.gameId || null,
      gameName: publicGame.title || publicGame.config?.gameName || 'PlayMint Game',
      gameType: publicGame.mode || publicGame.config?.gameType || 'runner',
      sourcePrompt: publicGame.prompt || publicGame.config?.sourcePrompt || '',
      creatorName: publicGame.creator_name || 'Community Creator',
      isPublicGame: true,
      // Ownership facts travel IN the config so they survive F5 / a copied URL.
      // (Playing a game must NOT stamp it as the remix parent — only an actual
      // Remix does, in handleRemix. Doing it here made owners their own parents.)
      rowId: publicGame.id,
      ownerId: publicGame.owner_id || null,
      visibility: publicGame.visibility || null,
      savedGameId: isOwner ? publicGame.id : null,
      // Playing a saved game is never a new save: the owner already has the
      // row (manual Save updates it via savedGameId), and a visitor must never
      // get a copy in their own library.
      autoSaveExempt: true,
      allowRemix: publicGame.allow_remix === true,
      assetMeta: publicGame.asset_meta || null,
    };
    setLiveParams(withRunId(config));
    setHasStarted(true);
    setGameKey(k => k + 1);

    // If art_id is available, hydrate from asset cache or Blob store
    const artId = publicGame.art_id;
    if (artId) {
      getGameById(artId).then((cached) => {
        if (!cached) return;
        setLiveParams(prev => ({
          ...prev,
          dynamicAssetUrls: true,
          preloadedImages: cached.preloadedImages,
          assetMeta: hydrateAssetMetaLite({ assetMeta: cached.assetMeta }).assetMeta
        }));
        setGameKey(k => k + 1);
      }).catch(() => {});
    }
  };

  // The viewer owns this game when it has no recorded owner (generated here, this
  // session) or the recorded owner is the signed-in user.
  const isViewerOwner = !liveParams?.ownerId
    || (authStatus === 'authed' && user?.id === liveParams.ownerId);
  // A creator can switch remixing off. The owner can always remix their own game;
  // anyone else only while the flag is explicitly on.
  const canRemix = isViewerOwner || liveParams?.allowRemix === true;

  // Minimal Remix: carry forward prompt, mode, theme, and lineage. Accepts a DB
  // row (public page / community card) or the live game's params. Enforced here,
  // not just by hiding buttons.
  const handleRemix = (gameOrParams) => {
    const source = gameOrParams || liveParams;
    const isRow = source && source.allow_remix !== undefined;
    const allowed = isRow
      ? (source.allow_remix === true || (authStatus === 'authed' && !!user?.id && user.id === source.owner_id))
      : canRemix;
    if (!allowed) return;
    leaveRunningGame();
    const parentId = isRow ? source.id : (source.savedGameId || source.rowId || null);
    const parentTitle = source.title || source.gameName || 'PlayMint Game';
    const parentPrompt = source.prompt || source.sourcePrompt || '';
    const parentType = source.mode || source.gameType || 'runner';
    const parentTheme = source.config?.themeKey || source.themeKey || null;

    setLiveParams(prev => ({
      ...prev,
      sourcePrompt: parentPrompt,
      gameType: parentType,
      themeKey: parentTheme,
      remixParentId: parentId,
      remixParentTitle: parentTitle,
      savedGameId: null, // remixed variants are saved as fresh rows
      rowId: null,
      ownerId: null,
      allowRemix: true,
      // The PARENT config stays in liveParams behind the remix screen. It must
      // not auto-save (that wrote a copy of the parent into the remixer's library
      // before anything was generated); the remix result is a new game and
      // carries its own createdInSession flag.
      autoSaveExempt: true,
      createdInSession: false,
      // What the remix edits: the parent's art set + its full config. ScreenZero
      // applies the instruction OVER this art (targeted redraw) instead of
      // generating a new world from the instruction alone.
      remixBase: {
        artId: isRow ? (source.art_id || source.config?.gameId || null) : (source.gameId || null),
        // forRow: the parent's row id / owner / visibility must not ride into the
        // remix — it is a new game owned by whoever makes it.
        config: stripForShare({
          ...(isRow ? { ...(source.config || {}), gameType: parentType } : source),
          sourcePrompt: parentPrompt,
          themeKey: parentTheme
        }, { forRow: true }),
        title: parentTitle
      },
    }));
    navigate('/');
  };

  // ── Saved games (contract §2B, 2026-09-27) ─────────────────────────────────
  // ONE action behind both Save buttons (HUD + Creator Panel), so a slider tweak
  // is saved the same way however the user reaches it. liveParams is read through
  // a ref rather than the closure: these handlers are passed to memo-free
  // children and must always see the CURRENT run, not the render they were
  // created in.
  const liveParamsRef = useRef(liveParams);
  liveParamsRef.current = liveParams;

  // A game opened from My Games / a public page carries its row id; once we know
  // the signed-in user owns that row, Save becomes an UPDATE of it. (savedGameId
  // itself is deliberately stripped from share payloads.)
  useEffect(() => {
    if (authStatus !== 'authed' || !user?.id) return;
    if (liveParams?.rowId && liveParams?.ownerId === user.id && !liveParams.savedGameId) {
      setLiveParams(prev => (prev.rowId === liveParams.rowId && !prev.savedGameId
        ? { ...prev, savedGameId: prev.rowId } : prev));
    }
  }, [authStatus, user?.id, liveParams?.rowId, liveParams?.ownerId, liveParams?.savedGameId]);

  const runSave = async () => {
    const current = liveParamsRef.current;
    setSaveState('saving');
    const frame = frameRef.current?.runId === current?.saveRunId ? frameRef.current.blob : null;
    const result = await saveGame({ liveParams: current, preloadedImages: current?.preloadedImages, frameBlob: frame });
    if (!result.ok) {
      setSaveState('error');
      console.warn('[SavedGames] save failed:', result.error);
      return false;
    }
    // Remember the row so a SECOND save (after tweaks) updates it instead of
    // inserting a duplicate. Guarded on the per-boot token, not gameId: a
    // slow manual save for game A landing after game B booted would otherwise
    // stamp A's row onto B, and B's next save would UPDATE A's row.
    const id = result.id;
    if (current?.saveRunId) savedRunsRef.current.add(current.saveRunId);
    setLiveParams(prev => (
      id && prev.saveRunId === current?.saveRunId ? { ...prev, savedGameId: id } : prev
    ));
    setSaveState('saved');
    // Back to the resting label on its own (the Share button's idiom), so a
    // later save is never a no-op because the button still reads "Saved".
    setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000);
    window.dispatchEvent(new CustomEvent('pm-games-changed'));
    return true;
  };

  // A guest is sent through the sign-in dialog and the save runs itself
  // afterwards (AuthProvider replays its pendingActionRef on SIGNED_IN). A
  // GOOGLE sign-in is a full-page redirect that drops that callback — the
  // auto-save below covers the gap, because signing in flips authStatus for the
  // game already on screen.
  const requestSave = () => {
    if (requireAuth('save', runSave)) runSave();
  };

  // Auto-save on generation for signed-in users, so the game is in My Games
  // before anyone goes looking for it.
  //
  // A STATIC-ART BOOT HAS NO gameId and still auto-saves. That gate (removed
  // 2026-09-29) excluded every run where Gemini was unavailable, over quota or
  // fatally failed, plus every "💾 Cache only" miss — i.e. on a keyless
  // deployment it excluded 100% of runs, while the manual Save button worked
  // fine, because saveGame treats a missing art id as an ordinary INSERT
  // (art_id null, savedGames/index.js). The fix is to let the keyless path
  // through, NOT to mint a fake gameId: art_id is the lookup key for uploaded
  // art, so a synthetic id would make getGameById/ensureUploaded chase files
  // that were never written.
  //
  // Dedup identity is the ROW target when there is one, else the art id, else a
  // stable per-boot token — a static boot has neither id, and keying on
  // liveParams.gameId (undefined) would dedup every static game as one.
  //
  // The game the user ARRIVED with is exempt: opening someone else's shared game
  // must not write a row into the reader's library. The exemption is the
  // autoSaveExempt flag getInitialState stamps on an imported config, so it
  // covers a link to a static-art game (no gameId) as well as an AI one, and a
  // game the reader generates from inside the link is NOT exempt (the fresh
  // config has no flag).
  useEffect(() => {
    if (authStatus !== 'authed' || !hasStarted) return;
    const current = liveParamsRef.current;
    if (!current || current.autoSaveExempt) return;
    // Only games the user generated in this session (see withNewGame). The
    // default "PlayMint Core" preset behind the home screen, preset switches and
    // public plays have no flag and are never written into the library.
    if (current.createdInSession !== true) return;
    // Dedup key is the ROW target when there is one, else the art id, else the
    // per-boot token. A static-art boot has neither id, and a name+prompt STRING
    // collided: two different static games from the same prompt (a re-roll with a
    // different title, or a second run) shared one key, so the second silently
    // never auto-saved. `saveRunId` is unique per config object, so it can only
    // ever suppress a genuine repeat of the SAME game.
    // The per-boot token comes FIRST: keyed on savedGameId, the key changed the
    // moment the INSERT landed and every auto-save ran a second time as an UPDATE.
    const dedupKey = current.saveRunId || current.gameId;
    if (!dedupKey) return;
    if (autoSavedRef.current.has(dedupKey)) return;
    autoSavedRef.current.add(dedupKey);
    let cancelled = false;
    let retryTimer = null;
    const attempt = (triesLeft) => {
      // Re-read every attempt: a retry must save the CURRENT params, not the
      // snapshot that failed.
      const params = liveParamsRef.current;
      if (!params) return;
      // The captured frame, when this game has one. A save that beats the
      // capture (auto-save fires the moment the row can be inserted) falls back
      // to composing, and the frame is attached to the row when it lands.
      const frame = frameRef.current?.runId === params.saveRunId ? frameRef.current.blob : null;
      saveGame({ liveParams: params, preloadedImages: params?.preloadedImages, frameBlob: frame }).then((res) => {
        if (cancelled) return;
        if (res.ok) {
          const id = res.id;
          // Only stamp the row id onto the config it belongs to. A slow save for
          // game A landing after game B booted would otherwise write A's row id
          // onto B, and B's next save would UPDATE A's row. The old guard was
          // `prev.gameId === params.gameId`, which is `undefined === undefined`
          // for two DIFFERENT static games — exactly the population without ids.
          // The per-boot token compares uniquely in every case.
          setLiveParams(prev => (
            id && prev.saveRunId === params.saveRunId ? { ...prev, savedGameId: id } : prev
          ));
          savedRunsRef.current.add(params.saveRunId);
          setSaveState('saved');
          setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000);
          window.dispatchEvent(new CustomEvent('pm-games-changed'));
          return;
        }
        // Visible, not a console line: a silently-failed auto-save is
        // indistinguishable from one that never ran, which is exactly how this
        // bug reached the client. The Save buttons already render "!" and
        // "Could not save — press to try again" for saveState 'error'.
        autoSavedRef.current.delete(dedupKey);
        setSaveState('error');
        console.warn('[SavedGames] auto-save failed:', res.error);
        // Re-arm with a bounded retry. Deleting the key alone was not enough:
        // no effect dependency ever changes again, so nothing re-ran it.
        if (triesLeft > 0) {
          retryTimer = setTimeout(() => { if (!cancelled) attempt(triesLeft - 1); }, 4000);
        }
      }).catch((err) => {
        if (cancelled) return;
        autoSavedRef.current.delete(dedupKey);
        setSaveState('error');
        console.warn('[SavedGames] auto-save threw:', err);
        if (triesLeft > 0) {
          retryTimer = setTimeout(() => { if (!cancelled) attempt(triesLeft - 1); }, 4000);
        }
      });
    };
    attempt(2);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [liveParams.gameId, liveParams.savedGameId, liveParams.autoSaveExempt, liveParams.saveRunId, liveParams.createdInSession, authStatus, hasStarted]);

  // ── Player-animation repair (added 2026-09-29) ────────────────────────────
  // A game whose sprite sheet failed every rescue rung boots with a STATIC
  // player: GameManagerScene creates 'dyn_player_run' only when
  // assetMeta.slots.player.frames exists, so playPlayerAnim takes the
  // anims.stop() branch and the runner "moves forward but never animates" —
  // the client report. The pipeline logs that state loudly at generation time,
  // where nobody is looking, and the tilt-bob that used to paper over it was
  // removed at the client's direction (2026-08-23). So the game heals ITSELF
  // here, in the background, and the user never sees the frozen player for more
  // than the length of one redraw.
  //
  // COST IS THE WHOLE DESIGN CONSTRAINT, and every gate below exists to keep it
  // at zero whenever the user has asked for zero:
  //   · no Gemini key            → never. This is the "key off, no money" case.
  //   · PM_FORCE_CACHE ('Cache only') → never. Hard no-spend mode.
  //   · static-art boot          → never. There is no generated player to build a
  //     sheet FROM, and this is the same population auto-save just learned to
  //     save by hand; a keyless deployment must stay keyless.
  //   · shooter                  → never. No sheet exists for a rotating sprite.
  //   · instruction ''           → reuses config.assetDesignDirections, so the
  //     prompt designer takes its LOCAL path: no LLM design call.
  //   · maxImageCalls 4          → static base + ONE sheet attempt, never the
  //     full rescue ladder (lite ×2 → 3.1-flash → per-frame escalation).
  // It runs after a beat so the first frames are never competing with it, it is
  // cancellable, it is capped to one attempt per game, and every failure is
  // swallowed: a repair must never break play.
  const hasLiveArt = !!liveParams.preloadedImages;
  useEffect(() => {
    const params = liveParamsRef.current;
    if (!params || !hasStarted) return;
    // One attempt per GAME, keyed by the per-boot identity rather than a bare
    // boolean: a boolean reset effect runs in the same commit as this one (and
    // would clear a guard this effect had just set), while a keyed check
    // self-invalidates the moment a genuinely new game boots.
    // Keyed on the PLAYER IMAGE as well (2026-11-04): a Quick Edit that redraws
    // the player can ship a new static sprite into the same game, and a key on
    // saveRunId alone meant that game was never repaired again — "after the
    // African city edit the player no longer ran".
    const playerImg = params.preloadedImages?.player;
    const gameKeyForRepair = params.saveRunId && playerImg
      ? `${params.saveRunId}|${playerImg.src?.length || 0}|${playerImg.width}x${playerImg.height}|${playerImg.src?.slice(-48) || ''}`
      : null;
    if (!gameKeyForRepair || repairAttemptedRef.current === gameKeyForRepair) return;
    // Only a game that HAS generated art and a static player to replace.
    if (!params.dynamicAssetUrls) return;
    if (params.gameType === 'shooter') return;
    const playerMeta = params.assetMeta?.slots?.player;
    if (!playerMeta) return;
    // Has frames → the scene already built the animation. Nothing to repair.
    if (playerMeta.frames) return;
    if (!isGeminiConfigured()) return;
    try {
      if (localStorage.getItem('PM_FORCE_CACHE') === '1') return;
    } catch { /* private mode: assume spend is allowed */ }

    repairAttemptedRef.current = gameKeyForRepair;
    const token = createCancelToken();
    repairTokenRef.current = token;
    // True once the redraw actually ran to a verdict (done/failed). A repair that is
    // merely cancelled by a dependency change (restored art arriving) did NOT use up
    // the one attempt, so its guard is released in the cleanup below.
    let ranToVerdict = false;
    const timer = setTimeout(async () => {
      if (token.cancelled) return;
      setRepairState('running');
      const t0 = performance.now();
      try {
        // instruction '' → local design path, no LLM call. slots ['player_sheet']
        // is the same substitution generation makes for the player slot.
        const res = await regenerateAssetSlots({
          config: params,
          instruction: '',
          slots: ['player_sheet'],
          cancelToken: token,
          maxImageCalls: 4,
          reuseStaticBase: true
        });
        if (token.cancelled) return;
        const newMeta = res?.meta || {};
        const newImages = res?.preloadedImages || {};
        // The sheet result is stored under the `player` key. Without frames the
        // gates rejected it again, so there is nothing to swap in and the static
        // player (with its honest note) stays.
        ranToVerdict = true;
        if (!newMeta.player?.frames || !newImages.player) {
          setRepairState('failed');
          console.warn('[PlayerRepair] the redraw did not produce an animated sheet; keeping the static player.');
          return;
        }
        // Merge into the CURRENT params, not the snapshot from when the repair began:
        // a slider tweak or restyle made during the 20-60s redraw must survive.
        const latest = liveParamsRef.current;
        if (!latest || latest.saveRunId !== params.saveRunId) return; // a different game booted meanwhile
        // The player was replaced meanwhile (an edit redrew it): this sheet is of
        // the OLD character and must not be painted over the new one.
        if (latest.preloadedImages?.player !== playerImg) return;
        const mergedImages = { ...(latest.preloadedImages || {}), player: newImages.player };
        const mergedParams = {
          ...latest,
          preloadedImages: mergedImages,
          assetMeta: {
            ...(latest.assetMeta || {}),
            slots: {
              ...(latest.assetMeta?.slots || {}),
              player: { ...newMeta.player, source: 'generated' }
            },
            // The repair's spend is part of THIS game's cost, or the report
            // under-counts a game that quietly cost twice.
            cost: mergeRepairCost(latest.assetMeta?.cost, res.cost),
            run: { ...(latest.assetMeta?.run || {}), repairedPlayerAnim: true }
          }
        };
        setRepairState('done');
        window.__GAME_LIVE_CONFIG = mergedParams;
        setLiveParams(mergedParams);
        setGameKey(k => k + 1);
        // Persist under the same cache entry so a later hit/share-link shows the
        // animated player — but never for a game the viewer does not own (public
        // plays carry autoSaveExempt): a visitor must not rewrite someone else's art.
        if (mergedParams.gameId && (!mergedParams.autoSaveExempt || mergedParams.savedGameId)) {
          updateGameArt(mergedParams.gameId, {
            config: mergedParams,
            preloadedImages: mergedImages,
            assetMeta: mergedParams.assetMeta
          });
        }
        console.log(`[PlayerRepair] animated player installed in ${Math.round(performance.now() - t0)}ms`);
      } catch (err) {
        if (token.cancelled || err?.cancelled) return;
        ranToVerdict = true;
        setRepairState('failed');
        console.warn('[PlayerRepair] failed, keeping the static player:', err?.message || err);
      }
    }, 1200);
    return () => {
      clearTimeout(timer);
      token.cancel();
      repairTokenRef.current = null;
      if (!ranToVerdict && repairAttemptedRef.current === gameKeyForRepair) repairAttemptedRef.current = null;
    };
  // dynamicAssetUrls / hasArt: a restored game (share link, F5, My Games) boots on
  // placeholders and gets its art one remount later — the effect must re-evaluate then.
  }, [hasStarted, liveParams.gameId, liveParams.saveRunId, liveParams.dynamicAssetUrls, hasLiveArt, liveParams.preloadedImages?.player]);

  // A new game clears the visible repair state and cancels an in-flight redraw
  // belonging to the previous one. The one-shot guard does NOT need resetting —
  // it is keyed on saveRunId, so a new game simply does not match.
  // (The in-flight token is cancelled by the repair effect's own cleanup. Cancelling
  // it HERE too killed a repair that effect had just started in the same commit.)
  useEffect(() => {
    setRepairState(null);
  }, [liveParams.saveRunId]);

  // ── In-game frame capture (the My Games card art) ─────────────────────────
  // The card must be a frame OF THE GAME, so it is one: the running canvas is
  // read back after boot, once the scene has settled. Keyed on the per-boot
  // identity and on whether the user is signed in — an anonymous session can
  // never have a library to hold a thumbnail, and captureGameFrameWhenReady
  // costs a readPixels, so there is no reason to pay it.
  //
  // Two consumers, in the order things happen:
  //   1. auto-save / manual save read frameRef.current (a save that happens
  //      before the frame is ready falls back to composing, as before);
  //   2. if a row was already written when the frame lands, attachThumbnail
  //      pushes it onto that row — which is also how an OLD card that was saved
  //      back when there was no frame at all gets a real one, the next time the
  //      user plays it.
  useEffect(() => {
    if (!hasStarted || authStatus !== 'authed') return;
    const runId = liveParams.saveRunId;
    if (!runId) return;
    let cancelled = false;
    captureGameFrameWhenReady().then((blob) => {
      if (cancelled || !blob) return;
      frameRef.current = { runId, blob };
      // A row saved before this point has no frame of its own.
      const params = liveParamsRef.current;
      if (params?.saveRunId === runId && params?.savedGameId && savedRunsRef.current.has(runId)) {
        attachThumbnail(params.savedGameId, blob).then((path) => {
          if (!cancelled && path) window.dispatchEvent(new CustomEvent('pm-games-changed'));
        });
      }
    });
    return () => { cancelled = true; };
  }, [hasStarted, authStatus, liveParams.saveRunId]);

  const handlePromptGenerate = async (promptText) => {
    console.log('[App.jsx] handlePromptGenerate triggered with prompt:', promptText);
    // Synchronously blur active elements immediately before closing menu / updating config
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    const raw = promptText.trim();
    if (!raw) return;

    // Generation takes 15s–2min — surface it with the compiler overlay so the user
    // sees log/progress feedback instead of a silently frozen panel.
    const pushProgress = (logText, progressVal) => {
      // Pipeline liveness ticks carry a pct with null text — keep the pct, skip the log
      setRegenState(prev => prev && {
        ...prev,
        progress: progressVal != null ? Math.max(prev.progress, progressVal) : prev.progress,
        logs: logText ? [...prev.logs.slice(-9), logText] : prev.logs
      });
    };

    // A running game first goes through the AI editor: variable tweaks apply live
    // (no asset generation, no reboot) via the existing update-game-config channel;
    // restyles redraw ONLY the targeted slots and keep everything else.
    if (hasStarted) {
      const edit = await interpretEditPrompt(liveParams, raw);
      console.log('[App.jsx] Edit interpretation:', edit);
      if (edit.intent === 'tweak') {
        if (!Object.keys(edit.changes).length) {
          return { applied: false, summary: edit.summary || 'No recognized changes — try rephrasing or describe a new game.' };
        }
        setLiveParams(prev => ({ ...prev, ...edit.changes }));
        setPresetKey('custom');
        return { applied: true, summary: edit.summary };
      }
      // Cherry-pick regeneration: only possible when we still hold the previous
      // run's preloaded images (preset/share-link games only have raw URLs — those
      // fall through to the full pipeline so every slot exists afterwards).
      if (edit.intent === 'restyle' && liveParams.preloadedImages) {
        const slots = resolveAssetTargets(edit.assetTargets, liveParams);
        if (!slots.length) {
          return { applied: false, summary: 'Nothing to redraw for this game mode — try naming another element.' };
        }
        const token = beginEdit();
        setIsMenuOpen(false);
        setIsQuickEditOpen(false); // let the regen progress overlay be seen (the game stays paused: regenState)
        setRegenState({
          title: 'Updating Artwork',
          progress: 5,
          logs: [`[EDITOR] ${edit.summary || `Redrawing ${edit.assetTargets.join(', ')}`} (${slots.length} slot${slots.length > 1 ? 's' : ''})...`]
        });
        try {
          const restyleT0 = performance.now();
          metrics.beginRun('restyle', { tier: 'restyle', gameId: liveParams.gameId || null, slots });
          const { preloadedImages: newImages, meta: newMeta, cost: restyleCost, design: restyleDesign } = await regenerateAssetSlots({
            config: liveParams,
            instruction: raw,
            slots,
            cancelToken: token,
            onProgress: (logText, progressVal) => pushProgress(logText, progressVal)
          });
          if (token.cancelled) {
            metrics.cancelRun();
            return { applied: false, summary: 'Edit cancelled — your game was kept.' };
          }
          metrics.mark('assets-generated');
          metrics.annotate({ estUsd: restyleCost?.estUsd || 0 });
          pushProgress('[ENGINE] Artwork updated! Restarting world...', 100);
          // Merge onto the CURRENT config (slider tweaks made before the edit survive).
          const base = liveParamsRef.current || liveParams;
          const { mergedImages, mergedSlots, redrawnSlots, keptOld } = mergeRedrawnArt({
            baseImages: base.preloadedImages,
            baseSlots: base.assetMeta?.slots,
            newImages,
            newMeta
          });
          const mergedParams = {
            ...base,
            ...edit.changes,
            preloadedImages: mergedImages,
            assetMeta: {
              ...(base.assetMeta || {}),
              slots: mergedSlots,
              design: mergeDesign(base.assetMeta?.design, restyleDesign, redrawnSlots),
              // The report shows THIS restyle's spend, not the pre-restyle run's.
              cost: restyleCost || { estUsd: 0, imageCalls: 0, visionCalls: 0, calls: [] },
              run: {
                tier: 'restyle',
                elapsedMs: Math.round(performance.now() - restyleT0),
                generatedSlots: redrawnSlots,
                reusedSlots: Object.keys(mergedImages).filter(s => !redrawnSlots.includes(s)),
                estUsd: restyleCost?.estUsd || 0
              }
            }
          };
          setGameKey(k => k + 1);
          setPresetKey('custom');
          setLiveParams(mergedParams);
          // Persist the restyled art under the game's existing cache entry so a
          // later cache hit / share-link restore shows the restyled art — only for
          // a game this viewer owns (a visitor must not rewrite someone else's art).
          // Fire-and-forget: a cache failure must never affect the running game.
          if (!base.autoSaveExempt || base.savedGameId) {
            updateGameArt(base.gameId, {
              config: mergedParams,
              preloadedImages: mergedImages,
              assetMeta: mergedParams.assetMeta
            });
          }
          const summary = keptOld.length
            ? `${edit.summary} — kept the previous ${keptOld.join(', ')} (new version failed quality checks)`
            : edit.summary;
          return { applied: true, summary };
        } catch (err) {
          // No remount follows a failed restyle, so nothing would ever close this
          // run — drop it rather than let an unrelated later boot adopt it.
          metrics.cancelRun();
          if (token.cancelled || err?.cancelled) return { applied: false, summary: 'Edit cancelled — your game was kept.' };
          console.error('[App.jsx] Restyle failed:', err);
          return { applied: false, summary: err.message };
        } finally {
          endEdit(token);
        }
      }
      // intent === 'regenerate' (or restyle with no retained images) → full pipeline below
    }

    const token = beginEdit();
    setIsMenuOpen(false);
    setIsQuickEditOpen(false); // let the regen progress overlay be seen (the game stays paused: regenState)
    setRegenState({ progress: 3, logs: [`[EDITOR] New world required for "${raw}" — regenerating...`] });
    metrics.beginRun('generate', { via: 'creator-panel', promptChars: raw.length });

    try {
      console.log('[App.jsx] Calling generateGameConfig...');
      // The running game's MODE is kept: the editor never switches modes, and a
      // keyword like "enemies" must not turn a runner into a platformer.
      const result = await generateGameConfig(raw, (logText, progressVal) => {
        console.log(`[App.jsx Config Progress] ${progressVal}% - ${logText}`);
        // Config is the fast local phase — cap it so asset progress (73+) takes over
        pushProgress(logText, Math.min(progressVal ?? 0, 70));
      }, { mode: hasStarted ? (MODE_FOR_TYPE[liveParams.gameType] || null) : null });
      const updatedConfig = result.config;
      metrics.mark('config');
      metrics.annotate({ gameType: updatedConfig.gameType });

      const gen = await generateOrRestoreAssets({
        config: updatedConfig,
        userPrompt: raw,
        promptKey: makePromptKey(raw, updatedConfig.gameType),
        cancelToken: token,
        onProgress: (logText, progressVal) => {
          console.log(`[App.jsx Asset Progress] ${progressVal}% - ${logText}`);
          pushProgress(logText, progressVal);
        }
      });
      if (token.cancelled) {
        metrics.cancelRun();
        return { applied: false, summary: 'Edit cancelled — your game was kept.' };
      }

      // The Creator Panel/Quick Edit must never swap a running game for a built-in
      // world after a failed redraw — keep the game and say why.
      if (gen.staticBoot) {
        const why = (gen.config?.staticNotice || 'AI art could not be generated.').replace(/\s*Playing the built-in.*$/, '');
        throw new Error(`${why} Your current game was kept.`);
      }

      pushProgress('[ENGINE] World gate synchronized! Starting game...', 100);

      // Apply — force fresh Phaser instance
      setGameKey(k => k + 1);
      setPresetKey('custom');
      setLiveParams(withNewGame({ ...gen.config, preloadedImages: gen.preloadedImages, assetMeta: gen.assetMeta }));
      setIsGameOver(false);
      setGameOverData(null);
    } catch (err) {
      metrics.cancelRun(); // no boot follows a failed regeneration
      if (token.cancelled || err?.cancelled) return { applied: false, summary: 'Edit cancelled — your game was kept.' };
      console.error('[App.jsx] Prompt generation failed:', err);
      const message = err.cacheOnlyMiss
        ? 'Cache only is ON and nothing cached matches this prompt. Turn the toggle off on the generator screen (top right) to create new art.'
        : err.needsFallbackChoice ? `${err.fallbackReason} Your current game was kept.` : err.message;
      window.dispatchEvent(new CustomEvent('playmint-error', { detail: { message } }));
      throw err;
    } finally {
      endEdit(token);
    }
  };

  // One in-flight edit at a time. Starting one also stops a background player
  // repair: its result would otherwise land on top of the edited game.
  function beginEdit() {
    editTokenRef.current?.cancel();
    repairTokenRef.current?.cancel();
    const token = createCancelToken();
    editTokenRef.current = token;
    return token;
  }
  function endEdit(token) {
    if (editTokenRef.current !== token) return; // cancelled, or a newer edit owns the overlay
    editTokenRef.current = null;
    setRegenState(null);
  }
  // Cancel button on the progress overlay: the result is dropped when it lands
  // (the pipeline also stops at its next checkpoint), and the game resumes NOW.
  const cancelEdit = () => {
    const token = editTokenRef.current;
    if (!token) return;
    token.cancel();
    editTokenRef.current = null;
    setRegenState(null);
  };

  return (
    <div ref={fullscreenContainerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden' }}>

      {/* In-place world regeneration progress (Creator Panel prompt) */}
      <RegenOverlay state={regenState} onCancel={cancelEdit} />

      {/* Game view rendered if started OR if transitioning */}
      {(hasStarted || isTransitioning) && (
        <>
          {/* Main Game Container - Rendered at zIndex: 0 */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 0, overflow: 'hidden' }}>
            <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
              <GameComponent key={gameKey} isFullscreen={isFullscreen} />
            </div>
          </div>

          {/* Premium UI Overlay Layer - Rendered at zIndex: 1 */}
          <div style={{
            position: 'absolute',
            inset: 0,
            height: '100%',
            width: '100%',
            opacity: 1,
            zIndex: 1,
            pointerEvents: 'none'
          }}>
            <HudHeader
              liveParams={liveParams}
              score={score}
              isFullscreen={isFullscreen}
              isFullscreenSupported={isFullscreenSupported}
              onFullscreen={handleFullscreen}
              onExitFullscreen={handleExitFullscreen}
              onMenuOpen={() => setIsMenuOpen(true)}
              onEditPrompt={() => setIsQuickEditOpen(true)}
              onLogoClick={handleGoHome}
              onMyGames={handleGoMyGames}
              onSave={requestSave}
              saveState={saveState}
              canSave={authStatus !== 'disabled' && isViewerOwner}
              playerAnimState={repairState === 'done' ? null : repairState}
            />

            {captureMode && (
              <button
                className="pm-capture-exit"
                onClick={exitCaptureMode}
                title="Leave capture mode (Esc)"
                aria-label="Leave capture mode"
              >
                ✕ exit capture
              </button>
            )}

            {/* Native fullscreen refused (iOS Safari). Non-blocking pointer-events
                so the game stays playable while the note is up. */}
            {fullscreenHint && (
              <div className="pm-fs-hint" role="status" onPointerDown={(e) => e.stopPropagation()}>
                <span>
                  This browser won&rsquo;t go fullscreen here. Rotate to landscape, or
                  add PlayMint to your Home Screen for a fullscreen game.
                </span>
                <button
                  className="pm-fs-hint__close"
                  onClick={() => setFullscreenHint(false)}
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}

            <CreatorPanel
              isOpen={isMenuOpen}
              onClose={() => {
                if (document.activeElement && typeof document.activeElement.blur === 'function') {
                  document.activeElement.blur();
                }
                setIsMenuOpen(false);
              }}
              onOpenSelector={handleOpenSelector}
              liveParams={liveParams}
              setLiveParams={setLiveParams}
              presetKey={presetKey}
              setPresetKey={setPresetKey}
              onSliderChange={handleSliderChange}
              onPromptGenerate={handlePromptGenerate}
              onHomeClick={handleGoHome}
              onSave={requestSave}
              saveState={saveState}
              canSave={authStatus !== 'disabled' && isViewerOwner}
              isOwner={isViewerOwner}
              onRemix={canRemix ? () => handleRemix(liveParams) : null}
            />

            {/* Premium Virtual Mobile Controls Overlay */}
            {isTouchDevice && hasStarted && !isGameOver && (
              <MobileControls
                gameType={liveParams.gameType}
                themeKey={liveParams.themeKey}
                projectilesEnabled={!!liveParams.actionProjectileEnabled}
                manualAim={!!liveParams.shooterManualAim}
              />
            )}

            {!isTouchDevice && liveParams.gameType === 'runner' && (
              <div className="pm-keyboard-hint" style={{ position: 'fixed', bottom: '30px', width: '100%', textAlign: 'center', zIndex: 10, pointerEvents: 'none' }}>
                <p style={{ margin: 0, color: 'var(--pm-text-secondary)', fontSize: '14px', background: 'var(--pm-bg-panel)', padding: '8px 16px', display: 'inline-block', borderRadius: '20px', border: '1px solid var(--pm-border)', boxShadow: 'var(--pm-shadow-panel)' }}>
                  Press <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-teal)', fontFamily: 'monospace', fontWeight: 'bold' }}>SPACE</span> to jump
                </p>
              </div>
            )}

            {!isTouchDevice && liveParams.gameType === 'platformer' && (
              <div className="pm-keyboard-hint" style={{ position: 'fixed', bottom: '30px', width: '100%', textAlign: 'center', zIndex: 10, pointerEvents: 'none' }}>
                <p style={{ margin: 0, color: 'var(--pm-text-secondary)', fontSize: '14px', background: 'var(--pm-bg-panel)', padding: '8px 16px', display: 'inline-block', borderRadius: '20px', border: '1px solid var(--pm-border)', boxShadow: 'var(--pm-shadow-panel)' }}>
                  <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-teal)', fontFamily: 'monospace', fontWeight: 'bold' }}>WASD / Arrows</span> Move · <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-teal)', fontFamily: 'monospace', fontWeight: 'bold' }}>SPACE</span> Jump · <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-purple)', fontFamily: 'monospace', fontWeight: 'bold' }}>E</span> Melee{liveParams.actionProjectileEnabled ? <> · <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-orange)', fontFamily: 'monospace', fontWeight: 'bold' }}>F</span> Shoot</> : ''}
                </p>
              </div>
            )}

            {!isTouchDevice && liveParams.gameType === 'shooter' && (
              <div className="pm-keyboard-hint" style={{ position: 'fixed', bottom: '30px', width: '100%', textAlign: 'center', zIndex: 10, pointerEvents: 'none' }}>
                <p style={{ margin: 0, color: 'var(--pm-text-secondary)', fontSize: '14px', background: 'var(--pm-bg-panel)', padding: '8px 16px', display: 'inline-block', borderRadius: '20px', border: '1px solid var(--pm-border)', boxShadow: 'var(--pm-shadow-panel)' }}>
                  {liveParams.shooterManualAim ? (
                    <>
                      <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-teal)', fontFamily: 'monospace', fontWeight: 'bold' }}>WASD / Arrows</span> Move · Mouse Aim · <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-orange)', fontFamily: 'monospace', fontWeight: 'bold' }}>F</span> / Click Fire
                    </>
                  ) : (
                    <>
                      <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-teal)', fontFamily: 'monospace', fontWeight: 'bold' }}>WASD / Arrows</span> Move · <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-orange)', fontFamily: 'monospace', fontWeight: 'bold' }}>F</span> / Click Fire (hold to keep firing) · aim assist
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Overlays rendered directly in App to avoid mobile Safari pointer-events and rotation clipping bugs */}
      {isGameOver && gameOverData && (
        <GameOverOverlay
          isWin={gameOverData.isWin}
          score={gameOverData.score}
          themeKey={gameOverData.themeKey}
          gameType={gameOverData.gameType}
          onRestart={handleRestartGame}
          onTweakSettings={handleTweakSettings}
          onMainMenu={handleGoHome}
          onRemix={canRemix ? () => handleRemix(liveParams) : null}
        />
      )}
      <GameSelectorModal
        isOpen={isSelectorOpen}
        presetKey={presetKey}
        onSelectPreset={applyPreset}
        onClose={() => {
          if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
          }
          setIsSelectorOpen(false);
        }}
      />

      {/* Routes. The ROUTE is authoritative — it is never gated on the
          transition flag. `isTransitioning` only ever meant "ScreenZero is
          booting a game", and gating the route pages on it made a stranded
          flag render neither the grid nor a way out. `!hasStarted` is the real
          "a game owns the screen" condition and both branches already use it. */}
      {!hasStarted && route.name === 'my-games' && <MyGamesPage />}
      {!hasStarted && route.name === 'game' && (
        <PublicGamePage
          gameId={route.params.id}
          onPlay={handlePlayPublicGame}
          onRemix={handleRemix}
        />
      )}
      {!hasStarted && route.name === 'not-found' && (
        <RouteStubPage kind="not-found" />
      )}

      {/* ScreenZero rendered if NOT started and NOT on another route */}
      {!hasStarted && route.name === 'home' && (
        <ScreenZero
          onMyGames={handleGoMyGames}
          currentConfig={liveParams}
          onStartTransition={(config) => {
            setGameKey(k => k + 1);
            setIsTransitioning(true);
            setLiveParams(withNewGame(config));
          }}
          onCompleteTransition={() => {
            setHasStarted(true);
            setIsTransitioning(false);
            window.__GAME_IS_TRANSITIONING = false;
            window.dispatchEvent(new CustomEvent('transition-complete'));
          }}
          isTransitioning={isTransitioning}
        />
      )}

      {isPromptOpen && (
        <ScreenZero
          onMyGames={handleGoMyGames}
          onGenerate={handleOverlayGenerate}
          onClose={() => setIsPromptOpen(false)}
          isOverlay
          currentConfig={liveParams}
        />
      )}

      {/* Sign-in dialog + auth toast. MUST stay inside the fullscreen container
          (anything outside the fullscreen element is invisible in fullscreen). */}
      <AuthDialog />

      {/* Quick edit (HUD magic-wand button): a one-field prompt box over the
          running game that reuses handlePromptGenerate directly — identical
          tweak/restyle/regenerate semantics as the Creator Panel's prompt box.
          MUST stay inside the fullscreen container for the same reason as
          AuthDialog above. */}
      <QuickEditOverlay
        isOpen={isQuickEditOpen}
        onSubmit={handlePromptGenerate}
        onClose={() => setIsQuickEditOpen(false)}
      />

      {hasStarted && liveParams?.staticNotice && dismissedNotice !== liveParams.saveRunId && (
        <div
          role="status"
          data-pm-modal
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', top: 'max(64px, calc(env(safe-area-inset-top) + 56px))', left: '50%', transform: 'translateX(-50%)',
            zIndex: 11500, width: 'min(92vw, 520px)', boxSizing: 'border-box',
            background: 'rgba(10, 16, 24, 0.94)', border: '1px solid var(--pm-accent-orange)', borderRadius: '12px',
            padding: '10px 14px', color: '#fff', fontSize: '13px', lineHeight: 1.4,
            display: 'flex', gap: '10px', alignItems: 'flex-start'
          }}
        >
          <span style={{ flex: 1 }}>{liveParams.staticNotice}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setDismissedNotice(liveParams.saveRunId)}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', lineHeight: 1, cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {activeError && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 99999, backdropFilter: 'blur(12px)',
          pointerEvents: 'auto'
        }}>
          <div style={{
            background: 'var(--pm-bg-dark, #060a10)',
            border: '2px solid #ff453a',
            borderRadius: '16px',
            padding: '24px',
            width: '90%',
            maxWidth: '500px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5), 0 0 30px rgba(255, 69, 58, 0.15)',
            textAlign: 'left',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>⚠️</span>
              <h3 style={{ margin: 0, color: '#ff453a', fontFamily: 'var(--font-heading, sans-serif)', fontSize: '18px', fontWeight: '800', letterSpacing: '0.5px' }}>
                RUNTIME ERROR DETECTED
              </h3>
            </div>
            
            <p style={{ margin: 0, color: 'var(--pm-text-secondary, #8e9cae)', fontSize: '13px', lineHeight: '1.4' }}>
              An error occurred during world compilation or asset loading. You can copy the diagnostic details below to share:
            </p>

            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              padding: '14px',
              maxHeight: '180px',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '12px',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              color: '#ff453a'
            }}>
              {activeError}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(activeError);
                  alert('Error details copied to clipboard!');
                }}
                style={{
                  flex: 1,
                  background: '#ff453a',
                  border: 'none',
                  color: '#fff',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = '#ff3b30'}
                onMouseLeave={(e) => e.target.style.background = '#ff453a'}
              >
                Copy Details
              </button>
              
              <button
                onClick={() => setActiveError(null)}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.15)'}
                onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.08)'}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
