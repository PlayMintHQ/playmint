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
import { encodeShareConfig, decodeShareConfig, hydrateAssetMetaLite } from './game/shareLink';
import { generateTitle } from './game/promptUtils';
import { interpretEditPrompt, resolveAssetTargets } from './game/gameEditor';
import GameOverOverlay from './components/GameOverOverlay';
import RegenOverlay from './components/RegenOverlay';
import MobileControls from './components/MobileControls';
import * as metrics from './game/metrics';
import AuthDialog from './auth/AuthDialog';
import { useAuth } from './auth/authContext';
import { useRoute, navigate } from './router';
import { MyGamesPage, RouteStubPage } from './components/MyGamesPage';
import { saveGame, attachThumbnail } from './game/savedGames';
import { captureGameFrameWhenReady } from './game/frameCapture';

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
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [score, setScore] = useState(0);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameOverData, setGameOverData] = useState(null);
  const [gameKey, setGameKey] = useState(0);
  const [activeError, setActiveError] = useState(null);
  const [captureMode, setCaptureMode] = useState(readCaptureMode);

  // Accounts + routes (2026-09-19). `route` only matters while no game is
  // running: /my-games and the reserved /g/:id replace ScreenZero. The sign-in
  // dialog pauses the game exactly like the Creator Panel does.
  const route = useRoute();
  const { dialog: authDialog, status: authStatus, requireAuth } = useAuth();
  const isSignInOpen = !!authDialog;

  // Saved games (2026-09-27, contract §2B). 'idle' | 'saving' | 'saved' | 'error'
  // drives the Save button in the HUD and in the Creator Panel; one action, two
  // entry points, so a slider tweak is saved the same way however it is reached.
  const [saveState, setSaveState] = useState('idle');
  // gameIds already auto-saved this session. Auto-save fires ONCE per game; the
  // Save button is the update path from then on ("tweaks update the saved config
  // when the user chooses Save").
  const autoSavedRef = useRef(new Set());
  // The captured in-game frame, keyed by the per-boot identity. This is the
  // My Games card art: an actual frame of the running game, not a reconstruction
  // from its assets and never a bare colour (game/frameCapture.js).
  const frameRef = useRef(null);
  // Player-animation repair (one attempt per game) + its cancel token, so
  // starting another game or unmounting stops an in-flight redraw.
  const repairAttemptedRef = useRef(false);
  const repairTokenRef = useRef(null);
  const [repairState, setRepairState] = useState(null);

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

  // Persist environment variables to localStorage on startup to prevent cached/stale build variables
  useEffect(() => {
    const geminiEnv = import.meta.env.VITE_GEMINI_API_KEY;
    if (geminiEnv) {
      localStorage.setItem('GEMINI_API_KEY', geminiEnv);
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
  const shouldPause = isMenuOpen || isSignInOpen;
  useEffect(() => {
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
    setLiveParams(withRunId(customConfig));
    setHasStarted(true);
    setIsPromptOpen(false);
    setIsGameOver(false);
    setGameOverData(null);
  };

  const handleOverlayGenerate = (key, customConfig) => {
    setPresetKey(key);
    setGameKey(k => k + 1);
    setLiveParams(withRunId(customConfig));
    setIsPromptOpen(false);
    setIsGameOver(false);
    setGameOverData(null);
  };

  const handleReopenPrompt = () => {
    setIsPromptOpen(true);
    setIsMenuOpen(false);
  };

  // Automatically blur active input element when the game starts, config updates, or game restarts
  // to ensure keyboard focus shifts back to the game/body.
  useEffect(() => {
    const active = document.activeElement;
    // Never steal focus from the sign-in dialog / account menu (on iOS a blur
    // also dismisses the keyboard mid-typing).
    if (active && active.closest?.('[data-pm-modal]')) return;
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
    setIsPromptOpen(false);
    setIsGameOver(false);
    setGameOverData(null);
    setIsTransitioning(false);
  };

  const handleGoHome = () => {
    leaveRunningGame();
    // Leaving the game: drop the share hash so a reload lands on ScreenZero.
    // Pinned to '/' (not the current pathname) now that the app has routes.
    navigate('/', { replace: true });
  };

  // Account menu → My Games while a game is running: leave the game first.
  const handleGoMyGames = () => {
    leaveRunningGame();
    navigate('/my-games');
  };

  // ── Saved games (contract §2B, 2026-09-27) ─────────────────────────────────
  // ONE action behind both Save buttons (HUD + Creator Panel), so a slider tweak
  // is saved the same way however the user reaches it. liveParams is read through
  // a ref rather than the closure: these handlers are passed to memo-free
  // children and must always see the CURRENT run, not the render they were
  // created in.
  const liveParamsRef = useRef(liveParams);
  liveParamsRef.current = liveParams;

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
    if (authStatus !== 'authed') return;
    const current = liveParamsRef.current;
    if (!current || current.autoSaveExempt) return;
    // Dedup key is the ROW target when there is one, else the art id, else the
    // per-boot token. A static-art boot has neither id, and a name+prompt STRING
    // collided: two different static games from the same prompt (a re-roll with a
    // different title, or a second run) shared one key, so the second silently
    // never auto-saved. `saveRunId` is unique per config object, so it can only
    // ever suppress a genuine repeat of the SAME game.
    const dedupKey = current.savedGameId || current.gameId || current.saveRunId;
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
  }, [liveParams.gameId, liveParams.savedGameId, liveParams.autoSaveExempt, liveParams.saveRunId, authStatus]);

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
  useEffect(() => {
    const params = liveParamsRef.current;
    if (!params || !hasStarted) return;
    // One attempt per GAME, keyed by the per-boot identity rather than a bare
    // boolean: a boolean reset effect runs in the same commit as this one (and
    // would clear a guard this effect had just set), while a keyed check
    // self-invalidates the moment a genuinely new game boots.
    const gameKeyForRepair = params.saveRunId;
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
          maxImageCalls: 4
        });
        if (token.cancelled) return;
        const newMeta = res?.meta || {};
        const newImages = res?.preloadedImages || {};
        // The sheet result is stored under the `player` key. Without frames the
        // gates rejected it again, so there is nothing to swap in and the static
        // player (with its honest note) stays.
        if (!newMeta.player?.frames || !newImages.player) {
          setRepairState('failed');
          console.warn('[PlayerRepair] the redraw did not produce an animated sheet; keeping the static player.');
          return;
        }
        const mergedImages = { ...(params.preloadedImages || {}), player: newImages.player };
        const mergedParams = {
          ...params,
          preloadedImages: mergedImages,
          assetMeta: {
            ...(params.assetMeta || {}),
            slots: {
              ...(params.assetMeta?.slots || {}),
              player: { ...newMeta.player, source: 'generated' }
            },
            // The repair's spend is part of THIS game's cost, or the report
            // under-counts a game that quietly cost twice.
            cost: mergeRepairCost(params.assetMeta?.cost, res.cost),
            run: { ...(params.assetMeta?.run || {}), repairedPlayerAnim: true }
          }
        };
        setRepairState('done');
        setGameKey(k => k + 1);
        setLiveParams(mergedParams);
        if (mergedParams.gameId) {
          // Persist under the same cache entry so a later hit/share-link shows
          // the animated player. Fire-and-forget.
          updateGameArt(mergedParams.gameId, {
            config: mergedParams,
            preloadedImages: mergedImages,
            assetMeta: mergedParams.assetMeta
          });
        }
        console.log(`[PlayerRepair] animated player installed in ${Math.round(performance.now() - t0)}ms`);
      } catch (err) {
        if (token.cancelled || err?.cancelled) return;
        setRepairState('failed');
        console.warn('[PlayerRepair] failed, keeping the static player:', err?.message || err);
      }
    }, 1200);
    return () => {
      clearTimeout(timer);
      token.cancel();
      repairTokenRef.current = null;
    };
  }, [hasStarted, liveParams.gameId, liveParams.saveRunId]);

  // A new game clears the visible repair state and cancels an in-flight redraw
  // belonging to the previous one. The one-shot guard does NOT need resetting —
  // it is keyed on saveRunId, so a new game simply does not match.
  useEffect(() => {
    repairTokenRef.current?.cancel();
    repairTokenRef.current = null;
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
      if (params?.saveRunId === runId && params?.savedGameId) {
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
        setIsMenuOpen(false);
        setRegenState({
          title: 'Updating Artwork',
          progress: 5,
          logs: [`[EDITOR] ${edit.summary || `Redrawing ${edit.assetTargets.join(', ')}`} (${slots.length} slot${slots.length > 1 ? 's' : ''})...`]
        });
        try {
          const restyleT0 = performance.now();
          metrics.beginRun('restyle', { tier: 'restyle', gameId: liveParams.gameId || null, slots });
          const { preloadedImages: newImages, meta: newMeta, cost: restyleCost } = await regenerateAssetSlots({
            config: liveParams,
            instruction: raw,
            slots,
            onProgress: (logText, progressVal) => pushProgress(logText, progressVal)
          });
          metrics.mark('assets-generated');
          metrics.annotate({ estUsd: restyleCost?.estUsd || 0 });
          pushProgress('[ENGINE] Artwork updated! Restarting world...', 100);
          const keptOld = Object.entries(newMeta)
            .filter(([slot, m]) => m.dropped && liveParams.preloadedImages[slot])
            .map(([slot]) => slot);
          const mergedImages = { ...liveParams.preloadedImages };
          const mergedMeta = { ...(liveParams.assetMeta?.slots || {}) };
          const redrawnSlots = [];
          for (const [slot, m] of Object.entries(newMeta)) {
            if (m.dropped) {
              // New version failed the quality gates — keep the old art if we had it
              if (mergedImages[slot]) continue;
              mergedMeta[slot] = m;
              continue;
            }
            mergedImages[slot] = newImages[slot];
            mergedMeta[slot] = { ...m, source: 'generated' };
            redrawnSlots.push(slot);
          }
          const mergedParams = {
            ...liveParams,
            ...edit.changes,
            preloadedImages: mergedImages,
            assetMeta: {
              ...(liveParams.assetMeta || {}),
              slots: mergedMeta,
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
          // later cache hit / share-link restore shows the restyled art.
          // Fire-and-forget: a cache failure must never affect the running game.
          updateGameArt(liveParams.gameId, {
            config: mergedParams,
            preloadedImages: mergedImages,
            assetMeta: mergedParams.assetMeta
          });
          const summary = keptOld.length
            ? `${edit.summary} — kept the previous ${keptOld.join(', ')} (new version failed quality checks)`
            : edit.summary;
          return { applied: true, summary };
        } catch (err) {
          console.error('[App.jsx] Restyle failed:', err);
          // No remount follows a failed restyle, so nothing would ever close this
          // run — drop it rather than let an unrelated later boot adopt it.
          metrics.cancelRun();
          return { applied: false, summary: err.message };
        } finally {
          setRegenState(null);
        }
      }
      // intent === 'regenerate' (or restyle with no retained images) → full pipeline below
    }

    setIsMenuOpen(false);
    setRegenState({ progress: 3, logs: [`[EDITOR] New world required for "${raw}" — regenerating...`] });
    metrics.beginRun('generate', { via: 'creator-panel', promptChars: raw.length });

    try {
      console.log('[App.jsx] Calling generateGameConfig...');
      const result = await generateGameConfig(raw, (logText, progressVal) => {
        console.log(`[App.jsx Config Progress] ${progressVal}% - ${logText}`);
        // Config is the fast local phase — cap it so asset progress (73+) takes over
        pushProgress(logText, Math.min(progressVal ?? 0, 70));
      });
      const updatedConfig = result.config;
      metrics.mark('config');
      metrics.annotate({ gameType: updatedConfig.gameType });

      const gen = await generateOrRestoreAssets({
        config: updatedConfig,
        userPrompt: raw,
        promptKey: makePromptKey(raw, updatedConfig.gameType),
        onProgress: (logText, progressVal) => {
          console.log(`[App.jsx Asset Progress] ${progressVal}% - ${logText}`);
          pushProgress(logText, progressVal);
        }
      });

      pushProgress('[ENGINE] World gate synchronized! Starting game...', 100);

      // Apply — force fresh Phaser instance
      setGameKey(k => k + 1);
      setPresetKey('custom');
      setLiveParams(withRunId({ ...gen.config, preloadedImages: gen.preloadedImages, assetMeta: gen.assetMeta }));
      setIsGameOver(false);
      setGameOverData(null);
    } catch (err) {
      console.error('[App.jsx] Prompt generation failed:', err);
      metrics.cancelRun(); // no boot follows a failed regeneration
      const message = err.cacheOnlyMiss
        ? 'Cache only is ON and nothing cached matches this prompt. Turn the toggle off on the generator screen (top right) to create new art.'
        : err.message;
      window.dispatchEvent(new CustomEvent('playmint-error', { detail: { message } }));
      throw err;
    } finally {
      setRegenState(null);
    }
  };

  return (
    <div ref={fullscreenContainerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden' }}>

      {/* In-place world regeneration progress (Creator Panel prompt) */}
      <RegenOverlay state={regenState} />

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
              onLogoClick={handleReopenPrompt}
              onMyGames={handleGoMyGames}
              onSave={requestSave}
              saveState={saveState}
              canSave={authStatus !== 'disabled'}
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
              canSave={authStatus !== 'disabled'}
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
      {!hasStarted && (route.name === 'game' || route.name === 'not-found') && (
        <RouteStubPage kind={route.name} />
      )}

      {/* ScreenZero rendered if NOT started and NOT on another route */}
      {!hasStarted && route.name === 'home' && (
        <ScreenZero
          onMyGames={handleGoMyGames}
          onStartTransition={(config) => {
            setGameKey(k => k + 1);
            setIsTransitioning(true);
            setLiveParams(withRunId(config));
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
