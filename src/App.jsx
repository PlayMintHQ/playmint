import React, { useState, useRef, useEffect } from 'react';
import GameComponent from './GameComponent';
import GameSelectorModal from './components/GameSelectorModal';
import HudHeader from './components/HudHeader';
import CreatorPanel from './components/CreatorPanel';
import ScreenZero from './components/ScreenZero';
import { GAME_PRESETS } from './gameConfig';
import { parsePromptKeywords, generateTitle } from './game/promptUtils';
import GameOverOverlay from './components/GameOverOverlay';
import MobileControls from './components/MobileControls';

const getInitialState = () => {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#config=')) {
      try {
        const encodedConfig = hash.replace('#config=', '');
        const decodedConfigString = atob(encodedConfig);
        const importedConfig = JSON.parse(decodedConfigString);
        if (typeof importedConfig === 'object' && importedConfig !== null && Object.keys(importedConfig).length > 0) {
          if (!importedConfig.gameName) importedConfig.gameName = 'PlayMint Core';
          return { presetKey: 'custom', liveParams: importedConfig, isImported: true };
        }
      } catch (error) {
        console.error('Failed to parse config from URL:', error);
      }
    }
  }
  return { presetKey: 'standard', liveParams: { ...GAME_PRESETS['standard'], gameName: 'PlayMint Core' }, isImported: false };
};

