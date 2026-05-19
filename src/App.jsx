import React, { useState, useRef, useEffect } from 'react';
import GameComponent from './GameComponent';
import GameSelectorModal from './components/GameSelectorModal';
import HudHeader from './components/HudHeader';
import CreatorPanel from './components/CreatorPanel';
import ScreenZero from './components/ScreenZero';
import { GAME_PRESETS } from './gameConfig';

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
  const fullscreenContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFullscreenSupported, setIsFullscreenSupported] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [score, setScore] = useState(0);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [gameKey, setGameKey] = useState(0);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Clean URL hash after importing config
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#config=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
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
    setPresetKey(key);
    setLiveParams(prev => ({ ...GAME_PRESETS[key], gameName: prev.gameName }));
  };

  const handleOpenSelector = () => {
    setIsSelectorOpen(true);
    setIsMenuOpen(false);
  };

  const handleGenerate = (key, customConfig) => {
    setPresetKey(key);
    setLiveParams(customConfig);
    setHasStarted(true);
    setIsPromptOpen(false);
  };

  const handleOverlayGenerate = (key, customConfig) => {
    setPresetKey(key);
    setLiveParams(customConfig);
    setIsPromptOpen(false);
  };

  const handleReopenPrompt = () => {
    setIsPromptOpen(true);
    setIsMenuOpen(false);
  };

  const handleGoHome = () => {
    setHasStarted(false);
    setIsMenuOpen(false);
  };

  const handlePromptGenerate = (promptText) => {
    const text = promptText.toLowerCase().trim();
    if (!text) return;

    let mode = 'random';
    let newConfig = {};
    let keywordsMatched = 0;
    let themeKey = 'default';

    // Detect Mode
    if (text.match(/(action|quest|fight|platformer|enemies|shoot|kill|combat)/)) {
      mode = 'action_quest';
      keywordsMatched++;
    } else if (text.match(/(run|dash|jump|runner|dodge|sprint)/)) {
      mode = 'standard';
      keywordsMatched++;
    }

    // Detect theme
    if (text.match(/(lava|volcano|molten|inferno|ash)/)) {
      themeKey = 'lava';
      keywordsMatched++;
    } else if (text.match(/(ice|snow|frost|glacier|winter)/)) {
      themeKey = 'ice';
      keywordsMatched++;
    } else if (text.match(/(forest|jungle|wood|trees|verdant)/)) {
      themeKey = 'forest';
      keywordsMatched++;
    }

    if (mode === 'random') {
      mode = Math.random() > 0.5 ? 'action_quest' : 'standard';
    }

    // Start with base preset
    newConfig = { ...GAME_PRESETS[mode] };
    newConfig.difficulty = 5;
    newConfig.themeKey = themeKey;

    const isFast = text.match(/(fast|speed|quick|rush)/);
    const isSlow = text.match(/(slow|easy|relax|chill)/);
    const isHard = text.match(/(hard|difficult|impossible|insane|chaos|crazy)/);
    const isLowGravity = text.match(/(moon|float|space|fly|low gravity|zero gravity)/);

    if (isSlow) { newConfig.difficulty = 2; keywordsMatched++; }
    if (isHard) { newConfig.difficulty = 9; keywordsMatched++; }

    // Apply difficulty scaling
    const diff = newConfig.difficulty;
    if (mode === 'standard') {
      newConfig.runSpeed = 200 + (diff * 40);
      newConfig.obstacleDelay = 2000 - (diff * 120);
    } else if (mode === 'action_quest') {
      newConfig.actionEnemyCount = Math.floor(diff * 1.5);
      newConfig.actionJumpHeight = 400 + (diff * 30);
    }

    if (isFast) {
      if (mode === 'standard') newConfig.runSpeed = 600;
      if (mode === 'action_quest') newConfig.actionJumpHeight = 800;
      keywordsMatched++;
    }
    if (isSlow) {
      if (mode === 'standard') { newConfig.runSpeed = 200; newConfig.gravity = 1200; }
      if (mode === 'action_quest') { newConfig.actionEnemyCount = 1; newConfig.actionGravity = 1000; }
    }
    if (isHard) {
      if (mode === 'standard') { newConfig.runSpeed = 800; newConfig.gravity = 2500; newConfig.obstacleDelay = 600; }
      if (mode === 'action_quest') { newConfig.actionEnemyCount = 12; newConfig.actionGravity = 2000; }
    }
    if (isLowGravity) {
      newConfig.gravity = 600;
      newConfig.actionGravity = 600;
      keywordsMatched++;
    }

    if (keywordsMatched === 0) {
      // Random fallback
      const randomMode = Math.random() > 0.5 ? 'action_quest' : 'standard';
      newConfig = { ...GAME_PRESETS[randomMode] };
      newConfig.difficulty = Math.floor(Math.random() * 10) + 1;
      const ndiff = newConfig.difficulty;
      if (randomMode === 'standard') {
        newConfig.runSpeed = 200 + (ndiff * 40);
        newConfig.obstacleDelay = 2000 - (ndiff * 120);
      } else {
        newConfig.actionEnemyCount = Math.floor(ndiff * 1.5);
        newConfig.actionJumpHeight = 400 + (ndiff * 30);
      }
      const themePool = ['forest', 'lava', 'ice', 'default'];
      newConfig.themeKey = themePool[Math.floor(Math.random() * themePool.length)];
    }

    // Generate an immersive title
    const raw = promptText.trim();
    if (raw.length > 4 && raw.length < 36) {
      newConfig.gameName = raw.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    } else {
      const themeWords = { lava: ['Ashfall', 'Molten', 'Cinder', 'Inferno', 'Ember'], ice: ['Glacier', 'Frost', 'Arctic', 'Snowfall', 'Permafrost'], forest: ['Verdant', 'Wildwood', 'Grove', 'Emerald', 'Fern'], default: ['Prime', 'Core', 'Nova', 'Omega', 'Apex'] };
      const modeWords = mode === 'action_quest' ? ['Quest', 'Runes', 'Raid', 'Path', 'Saga'] : ['Run', 'Sprint', 'Rush', 'Dash', 'Circuit'];
      const list = themeWords[themeKey] || themeWords.default;
      newConfig.gameName = `${list[Math.floor(Math.random() * list.length)]} ${modeWords[Math.floor(Math.random() * modeWords.length)]}`;
    }
    newConfig.gameType = mode === 'action_quest' ? 'platformer' : 'runner';

    setPresetKey('custom');
    setLiveParams(newConfig);
    setGameKey(k => k + 1);        // Force remount = full reload with new assets
    setIsMenuOpen(false);           // Close the side panel
  };

  return (
    <div ref={fullscreenContainerRef} style={{ position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden' }}>
      
      {!hasStarted ? (
        <ScreenZero onGenerate={handleGenerate} />
      ) : (
        <>
          <GameSelectorModal
            isOpen={isSelectorOpen}
            presetKey={presetKey}
            onSelectPreset={applyPreset}
            onClose={() => setIsSelectorOpen(false)}
          />

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
            onClose={() => setIsMenuOpen(false)}
            onOpenSelector={handleOpenSelector}
            liveParams={liveParams}
            setLiveParams={setLiveParams}
            presetKey={presetKey}
            setPresetKey={setPresetKey}
            onSliderChange={handleSliderChange}
            onPromptGenerate={handlePromptGenerate}
            onHomeClick={handleGoHome}
          />

          {/* Main Game Container */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <GameComponent key={gameKey} isFullscreen={isFullscreen} />
            </div>
          </div>

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
                <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-teal)', fontFamily: 'monospace', fontWeight: 'bold' }}>WASD</span> Move · <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-purple)', fontFamily: 'monospace', fontWeight: 'bold' }}>E</span> Melee{liveParams.actionProjectileEnabled ? <> · <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-orange)', fontFamily: 'monospace', fontWeight: 'bold' }}>F</span> Shoot</> : ''}
              </p>
            </div>
          )}

          {isPromptOpen && (
            <ScreenZero
              onGenerate={handleOverlayGenerate}
              onClose={() => setIsPromptOpen(false)}
              isOverlay
            />
          )}
        </>
      )}

    </div>
  );
}

export default App;