function App() {
  const [initialConfig] = useState(getInitialState);
  const [presetKey, setPresetKey] = useState(initialConfig.presetKey);
  const [liveParams, setLiveParams] = useState(initialConfig.liveParams);
  const [hasStarted, setHasStarted] = useState(initialConfig.isImported);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const fullscreenContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFullscreenSupported, setIsFullscreenSupported] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [score, setScore] = useState(0);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameOverData, setGameOverData] = useState(null);
  const [gameKey, setGameKey] = useState(0);

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
  // Stops keyboard event propagation if the target is an HTML input or textarea.
  // This guarantees Phaser never captures key events (preventing defaults) while typing.
  useEffect(() => {
    const handleCaptureKeyboard = (e) => {
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
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

  // Fullscreen API detection & listener
  useEffect(() => {
    const isSupported = document.fullscreenEnabled || 
                       document.webkitFullscreenEnabled || 
                       document.mozFullScreenEnabled || 
                       document.msFullscreenEnabled;
    setIsFullscreenSupported(!!isSupported);

    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Score listener from Phaser
  useEffect(() => {
    const handleScoreUpdate = (e) => setScore(e.detail);
    window.addEventListener('update-score', handleScoreUpdate);
    return () => window.removeEventListener('update-score', handleScoreUpdate);
  }, []);

  // Pause game when CreatorPanel menu is open
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('toggle-pause-game', { detail: { isPaused: isMenuOpen } }));
  }, [isMenuOpen]);

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
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const computeInsets = () => {
      const styles = getComputedStyle(root);
      const bottom = parseFloat(styles.getPropertyValue('--pm-safe-area-bottom')) || 0;
      const left = parseFloat(styles.getPropertyValue('--pm-safe-area-left')) || 0;
      const right = parseFloat(styles.getPropertyValue('--pm-safe-area-right')) || 0;
      const top = parseFloat(styles.getPropertyValue('--pm-safe-area-top')) || 0;
      window.__pmSafeAreaBottom = bottom;
      window.__pmSafeAreaLeft = left;
      window.__pmSafeAreaRight = right;
      window.__pmSafeAreaTop = top;
    };
    computeInsets();
    window.addEventListener('resize', computeInsets);
    window.addEventListener('orientationchange', computeInsets);
    return () => {
      window.removeEventListener('resize', computeInsets);
      window.removeEventListener('orientationchange', computeInsets);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('update-game-config', { detail: liveParams }));
  }, [liveParams]);

  // --- Handlers ---

  const handleFullscreen = () => {
    if (fullscreenContainerRef.current && !document.fullscreenElement) {
      if (fullscreenContainerRef.current.requestFullscreen) {
        fullscreenContainerRef.current.requestFullscreen().catch(err => {
          console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
      }
    }
  };

  const handleExitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
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
    const mode = key === 'action_quest' ? 'action_quest' : 'standard';

    setPresetKey(key);
    setLiveParams({ 
      ...GAME_PRESETS[key], 
      themeKey: 'ice',
      gameName: generateTitle("", mode, 'ice') 
    });
  };

  const handleOpenSelector = () => {
    setIsSelectorOpen(true);
    setIsMenuOpen(false);
  };

  const handleGenerate = (key, customConfig) => {
    setPresetKey(key);
    setGameKey(k => k + 1);
    setLiveParams(customConfig);
    setHasStarted(true);
    setIsPromptOpen(false);
  };

  const handleOverlayGenerate = (key, customConfig) => {
    setPresetKey(key);
    setGameKey(k => k + 1);
    setLiveParams(customConfig);
    setIsPromptOpen(false);
  };

  const handleReopenPrompt = () => {
    setIsPromptOpen(true);
    setIsMenuOpen(false);
  };

  // Automatically blur active input element when the game starts, config updates, or game restarts
  // to ensure keyboard focus shifts back to the game/body.
  useEffect(() => {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  }, [hasStarted, presetKey, liveParams, isGameOver]);

  const handleGoHome = () => {
    setHasStarted(false);
    setIsMenuOpen(false);
    setIsGameOver(false);
    setGameOverData(null);
  };

  const handlePromptGenerate = (promptText) => {
    // Synchronously blur active elements immediately before closing menu / updating config
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    const raw = promptText.trim();
    if (!raw) return;

    const result = parsePromptKeywords(raw);
    const currentGameType = liveParams.gameType;

    // No keywords matched — nothing to change
    if (result.keywordsMatched === 0) return;

    // Start from current liveParams to preserve game state and context
    const updatedConfig = { ...liveParams };

    // Apply theme change (if detected)
    if (result.themeKey) {
      updatedConfig.themeKey = result.themeKey;
    }

    // Apply difficulty cumulatively
    let diff = liveParams.difficulty || 5;
    if (result.modifiers.isHard) {
      diff = Math.min(diff + 2, 10);
    } else if (result.modifiers.isSlow) {
      diff = Math.max(diff - 2, 1);
    }
    updatedConfig.difficulty = diff;

    // Apply mode-specific physics & modifiers
    if (currentGameType === 'runner') {
      // Base values for runner mode (resets ONLY if mode or theme changes)
      const isModeChanging = result.mode && result.mode !== 'standard';
      const isThemeChanging = result.themeKey && result.themeKey !== liveParams.themeKey;
      if (isModeChanging || isThemeChanging) {
        updatedConfig.runSpeed = 200 + (diff * 40);
        updatedConfig.obstacleDelay = 2000 - (diff * 120);
        updatedConfig.gravity = 1800;
        updatedConfig.jumpForce = 750;
      }
      
      if (result.modifiers.highJump) {
        updatedConfig.jumpForce = (updatedConfig.jumpForce || 750) + 250;
      }
      if (result.modifiers.moreSpeed || result.modifiers.isFast) {
        updatedConfig.runSpeed = Math.min((updatedConfig.runSpeed || 400) + 200, 1000);
      }
      if (result.modifiers.lessSpeed || result.modifiers.isSlow) {
        updatedConfig.runSpeed = Math.max((updatedConfig.runSpeed || 400) - 200, 150);
      }
      if (result.modifiers.hardcore || result.modifiers.isHard) {
        updatedConfig.runSpeed = Math.min((updatedConfig.runSpeed || 850) + 150, 1000);
        updatedConfig.gravity = (updatedConfig.gravity || 1800) + 500;
        updatedConfig.obstacleDelay = Math.max((updatedConfig.obstacleDelay || 1200) - 400, 400);
      }
    } else if (currentGameType === 'platformer') {
      // Base values for platformer mode (resets ONLY if mode or theme changes)
      const isModeChanging = result.mode && result.mode !== 'action_quest';
      const isThemeChanging = result.themeKey && result.themeKey !== liveParams.themeKey;
      if (isModeChanging || isThemeChanging) {
        updatedConfig.actionEnemyCount = Math.floor(diff * 1.5);
        updatedConfig.actionJumpHeight = 400 + (diff * 30);
        updatedConfig.actionGravity = 1500;
        updatedConfig.actionWalkSpeed = 300;
      }
      
      if (result.modifiers.highJump) {
        updatedConfig.actionJumpHeight = (updatedConfig.actionJumpHeight || 550) + 200;
      }
      if (result.modifiers.moreSpeed || result.modifiers.isFast) {
        updatedConfig.actionWalkSpeed = (updatedConfig.actionWalkSpeed || 300) + 100;
      }
      if (result.modifiers.lessSpeed || result.modifiers.isSlow) {
        updatedConfig.actionEnemyCount = Math.max((updatedConfig.actionEnemyCount || 5) - 2, 0);
        updatedConfig.actionGravity = Math.max((updatedConfig.actionGravity || 1400) - 300, 500);
        updatedConfig.actionWalkSpeed = Math.max((updatedConfig.actionWalkSpeed || 300) - 80, 100);
      }
      if (result.modifiers.hardcore || result.modifiers.isHard) {
        updatedConfig.actionEnemyCount = (updatedConfig.actionEnemyCount || 5) + 4;
        updatedConfig.actionGravity = (updatedConfig.actionGravity || 1500) + 400;
      }
    }

    if (result.modifiers.isLowGravity) {
      if (currentGameType === 'runner') {
        updatedConfig.gravity = Math.max((updatedConfig.gravity || 1800) - 400, 400);
      } else {
        updatedConfig.actionGravity = Math.max((updatedConfig.actionGravity || 1500) - 300, 300);
      }
    }

    // Generate title from prompt based on current mode
    const currentMode = currentGameType === 'platformer' ? 'action_quest' : 'standard';
    updatedConfig.gameName = generateTitle(raw, currentMode, updatedConfig.themeKey);

    // Apply — force fresh Phaser instance
    setGameKey(k => k + 1);
    setPresetKey('custom');
    setLiveParams(updatedConfig);
    setIsMenuOpen(false);
  };

  return (
    <div ref={fullscreenContainerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden' }}>
      
      {/* Game view rendered if started OR if transitioning */}
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
            />

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
            />

            {/* Premium Virtual Mobile Controls Overlay */}
            {isTouchDevice && hasStarted && !isGameOver && (
              <MobileControls
                gameType={liveParams.gameType}
                themeKey={liveParams.themeKey}
                projectilesEnabled={!!liveParams.actionProjectileEnabled}
              />
            )}

            {!isTouchDevice && liveParams.gameType === 'runner' && (
              <div style={{ position: 'fixed', bottom: '30px', width: '100%', textAlign: 'center', zIndex: 10, pointerEvents: 'none' }}>
                <p style={{ margin: 0, color: 'var(--pm-text-secondary)', fontSize: '14px', background: 'var(--pm-bg-panel)', padding: '8px 16px', display: 'inline-block', borderRadius: '20px', border: '1px solid var(--pm-border)', boxShadow: 'var(--pm-shadow-panel)' }}>
                  Press <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-teal)', fontFamily: 'monospace', fontWeight: 'bold' }}>SPACE</span> to jump
                </p>
              </div>
            )}

            {!isTouchDevice && liveParams.gameType === 'platformer' && (
              <div style={{ position: 'fixed', bottom: '30px', width: '100%', textAlign: 'center', zIndex: 10, pointerEvents: 'none' }}>
                <p style={{ margin: 0, color: 'var(--pm-text-secondary)', fontSize: '14px', background: 'var(--pm-bg-panel)', padding: '8px 16px', display: 'inline-block', borderRadius: '20px', border: '1px solid var(--pm-border)', boxShadow: 'var(--pm-shadow-panel)' }}>
                  <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-teal)', fontFamily: 'monospace', fontWeight: 'bold' }}>WASD / Arrows</span> Move · <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-teal)', fontFamily: 'monospace', fontWeight: 'bold' }}>SPACE</span> Jump · <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-purple)', fontFamily: 'monospace', fontWeight: 'bold' }}>E</span> Melee{liveParams.actionProjectileEnabled ? <> · <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-orange)', fontFamily: 'monospace', fontWeight: 'bold' }}>F</span> Shoot</> : ''}
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

      {/* ScreenZero rendered if NOT started */}
      {!hasStarted && (
        <ScreenZero
          onStartTransition={(config) => {
            setGameKey(k => k + 1);
            setIsTransitioning(true);
            setLiveParams(config);
          }}
          onCompleteTransition={() => {
            setHasStarted(true);
            setIsTransitioning(false);
          }}
          isTransitioning={isTransitioning}
        />
      )}

      {isPromptOpen && (
        <ScreenZero
          onGenerate={handleOverlayGenerate}
          onClose={() => setIsPromptOpen(false)}
          isOverlay
          currentConfig={liveParams}
        />
      )}

    </div>
  );
}

export default App;
