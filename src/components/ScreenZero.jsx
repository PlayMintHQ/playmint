import React, { useState, useRef, useEffect } from 'react';
import { GAME_PRESETS } from '../gameConfig';
import { parsePromptKeywords, generateTitle } from '../game/promptUtils';

const BANNED_WORDS = ['fuck', 'shit', 'bitch', 'cunt', 'ass', 'dick', 'pussy', 'cock', 'nigger', 'faggot'];

const AVAILABLE_MODES = [
  { key: 'standard', label: 'Runner', desc: 'Fast-paced infinite progression runner. Avoid obstacles, collect crates.' },
  { key: 'action_quest', label: 'Action Quest', desc: 'Classic 2D platformer with melee slashing, projectile combat, and patrolling enemies.' },
];

const COMING_SOON_MODES = [
  { key: 'empire', label: 'Empire Builder', desc: 'Construct towers, gather crystals, and build your pixel galactic civilization.' },
  { key: 'rpg', label: 'RPG Adventure', desc: 'Grid pathfinding, loot chests, turn-based dialogue, and epic fantasy upgrades.' },
  { key: 'fighting', label: 'Fighting Arena', desc: 'Snappy retro dueling. Deliver perfect parries, sword sweeps, and final hits.' },
  { key: 'racing', label: 'Racing Rush', desc: 'Speed through scrolling highways, drift around turns, and top the leaderboards.' },
  { key: 'shooter', label: 'Shooter Arena', desc: 'Dodge bullet hell waves, fire plasma bursts, and survive boss arenas.' },
  { key: 'survival', label: 'Survival Mode', desc: 'Scavenge supplies in dark woods, build campfires, and outlast the night waves.' },
];

const ScreenZero = ({ onGenerate, onClose, isOverlay, onStartTransition, onCompleteTransition, isTransitioning }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [transitionPhase, setTransitionPhase] = useState('idle'); // idle | expanding | compiling | fading | done
  const [selectedMode, setSelectedMode] = useState(null); // null | 'standard' | 'action_quest'
  const [hoveredMode, setHoveredMode] = useState(null);
  const [activePreview, setActivePreview] = useState('standard');
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [progress, setProgress] = useState(0);
  const formRef = useRef(null);

  // Auto-cycle active preview if the user isn't hovering or selection-locked
  useEffect(() => {
    if (selectedMode || hoveredMode) {
      setActivePreview(hoveredMode || selectedMode);
      return;
    }

    const allKeys = ['standard', 'action_quest', 'empire', 'rpg', 'fighting'];
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % allKeys.length;
      setActivePreview(allKeys[idx]);
    }, 4500);

    return () => clearInterval(interval);
  }, [selectedMode, hoveredMode]);

  const getBackgroundStyle = (baseOpacity, depthScale, assetUrl) => {
    let scale = 1.0;
    let filter = 'none';
    let opacity = baseOpacity;

    if (transitionPhase === 'compiling') {
      scale = 1.0 + (depthScale * 0.05); // dynamic subtle depth scale zoom
      filter = 'blur(4px) saturate(1.2)';
    } else if (transitionPhase === 'fading') {
      scale = 1.35;
      filter = 'blur(12px) saturate(1.5)';
      opacity = 0;
    }

    return {
      position: 'fixed', inset: 0, zIndex: 0,
      backgroundImage: `url(${assetUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center 30%',
      imageRendering: 'pixelated',
      opacity,
      transform: `scale(${scale})`,
      filter,
      transition: 'all 2.0s cubic-bezier(0.25, 1, 0.5, 1)',
      pointerEvents: 'none'
    };
  };

  const handleGenerate = (e) => {
    if (e) e.preventDefault();
    processPrompt(prompt);
  };

  const handleQuickStart = () => {
    generateRandom("Quick start! Generated a default preset.");
  };

  const handleExampleClick = (exampleText) => {
    setPrompt(exampleText);
    processPrompt(exampleText);
  };

  const startCompilationSequence = (newConfig, promptText) => {
    if (isOverlay) {
      // Overlay mode: direct basic expand transition
      setIsGenerating(true);
      setTransitionPhase('expanding');
      setTimeout(() => {
        setTransitionPhase('done');
        onGenerate('custom', newConfig);
      }, 700);
      return;
    }

    // Fullscreen landing transition
    setIsGenerating(true);
    setTransitionPhase('compiling');
    onStartTransition(newConfig);

    const displayPrompt = promptText ? `"${promptText.substring(0, 32)}"` : "Quick Start Preset";
    const themeName = (newConfig.themeKey || 'default').toUpperCase();
    const modeName = newConfig.gameType === 'platformer' ? 'ACTION QUEST' : 'RUNNER';
    const difficulty = newConfig.difficulty || 5;

    const gravity = newConfig.gameType === 'platformer' 
      ? (newConfig.actionGravity || 1400) 
      : (newConfig.gravity || 1600);

    const speed = newConfig.gameType === 'platformer'
      ? `Jump: ${newConfig.actionJumpHeight || 550}px`
      : `Speed: ${newConfig.runSpeed || 400}px/s`;

    const addLog = (logText, progressVal, delay) => {
      setTimeout(() => {
        setTerminalLogs(prev => [...prev, logText]);
        setProgress(progressVal);
      }, delay);
    };

    addLog("[SYSTEM] Booting PlayMint Generative Engine v2.0...", 10, 0);
    addLog(`[PROMPT] Parsed input -> ${displayPrompt}`, 30, 450);
    addLog(`[THEME]  Mapping assets -> [${themeName} THEME, ${modeName}]`, 55, 900);
    addLog(`[PHYSIC] Gravity: ${gravity}m/s² · ${speed} · Diff: ${difficulty}/10`, 80, 1350);
    addLog("[ENGINE] Synchronizing WebGL canvas & establishing world gate...", 100, 1800);

    // Fade out ScreenZero
    setTimeout(() => {
      setTransitionPhase('fading');
    }, 2400);

    // Complete transition and clean up
    setTimeout(() => {
      setTransitionPhase('done');
      onCompleteTransition();
    }, 3400);
  };

  const processPrompt = (input) => {
    const text = input.toLowerCase().trim();

    const isUnsafe = BANNED_WORDS.some(word => text.includes(word));
    if (isUnsafe || text === '') {
      generateRandom();
      return;
    }

    const result = parsePromptKeywords(text);
    const mode = selectedMode || result.mode || (Math.random() > 0.5 ? 'action_quest' : 'standard');
    const themeKey = result.themeKey || 'default';
    const secondaryThemeKey = result.secondaryThemeKey || null;

    const newConfig = { ...GAME_PRESETS[mode] };
    newConfig.themeKey = themeKey;
    newConfig.secondaryThemeKey = secondaryThemeKey;

    const diff = result.modifiers.isHard ? 9 : result.modifiers.isSlow ? 2 : 5;
    newConfig.difficulty = diff;
    applyDifficulty(newConfig, mode);

    if (result.modifiers.isFast) {
      if (mode === 'standard') newConfig.runSpeed = 600;
      if (mode === 'action_quest') newConfig.actionJumpHeight = 800;
    }
    if (result.modifiers.isSlow) {
      if (mode === 'standard') { newConfig.runSpeed = 200; newConfig.gravity = 1200; }
      if (mode === 'action_quest') { newConfig.actionEnemyCount = 1; newConfig.actionGravity = 1000; }
    }
    if (result.modifiers.isHard) {
      if (mode === 'standard') { newConfig.runSpeed = 800; newConfig.gravity = 2500; newConfig.obstacleDelay = 600; }
      if (mode === 'action_quest') { newConfig.actionEnemyCount = 12; newConfig.actionGravity = 2000; }
    }
    if (result.modifiers.isLowGravity) {
      newConfig.gravity = 600;
      newConfig.actionGravity = 600;
    }

    if (result.keywordsMatched === 0) {
      generateRandom();
    } else {
      newConfig.gameName = generateTitle(input, mode, themeKey);
      startCompilationSequence(newConfig, input);
    }
  };

  const generateRandom = () => {
    const mode = Math.random() > 0.5 ? 'action_quest' : 'standard';
    const config = { ...GAME_PRESETS[mode] };
    config.difficulty = Math.floor(Math.random() * 10) + 1;
    
    applyDifficulty(config, mode);
    
    config.gameName = mode === 'action_quest' ? 'Random Quest' : 'Random Runner';
    const themePool = ['forest', 'lava', 'ice', 'city', 'space', 'default'];
    config.themeKey = themePool[Math.floor(Math.random() * themePool.length)];
    
    startCompilationSequence(config, "Random Preset");
  };

  const applyDifficulty = (config, mode) => {
    const diff = config.difficulty; // 1 to 10
    if (mode === 'standard') {
      config.runSpeed = 200 + (diff * 40); // 240 to 600
      config.obstacleDelay = 2000 - (diff * 120); // 1880 to 800
    } else if (mode === 'action_quest') {
      config.actionEnemyCount = Math.floor(diff * 1.5); // 1 to 15
      config.actionJumpHeight = 400 + (diff * 30);
    }
  };

  return (
    <div className="pm-screenzero-container" style={{
      position: 'absolute', inset: 0,
      zIndex: 9999,
      opacity: transitionPhase === 'fading' ? 0 : 1,
      transition: 'opacity 1.0s ease-in-out'
    }}>
      {/* Neon sweep scanline during compilation */}
      {(transitionPhase === 'compiling' || transitionPhase === 'fading') && (
        <div style={{
          position: 'absolute',
          left: 0,
          width: '100%',
          height: '6px',
          background: 'linear-gradient(to bottom, transparent, var(--pm-accent-teal), transparent)',
          boxShadow: '0 0 20px 4px var(--pm-accent-teal)',
          zIndex: 1000,
          pointerEvents: 'none',
          animation: 'scanlineSweep 2.5s infinite linear'
        }} />
      )}

      {/* Parallax layers */}
      <div style={getBackgroundStyle(0.85, 1, '/assets/themes/winter/bg-1.png')} className="parallax-layer" />
      <div style={getBackgroundStyle(1, 2, '/assets/themes/winter/bg-2.png')} className="parallax-layer" />
      <div style={getBackgroundStyle(1, 3, '/assets/themes/winter/bg-3.png')} className="parallax-layer" />
      
      {/* Dark gradient overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1,
        background: `
          linear-gradient(180deg, rgba(7,10,16,0.65) 0%, rgba(7,10,16,0.3) 40%, rgba(7,10,16,0.5) 75%, rgba(7,10,16,0.92) 100%)
        `
      }} />

      {/* Grid lines */}
      <svg style={{ position: 'fixed', inset: 0, zIndex: 2, width: '100%', height: '100%', opacity: 0.06 }}>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,229,153,0.5)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Close button for overlay */}
      {isOverlay && (
        <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 100 }}>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', fontSize: '14px',
              padding: '6px 14px', borderRadius: '8px', cursor: 'pointer',
              transition: 'all 0.2s', backdropFilter: 'blur(8px)'
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
            onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.08)'}
          >
            ✕ Close
          </button>
        </div>
      )}

      {/* Header Logo */}
      <div className="pm-header-container" style={{ zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none' }}>
        <img
          src="/assets/Logo_PlayMint_(transparent).png"
          alt="PlayMint"
          className="pm-header-logo"
        />
        <p className="pm-header-slogan" style={{
          margin: 0,
          fontFamily: 'var(--font-heading)',
          fontWeight: '700',
          color: 'var(--pm-text-secondary)',
          letterSpacing: '1px',
          opacity: 0.8,
          textTransform: 'uppercase'
        }}>
          From words to worlds
        </p>
      </div>

      {/* Main Content Grid */}
      <div className="pm-screenzero-grid" style={{
        width: '100%',
        maxWidth: '1200px',
        zIndex: 3,
        flex: 1,
        alignItems: 'stretch',
        boxSizing: 'border-box',
        marginBottom: '20px'
      }}>
        
        {/* ================= LEFT COLUMN: PLAYMINT THEATER ================= */}
        <div className="pm-theater" style={{
          background: 'rgba(10, 15, 24, 0.88)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '24px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.55), inset 0 0 24px rgba(0,229,153,0.02)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Neon scanline sweeps inside theater */}
          <div className="theater-screen" style={{
            flex: 1,
            background: '#04070c',
            border: '2px solid rgba(0,229,153,0.15)',
            boxShadow: 'inset 0 0 20px rgba(0,0,0,0.9)',
            borderRadius: '16px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            {/* Viewport scanlines overlay */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%)',
              backgroundSize: '100% 4px',
              zIndex: 10,
              pointerEvents: 'none'
            }} />
            
            {/* Interactive Preview Content */}
            {activePreview === 'standard' && (
              <div className="prev-runner" style={{ width: '100%', height: '100%', position: 'relative' }}>
                <div className="cityscape-scroll" />
                <div className="ground-scroll" />
                <div className="runner-sprite" />
                <div className="floating-obstacle" />
                <div className="preview-label">RUNNER MODE PREVIEW</div>
              </div>
            )}

            {activePreview === 'action_quest' && (
              <div className="prev-quest" style={{ width: '100%', height: '100%', position: 'relative' }}>
                <div className="forest-scroll" />
                <div className="quest-platform" style={{ left: '10%', bottom: '24%', width: '120px' }} />
                <div className="quest-platform" style={{ left: '45%', bottom: '45%', width: '100px' }} />
                <div className="quest-platform" style={{ right: '10%', bottom: '30%', width: '110px' }} />
                <div className="player-quest" />
                <div className="slash-spark" />
                <div className="enemy-slug" />
                <div className="laser-bolt" />
                <div className="preview-label">ACTION QUEST PREVIEW</div>
              </div>
            )}

            {activePreview === 'empire' && (
              <div className="prev-empire" style={{ width: '100%', height: '100%', position: 'relative' }}>
                <div className="grid-isometric" />
                <div className="tower tower-1" />
                <div className="tower tower-2" />
                <div className="construction-laser" />
                <div className="float-bubble text-teal">+100 Gold</div>
                <div className="float-bubble text-purple" style={{ animationDelay: '1.2s', left: '60%' }}>+50 Ore</div>
                <div className="preview-label">EMPIRE BUILDER (LOCKED)</div>
              </div>
            )}

            {activePreview === 'rpg' && (
              <div className="prev-rpg" style={{ width: '100%', height: '100%', position: 'relative' }}>
                <div className="rpg-grid" />
                
                {/* SVG Journey Paths */}
                <svg className="rpg-path-svg" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
                  <path d="M 20 75 L 40 55 L 60 65 L 80 40" fill="none" stroke="rgba(170, 102, 255, 0.2)" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M 20 75 L 40 55 L 60 65 L 80 40" fill="none" stroke="#aa66ff" strokeWidth="1.5" strokeDasharray="3 3" strokeLinecap="round" />
                </svg>

                {/* Overworld Nodes */}
                <div className="node node-1" style={{ left: '20%', bottom: '25%', zIndex: 2 }} />
                <div className="node node-2" style={{ left: '40%', bottom: '45%', zIndex: 2 }} />
                <div className="node node-3" style={{ left: '60%', bottom: '35%', zIndex: 2 }} />
                <div className="node node-4" style={{ left: '80%', bottom: '60%', zIndex: 2 }} />

                {/* Ambient Biome Decors / Entities */}
                <div className="rpg-enemy" style={{ zIndex: 2 }} />
                <div className="rpg-slash" style={{ zIndex: 3 }} />
                <div className="exp-float" style={{ zIndex: 4 }}>+50 EXP</div>
                
                <div className="rpg-chest" style={{ zIndex: 2 }} />
                <div className="chest-sparkle" style={{ zIndex: 3 }} />
                <div className="lvl-up" style={{ zIndex: 4 }}>LEVEL UP!</div>

                <div className="rpg-portal" style={{ zIndex: 2 }} />
                <div className="portal-ripple" style={{ zIndex: 3 }} />

                {/* Animated Hero Player */}
                <div className="rpg-player" style={{ zIndex: 5 }} />

                <div className="preview-label">RPG ADVENTURE (LOCKED)</div>
              </div>
            )}

            {activePreview === 'fighting' && (
              <div className="prev-fight" style={{ width: '100%', height: '100%', position: 'relative' }}>
                <div className="arena-bg" />
                <div className="fighter f-left" />
                <div className="fighter f-right" />
                <div className="clash-flash" />
                <div className="hit-spark" />
                <div className="fight-hud">
                  <div className="hp-bar hp-1" />
                  <div className="hp-bar hp-2" />
                </div>
                <div className="preview-label">FIGHTING ARENA (LOCKED)</div>
              </div>
            )}

            {activePreview === 'racing' && (
              <div className="prev-racing" style={{ width: '100%', height: '100%', position: 'relative' }}>
                <div className="highway-grid" />
                <div className="sports-car" />
                <div className="barrier-scrolling" />
                <div className="speed-lines" />
                <div className="preview-label">RACING RUSH (LOCKED)</div>
              </div>
            )}

            {activePreview === 'shooter' && (
              <div className="prev-shooter" style={{ width: '100%', height: '100%', position: 'relative' }}>
                <div className="nebula-bg" />
                <div className="starfighter" />
                <div className="bullet-wave" />
                <div className="boss-glow" />
                <div className="preview-label">SHOOTER ARENA (LOCKED)</div>
              </div>
            )}

            {activePreview === 'survival' && (
              <div className="prev-survival" style={{ width: '100%', height: '100%', position: 'relative' }}>
                <div className="camp-fire" />
                <div className="shadow-trees" />
                <div className="wolf-eyes" />
                <div className="survivor-sprite" />
                <div className="preview-label">SURVIVAL WORLD (LOCKED)</div>
              </div>
            )}
          </div>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--pm-text-tertiary)', letterSpacing: '1px', fontFamily: 'monospace' }}>PLAYMINT SCREEN DECK v2.0</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <span className="live-dot" />
              <span style={{ fontSize: '11px', color: 'var(--pm-accent-teal)', fontWeight: 'bold', fontFamily: 'monospace' }}>LIVE VIEWPORT</span>
            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: INTERACTIVE GENERATOR DECK ================= */}
        <div className="pm-deck" style={{
          boxSizing: 'border-box'
        }}>
          {/* Compiling Sequence overlay */}
          {(transitionPhase === 'compiling' || transitionPhase === 'fading') ? (
            <div style={{
              flex: 1,
              background: 'rgba(6, 10, 16, 0.92)',
              border: '1px solid var(--pm-accent-teal)',
              borderRadius: '24px',
              padding: '24px',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), 0 0 25px rgba(0, 229, 153, 0.15)',
              backdropFilter: 'blur(16px)',
              fontFamily: 'monospace',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              minHeight: '340px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff5f56' }} />
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ffbd2e' }} />
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#27c93f' }} />
                </div>
                <span style={{ color: 'var(--pm-text-tertiary)', fontSize: '10px', fontWeight: 'bold', letterSpacing: '1px' }}>PLAYMINT COMPILER v2.0</span>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {terminalLogs.map((log, i) => {
                  let color = '#fff';
                  if (log.startsWith('[SYSTEM]')) color = 'var(--pm-accent-teal)';
                  else if (log.startsWith('[PROMPT]')) color = 'var(--pm-accent-orange)';
                  else if (log.startsWith('[THEME]')) color = '#8A2BE2';
                  else if (log.startsWith('[PHYSIC]')) color = '#3182CE';
                  else if (log.startsWith('[ENGINE]')) color = 'var(--pm-accent-teal)';

                  return (
                    <div key={i} style={{
                      color,
                      fontSize: '12px',
                      lineHeight: '1.5',
                      textAlign: 'left',
                      fontFamily: 'monospace',
                      textShadow: `0 0 6px ${color}40`,
                      whiteSpace: 'pre-wrap'
                    }}>
                      {log}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--pm-text-secondary)' }}>
                  <span>Compiling World Matrix</span>
                  <span style={{ color: 'var(--pm-accent-teal)', fontWeight: 'bold' }}>{Math.round(progress)}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--pm-accent-teal), #8A2BE2)',
                    boxShadow: '0 0 8px var(--pm-accent-teal)',
                    borderRadius: '3px',
                    transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                  }} />
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Prompt generation form */}
              <div ref={formRef} className="pm-prompt-card" style={{
                background: 'rgba(10, 15, 24, 0.85)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '20px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                boxSizing: 'border-box'
              }}>
                <form onSubmit={handleGenerate} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  gap: '8px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '12px',
                  padding: '6px'
                }}>
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. 'city runner lava' or 'forest quest'"
                    style={{
                      padding: '10px 14px', fontSize: '14px', borderRadius: '8px',
                      backgroundColor: 'transparent', border: 'none', color: '#fff',
                      outline: 'none', width: '100%', boxSizing: 'border-box'
                    }}
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="pm-btn pm-btn-primary"
                    disabled={isGenerating}
                    style={{
                      padding: '8px 16px', fontSize: '12px', borderRadius: '8px',
                      fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s'
                    }}
                  >
                    Generate
                  </button>
                  <button
                    type="button"
                    onClick={handleQuickStart}
                    className="pm-btn pm-btn-outline"
                    disabled={isGenerating}
                    style={{
                      padding: '8px 12px', fontSize: '11px', borderRadius: '8px',
                      cursor: 'pointer', transition: 'all 0.2s', background: 'rgba(255,255,255,0.05)'
                    }}
                  >
                    Quick Start
                  </button>
                </form>

                {/* Suggested prompt chips */}
                <div className="pm-prompt-chips" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                  {['lava runner', 'ice quest', 'forest sprint', 'city runner lava', 'space quest'].map((example, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleExampleClick(example)}
                      style={{
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                        color: 'var(--pm-text-secondary)', padding: '4px 10px', borderRadius: '999px',
                        fontSize: '10px', cursor: 'pointer', transition: 'all 0.2s ease',
                        opacity: 0.8
                      }}
                      onMouseEnter={(e) => { e.target.style.background = 'rgba(255,255,255,0.1)'; e.target.style.color = '#fff'; e.target.style.opacity = '1'; }}
                      onMouseLeave={(e) => { e.target.style.background = 'rgba(255,255,255,0.04)'; e.target.style.color = 'var(--pm-text-secondary)'; e.target.style.opacity = '0.8'; }}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              {/* ================= VERTICAL MODE SELECTION DECK ================= */}
              <div className="pm-selection-card" style={{
                background: 'rgba(10, 15, 24, 0.85)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '24px',
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                boxSizing: 'border-box'
              }}>
                <h3 style={{
                  margin: '0 0 12px 0',
                  fontSize: '12px',
                  fontWeight: '700',
                  color: 'var(--pm-text-secondary)',
                  letterSpacing: '1px',
                  textTransform: 'uppercase'
                }}>
                  CHOOSE YOUR WORLD PROTOCOL
                </h3>
                
                {/* Scrollable vertical list */}
                <div className="vertical-scroll-deck" style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  paddingRight: '6px'
                }}>
                  {/* Active Playable Modes */}
                  {AVAILABLE_MODES.map((mode) => {
                    const isSelected = selectedMode === mode.key;
                    return (
                      <div
                        key={mode.key}
                        onMouseEnter={() => setHoveredMode(mode.key)}
                        onMouseLeave={() => setHoveredMode(null)}
                        onClick={() => setSelectedMode(isSelected ? null : mode.key)}
                        style={{
                          background: isSelected ? 'rgba(0, 229, 153, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                          border: isSelected ? '1px solid var(--pm-accent-teal)' : '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '14px',
                          padding: '12px 16px',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                          boxShadow: isSelected ? '0 0 15px rgba(0, 229, 153, 0.1)' : 'none'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', textAlign: 'left', maxWidth: '80%' }}>
                          <span style={{
                            color: isSelected ? 'var(--pm-accent-teal)' : '#fff',
                            fontWeight: '700',
                            fontSize: '14px'
                          }}>{mode.label}</span>
                          <span style={{ fontSize: '11px', color: 'var(--pm-text-secondary)', lineHeight: '1.4' }}>{mode.desc}</span>
                        </div>
                        <span style={{
                          fontSize: '9px',
                          fontWeight: '800',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: 'rgba(0, 229, 153, 0.15)',
                          color: 'var(--pm-accent-teal)',
                          border: '1px solid rgba(0, 229, 153, 0.25)'
                        }}>PLAYABLE</span>
                      </div>
                    );
                  })}

                  {/* Coming Soon Locked Modes */}
                  {COMING_SOON_MODES.map((mode) => (
                    <div
                      key={mode.key}
                      onMouseEnter={() => setHoveredMode(mode.key)}
                      onMouseLeave={() => setHoveredMode(null)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.01)',
                        border: '1px solid rgba(255, 255, 255, 0.04)',
                        borderRadius: '14px',
                        padding: '10px 16px',
                        opacity: 0.5,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'default',
                        transition: 'opacity 0.2s'
                      }}
                      onMouseEnter={() => {
                        setHoveredMode(mode.key);
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', textAlign: 'left', maxWidth: '80%' }}>
                        <span style={{ color: 'var(--pm-text-secondary)', fontWeight: '600', fontSize: '13px' }}>{mode.label}</span>
                        <span style={{ fontSize: '10px', color: 'var(--pm-text-tertiary)', lineHeight: '1.4' }}>{mode.desc}</span>
                      </div>
                      <span style={{
                        fontSize: '8px',
                        fontWeight: '700',
                        padding: '2px 6px',
                        borderRadius: '5px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: 'var(--pm-text-tertiary)',
                        border: '1px solid rgba(255,255,255,0.08)'
                      }}>LOCKED</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

      </div>

      {/* Retro preview theater keyframes and styling */}
      <style>{`
        @keyframes scanlineSweep {
          0% { top: -5%; }
          100% { top: 105%; }
        }

        .pm-screenzero-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          overflow-y: auto;
          overflow-x: hidden;
          padding: clamp(16px, 3vh, 48px) clamp(16px, 4vw, 24px);
          box-sizing: border-box;
        }
        
        .pm-header-container {
          margin-bottom: 24px;
          margin-top: 12px;
          transition: all 0.3s;
        }

        .pm-header-logo {
          height: 36px;
          margin-bottom: 6px;
          opacity: 0.95;
          transition: all 0.3s;
        }

        .pm-header-slogan {
          margin: 0;
          font-family: var(--font-heading);
          font-size: clamp(14px, 2.5vw, 18px);
          font-weight: 700;
          color: var(--pm-text-secondary);
          letter-spacing: 1px;
          opacity: 0.8;
          text-transform: uppercase;
        }

        .pm-screenzero-grid {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
          box-sizing: border-box;
        }

        .pm-theater {
          order: 2; /* Sits below controls on mobile */
          height: 200px;
          min-height: 200px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          box-sizing: border-box;
          transition: all 0.3s;
        }

        .pm-deck {
          order: 1; /* Sits at the top of page on mobile for instant thumb access */
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .pm-prompt-card {
          padding: 16px;
          transition: all 0.3s;
        }

        .pm-selection-card {
          padding: 20px;
          box-shadow: 0 12px 36px rgba(0,0,0,0.4);
          min-height: 260px;
          transition: all 0.3s;
        }

        .vertical-scroll-deck {
          max-height: 180px;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          transition: all 0.3s;
        }

        .preview-label {
          font-size: 8px !important;
          padding: 2px 6px !important;
        }

        @media (min-width: 768px) {
          .pm-screenzero-container {
            height: 100vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
          }
          .pm-screenzero-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 32px;
            flex: 1;
            min-height: 0;
            height: 0;
            overflow: hidden;
          }
          .pm-theater {
            order: 1; /* Sits on the left on desktop */
            height: 100%;
            min-height: 0;
            padding: 24px;
            overflow: hidden;
          }
          .pm-deck {
            order: 2; /* Sits on the right on desktop */
            height: 100%;
            min-height: 0;
            gap: 20px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          .pm-selection-card {
            flex: 1;
            min-height: 0;
            height: 0;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          .vertical-scroll-deck {
            flex: 1;
            min-height: 0;
            height: 100%;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            max-height: none;
          }
          .preview-label {
            font-size: 10px !important;
            padding: 3px 8px !important;
          }
        }

        /* Industry Standard Low-Height / Landscape Viewports Override */
        @media (max-height: 550px) {
          .pm-header-container {
            margin-bottom: 6px !important;
            margin-top: 2px !important;
          }
          .pm-header-logo {
            height: 20px !important;
            margin-bottom: 0px !important;
          }
          .pm-header-slogan {
            display: none !important;
          }
          .pm-screenzero-grid {
            gap: 12px !important;
            margin-bottom: 4px !important;
          }
          .pm-theater {
            min-height: 170px !important;
            height: auto !important;
            padding: 10px !important;
          }
          .theater-screen {
            min-height: 110px !important;
          }
          .pm-deck {
            gap: 12px !important;
          }
          .pm-prompt-card {
            padding: 8px 12px !important;
            border-radius: 12px !important;
          }
          .pm-prompt-card form {
            padding: 4px !important;
            border-radius: 8px !important;
            gap: 6px !important;
          }
          .pm-prompt-card input {
            padding: 6px 10px !important;
            font-size: 13px !important;
          }
          .pm-prompt-card button {
            padding: 6px 12px !important;
            font-size: 11px !important;
          }
          .pm-prompt-chips {
            margin-top: 6px !important;
            gap: 4px !important;
          }
          .pm-prompt-chips button {
            padding: 2px 8px !important;
            font-size: 9px !important;
          }
          .pm-selection-card {
            padding: 10px 16px !important;
            border-radius: 16px !important;
            min-height: auto !important;
          }
          .pm-selection-card h3 {
            font-size: 10px !important;
            margin-bottom: 6px !important;
          }
          .vertical-scroll-deck > div {
            padding: 6px 10px !important;
            border-radius: 8px !important;
          }
          .vertical-scroll-deck span {
            font-size: 11px !important;
          }
          .vertical-scroll-deck span[style*="lineHeight"] {
            display: none !important;
          }
        }

        /* Constrain selection list height on narrow low-height screens (stacked layouts) */
        @media (max-height: 550px) and (max-width: 767px) {
          .vertical-scroll-deck {
            max-height: 90px !important;
          }
        }

        .pm-screenzero-grid::-webkit-scrollbar {
          width: 4px;
        }

        .vertical-scroll-deck::-webkit-scrollbar {
          width: 5px;
        }
        .vertical-scroll-deck::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.01);
          border-radius: 4px;
        }
        .vertical-scroll-deck::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        .vertical-scroll-deck::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        /* Viewport Previews Styling */
        .preview-label {
          position: absolute;
          top: 10px;
          right: 10px;
          font-family: monospace;
          font-size: 10px;
          font-weight: bold;
          color: rgba(255,255,255,0.65);
          background: rgba(0,0,0,0.6);
          padding: 3px 8px;
          border-radius: 4px;
          border: 1px solid rgba(255,255,255,0.15);
          letter-spacing: 1px;
          z-index: 100;
        }

        .live-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--pm-accent-teal);
          box-shadow: 0 0 8px var(--pm-accent-teal);
          animation: dotBlink 1.5s infinite alternate;
        }

        @keyframes dotBlink {
          0% { opacity: 0.3; }
          100% { opacity: 1; }
        }

        /* 1. RUNNER ANIMATION EFFECTS */
        .ground-scroll {
          position: absolute;
          left: 0; bottom: 0; width: 200%; height: 24%;
          background: linear-gradient(180deg, #1f2d3d 0%, #0d1622 100%);
          border-top: 2px solid #00e599;
          box-sizing: border-box;
          animation: scrollBg 2.0s infinite linear;
        }
        .cityscape-scroll {
          position: absolute;
          left: 0; bottom: 24%; width: 200%; height: 50%;
          background: 
            linear-gradient(transparent 80%, #00e59920 100%),
            radial-gradient(circle at 100px 30px, #ff4b4b20 0%, transparent 60%);
          opacity: 0.45;
          animation: scrollBg 12.0s infinite linear;
        }
        .runner-sprite {
          position: absolute;
          left: 15%; bottom: 24%; width: 32px; height: 48px;
          background: #00e599;
          border-radius: 6px;
          box-shadow: 0 0 10px #00e59960;
          animation: runnerJump 6.0s infinite ease-in-out;
        }
        .floating-obstacle {
          position: absolute;
          width: 20px; height: 20px;
          background: #ff4b4b;
          border-radius: 4px;
          border: 1px solid #ff0000;
          box-shadow: 0 0 8px #ff4b4bb0;
          animation: scrollObstacle 6.0s infinite linear;
          left: 100%;
          bottom: 24%;
        }

        @keyframes scrollBg {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes runnerJump {
          0%, 16.6% { transform: translateY(0) rotate(0) scale(1) translateX(0); opacity: 1; }
          /* Jump 1: Clean */
          21.6% { transform: translateY(-45px) rotate(0) scale(1) translateX(0); }
          28.3% { transform: translateY(0) rotate(0) scale(1) translateX(0); }
          
          /* Jump 2: Clean Jump */
          50.0% { transform: translateY(0) rotate(0) scale(1) translateX(0); }
          55.0% { transform: translateY(-45px) rotate(0) scale(1) translateX(0); }
          61.6% { transform: translateY(0) rotate(0) scale(1) translateX(0); }
          
          /* Jump 3: Crash */
          83.3% { transform: translateY(0) rotate(0) scale(1) translateX(0); opacity: 1; }
          86.6% { transform: translateY(-20px) rotate(-15deg) scale(1) translateX(0); opacity: 1; } /* Collision point! */
          93.3% { transform: translateY(30px) rotate(-180deg) scale(0.6) translateX(-50px); opacity: 0; } /* Tumbles off */
          100% { transform: translateY(0) rotate(0) scale(1) translateX(0); opacity: 0; }
        }
        @keyframes scrollObstacle {
          /* Obstacle 1: Clean Jump */
          0%, 8.3% { left: 100%; transform: rotate(0) scale(1) translateY(0); opacity: 1; }
          21.6% { left: 15%; transform: rotate(0) scale(1) translateY(0); opacity: 1; }
          30.0% { left: -20%; transform: rotate(0) scale(1) translateY(0); opacity: 1; }
          
          /* Reset 1: Hide return trip */
          30.1% { left: -20%; opacity: 0; }
          34.9% { left: 100%; opacity: 0; }
          
          /* Obstacle 2: Clean Jump */
          35.0%, 41.6% { left: 100%; transform: rotate(0) scale(1) translateY(0); opacity: 1; }
          55.0% { left: 15%; transform: rotate(0) scale(1) translateY(0); opacity: 1; }
          63.3% { left: -20%; transform: rotate(0) scale(1) translateY(0); opacity: 1; }
          
          /* Reset 2: Hide return trip */
          63.4% { left: -20%; opacity: 0; }
          68.2% { left: 100%; opacity: 0; }
          
          /* Obstacle 3: Collision */
          68.3%, 75.0% { left: 100%; transform: rotate(0) scale(1) translateY(0); opacity: 1; }
          86.6% { left: 15%; transform: rotate(0) scale(1) translateY(0); opacity: 1; } /* Collision point! */
          93.3% { left: 8%; transform: rotate(45deg) scale(0.6) translateY(-15px); opacity: 0; } /* Tumbles off */
          
          /* Reset 3: Hide return trip */
          93.4% { left: 100%; transform: rotate(0) scale(1) translateY(0); opacity: 0; }
          100% { left: 100%; transform: rotate(0) scale(1) translateY(0); opacity: 0; }
        }

        /* 2. ACTION QUEST PREVIEW */
        .forest-scroll {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at bottom, #2d5a2740 0%, transparent 80%);
          opacity: 0.5;
        }
        .quest-platform {
          position: absolute;
          height: 12px;
          background: #2b1810;
          border-top: 3px solid #66cc66;
          border-radius: 4px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.5);
        }
        .player-quest {
          position: absolute;
          left: 15%; bottom: 26%; width: 20px; height: 32px;
          background: #66aaff;
          border-radius: 4px;
          box-shadow: 0 0 8px #66aaff70;
          animation: questWalk 6s infinite ease-in-out;
        }
        .slash-spark {
          position: absolute;
          width: 35px; height: 35px;
          background: radial-gradient(circle, #fff 0%, transparent 60%);
          border: 2px solid #00ffff;
          border-radius: 50%;
          opacity: 0;
          animation: meleeSlash 6s infinite ease-in-out;
          left: 54% !important;
          bottom: 50% !important;
        }
        .enemy-slug {
          position: absolute;
          width: 18px; height: 14px;
          background: #ff4444;
          border-radius: 12px 12px 0 0;
          animation: enemyWalk 6s infinite ease-in-out;
          left: 58% !important;
          bottom: 47% !important;
        }
        .laser-bolt {
          position: absolute;
          width: 12px; height: 4px;
          background: #00ffff;
          border-radius: 2px;
          box-shadow: 0 0 6px #00ffff;
          opacity: 0;
          animation: laserShoot 6s infinite linear;
          left: 52% !important;
          bottom: 51% !important;
        }

        @keyframes questWalk {
          0% { left: 15%; bottom: 26%; }
          10% { left: 18%; bottom: 26%; }
          16.6% { left: 20%; bottom: 26%; }
          21.6% { left: 32%; bottom: 58%; } /* Parabolic jump peak */
          26.6% { left: 44%; bottom: 47%; } /* Lands on platform 2 */
          36.6% { left: 48%; bottom: 47%; } /* Walks forward */
          41.6% { left: 48%; bottom: 47%; } /* Slashes! */
          53.3% { left: 48%; bottom: 47%; }
          58.3% { left: 48%; bottom: 47%; } /* Shoots laser! */
          66.6% { left: 48%; bottom: 47%; } /* Leaves platform 2 */
          73.3% { left: 60%; bottom: 62%; } /* Parabolic jump peak */
          80.0% { left: 72%; bottom: 32%; } /* Lands on platform 3 */
          90.0% { left: 78%; bottom: 32%; } /* Walks forward */
          100% { left: 15%; bottom: 26%; } /* Resets to start */
        }
        @keyframes enemyWalk {
          0% { left: 58%; opacity: 1; transform: translateY(0) scale(1); }
          20% { left: 54%; opacity: 1; transform: translateY(0) scale(1); }
          40% { left: 56%; opacity: 1; transform: translateY(0) scale(1); }
          41.6% { left: 56%; opacity: 0; transform: translateY(20px) scale(0.1); } /* Hit & Die! */
          90% { left: 58%; opacity: 0; transform: translateY(20px) scale(0.1); }
          95% { left: 58%; opacity: 1; transform: translateY(0) scale(1); } /* Respawn! */
          100% { left: 58%; opacity: 1; }
        }
        @keyframes meleeSlash {
          0%, 40% { opacity: 0; transform: scale(0.1); }
          41.6% { opacity: 1; transform: scale(1); }
          45%, 100% { opacity: 0; transform: scale(1.3); }
        }
        @keyframes laserShoot {
          0%, 55% { opacity: 0; left: 52%; bottom: 51%; transform: scale(0.1); }
          58.3% { opacity: 1; left: 52%; bottom: 51%; transform: scale(1); }
          65% { opacity: 1; left: 95%; bottom: 51%; transform: scale(1); }
          66.6%, 100% { opacity: 0; left: 95%; bottom: 51%; transform: scale(0.1); }
        }

        /* 3. EMPIRE PREVIEWS */
        .grid-isometric {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(rgba(0, 229, 153, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 229, 153, 0.05) 1px, transparent 1px);
          background-size: 20px 20px;
          transform: perspective(200px) rotateX(60deg) translateY(-20px);
          opacity: 0.4;
        }
        .tower {
          position: absolute;
          width: 32px; height: 0px;
          background: linear-gradient(180deg, #aa66ff 0%, #2b1848 100%);
          border: 1px solid #aa66ff;
          bottom: 20%;
          border-radius: 4px 4px 0 0;
          box-shadow: 0 0 10px rgba(170,102,255,0.4);
          animation: towerBuild 4s infinite cubic-bezier(0.25, 1, 0.5, 1);
        }
        .tower-1 { left: 30%; }
        .tower-2 { left: 60%; animation-delay: 1.5s; }
        .construction-laser {
          position: absolute;
          left: 0; right: 0; height: 2px;
          background: #00ffff;
          box-shadow: 0 0 8px #00ffff;
          bottom: 20%;
          animation: scanLaser 4s infinite linear;
        }
        .float-bubble {
          position: absolute;
          font-family: monospace;
          font-size: 11px;
          font-weight: 800;
          left: 32%;
          bottom: 50%;
          opacity: 0;
          animation: floatUp 3s infinite ease-out;
        }
        .text-teal { color: #00ffff; text-shadow: 0 0 6px #00ffff60; }
        .text-purple { color: #aa66ff; text-shadow: 0 0 6px #aa66ff60; }

        @keyframes towerBuild {
          0%, 100% { height: 0px; }
          40%, 90% { height: 75px; }
        }
        @keyframes scanLaser {
          0%, 100% { bottom: 20%; opacity: 0; }
          5%, 35% { opacity: 1; }
          36% { opacity: 0; }
          40% { bottom: 95%; }
        }
        @keyframes floatUp {
          0% { transform: translateY(20px); opacity: 0; }
          15% { opacity: 1; }
          60% { transform: translateY(-60px); opacity: 0; }
          100% { opacity: 0; }
        }

        /* 4. RPG ADVENTURE */
        .rpg-grid {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle, rgba(162,89,255,0.08) 0%, transparent 80%);
        }
        .node {
          position: absolute;
          width: 12px; height: 12px;
          border-radius: 50%;
          transform: translate(-50%, 50%);
          border: 2px solid rgba(255,255,255,0.3);
        }
        
        .node-1 {
          animation: node1Act 8s infinite linear;
        }
        .node-2 {
          animation: node2Act 8s infinite linear;
        }
        .node-3 {
          animation: node3Act 8s infinite linear;
        }
        .node-4 {
          animation: node4Act 8s infinite linear;
        }

        .rpg-player {
          position: absolute;
          width: 16px; height: 16px;
          background: #00ffff;
          border-radius: 50%;
          transform: translate(-50%, 50%);
          box-shadow: 0 0 12px #00ffff;
          animation: rpgMove 8s infinite ease-in-out;
        }
        .rpg-enemy {
          position: absolute;
          left: 40%; bottom: 45%;
          width: 14px; height: 14px;
          background: #ff4b4b;
          border-radius: 3px;
          transform: translate(-50%, 50%);
          box-shadow: 0 0 8px #ff4b4b;
          animation: rpgEnemyAnim 8s infinite ease-in-out;
        }
        .rpg-slash {
          position: absolute;
          left: 40%; bottom: 45%;
          width: 24px; height: 24px;
          background: radial-gradient(circle, #ffffff 0%, #ffff00 50%, transparent 100%);
          transform: translate(-50%, 50%) rotate(45deg) scale(0);
          opacity: 0;
          pointer-events: none;
          animation: rpgSlashAnim 8s infinite ease-out;
        }
        .exp-float {
          position: absolute;
          left: 40%; bottom: 50%;
          color: #00ff66;
          font-family: 'Courier New', monospace;
          font-size: 10px;
          font-weight: bold;
          text-shadow: 0 0 5px #00ff6690;
          transform: translate(-50%, 0);
          opacity: 0;
          animation: expFloatAnim 8s infinite ease-out;
        }
        .rpg-chest {
          position: absolute;
          left: 60%; bottom: 35%;
          width: 16px; height: 14px;
          background: #ffd700;
          border: 1.5px solid #b8860b;
          border-radius: 2px;
          transform: translate(-50%, 50%);
          box-shadow: 0 0 6px rgba(255,215,0,0.5);
          animation: rpgChestAnim 8s infinite ease-in-out;
        }
        .chest-sparkle {
          position: absolute;
          left: 60%; bottom: 35%; width: 30px; height: 30px;
          background: radial-gradient(circle, #ffd700 0%, transparent 60%);
          opacity: 0;
          transform: translate(-50%, 50%) scale(0.1);
          animation: chestOpen 8s infinite ease-in-out;
        }
        .lvl-up {
          position: absolute;
          left: 60%; bottom: 43%;
          font-family: 'Arial Black', sans-serif;
          font-size: 13px;
          color: #ffd700;
          text-shadow: 0 0 8px #ffd700, 0 0 15px #ffaa00;
          font-weight: 900;
          opacity: 0;
          transform: translate(-50%, 0);
          animation: lvlUpText 8s infinite ease-out;
        }
        .rpg-portal {
          position: absolute;
          left: 80%; bottom: 60%;
          width: 20px; height: 22px;
          border: 2px solid #aa66ff;
          border-bottom: none;
          border-radius: 50% 50% 0 0;
          transform: translate(-50%, 50%);
          box-shadow: 0 0 10px #aa66ff;
          animation: rpgPortalAnim 8s infinite ease-in-out;
          background: radial-gradient(circle, #3a0066 0%, transparent 80%);
        }
        .portal-ripple {
          position: absolute;
          left: 80%; bottom: 60%;
          width: 24px; height: 24px;
          border: 2px solid #00ffff;
          border-radius: 50%;
          transform: translate(-50%, 50%) scale(0.5);
          opacity: 0;
          pointer-events: none;
          animation: portalRippleAnim 8s infinite ease-out;
        }

        /* RPG Nodes Color Shifts */
        @keyframes node1Act {
          0%, 12.5% { background: #fff; border-color: #00ffff; box-shadow: 0 0 10px #00ffff; }
          12.6%, 93.7% { background: #aa66ff; border-color: #aa66ff; box-shadow: 0 0 6px #aa66ff; }
          93.8%, 100% { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.3); box-shadow: none; }
        }
        @keyframes node2Act {
          0%, 12.5% { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.3); box-shadow: none; }
          12.6%, 40.0% { background: #fff; border-color: #00ffff; box-shadow: 0 0 10px #00ffff; }
          40.1%, 93.7% { background: #aa66ff; border-color: #aa66ff; box-shadow: 0 0 6px #aa66ff; }
          93.8%, 100% { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.3); box-shadow: none; }
        }
        @keyframes node3Act {
          0%, 40.0% { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.3); box-shadow: none; }
          40.1%, 72.5% { background: #fff; border-color: #00ffff; box-shadow: 0 0 10px #00ffff; }
          72.6%, 93.7% { background: #aa66ff; border-color: #aa66ff; box-shadow: 0 0 6px #aa66ff; }
          93.8%, 100% { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.3); box-shadow: none; }
        }
        @keyframes node4Act {
          0%, 72.5% { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.3); box-shadow: none; }
          72.6%, 93.7% { background: #fff; border-color: #00ffff; box-shadow: 0 0 10px #00ffff; }
          93.8%, 100% { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.3); box-shadow: none; }
        }

        /* Player Smooth Overworld Walking & Step Bounce */
        @keyframes rpgMove {
          0% { left: 20%; bottom: 25%; transform: translate(-50%, 50%) scale(1); opacity: 0; }
          4% { left: 20%; bottom: 25%; transform: translate(-50%, 50%) scale(1); opacity: 1; }
          12.5% { left: 20%; bottom: 25%; transform: translate(-50%, 50%) scale(1); opacity: 1; }
          
          /* Walk to Node 2 (with bob up) */
          18.75% { left: 30%; bottom: 35%; transform: translate(-50%, 65%) scale(1.05); opacity: 1; }
          25.0% { left: 40%; bottom: 45%; transform: translate(-50%, 50%) scale(1.1); opacity: 1; }
          
          /* Battle Hit Back */
          26.0% { left: 39%; bottom: 44%; transform: translate(-50%, 50%) scale(1.1) rotate(-15deg); opacity: 1; }
          28.0% { left: 40%; bottom: 45%; transform: translate(-50%, 50%) scale(1.1) rotate(0); opacity: 1; }
          40.0% { left: 40%; bottom: 45%; transform: translate(-50%, 50%) scale(1); opacity: 1; }
          
          /* Walk to Node 3 (with bob up) */
          48.1% { left: 50%; bottom: 40%; transform: translate(-50%, 65%) scale(1.05); opacity: 1; }
          56.25% { left: 60%; bottom: 35%; transform: translate(-50%, 50%) scale(1); opacity: 1; }
          
          /* Joy Jump */
          59.0% { left: 60%; bottom: 38%; transform: translate(-50%, 50%) scale(1.2, 0.8); opacity: 1; }
          61.0% { left: 60%; bottom: 35%; transform: translate(-50%, 50%) scale(0.9, 1.2); opacity: 1; }
          63.0% { left: 60%; bottom: 35%; transform: translate(-50%, 50%) scale(1); opacity: 1; }
          72.5% { left: 60%; bottom: 35%; transform: translate(-50%, 50%) scale(1); opacity: 1; }
          
          /* Walk to Node 4 (with bob up) */
          80.0% { left: 70%; bottom: 48%; transform: translate(-50%, 65%) scale(1.05); opacity: 1; }
          87.5% { left: 80%; bottom: 60%; transform: translate(-50%, 50%) scale(1) rotate(0); opacity: 1; }
          
          /* Teleport Out */
          91.0% { left: 80%; bottom: 60%; transform: translate(-50%, 50%) scale(0) rotate(180deg); opacity: 0; }
          93.75% { left: 20%; bottom: 25%; transform: translate(-50%, 50%) scale(1) rotate(0); opacity: 0; }
          100% { left: 20%; bottom: 25%; transform: translate(-50%, 50%) scale(1) rotate(0); opacity: 0; }
        }

        /* Red Slime Animation */
        @keyframes rpgEnemyAnim {
          0%, 12.5% { transform: translate(-50%, 50%) scale(1); opacity: 1; }
          18.75% { transform: translate(-50%, 45%) scale(1.1, 0.9); opacity: 1; }
          25.0% { transform: translate(-50%, 50%) scale(1); opacity: 1; }
          25.5% { transform: translate(-50%, 50%) scale(1.4); background: #ffffff; opacity: 1; }
          27.0% { transform: translate(-50%, 30%) scale(0.6) rotate(45deg); opacity: 0.5; }
          30.0% { transform: translate(-50%, 0px) scale(0) rotate(90deg); opacity: 0; }
          93.7% { transform: translate(-50%, 50%) scale(0); opacity: 0; }
          93.8%, 100% { transform: translate(-50%, 50%) scale(1); opacity: 1; }
        }

        /* Combat Melee Slash impact */
        @keyframes rpgSlashAnim {
          0%, 25.0% { transform: translate(-50%, 50%) rotate(45deg) scale(0); opacity: 0; }
          25.5% { transform: translate(-50%, 50%) rotate(135deg) scale(1.6); opacity: 1; }
          27.0% { transform: translate(-50%, 50%) rotate(200deg) scale(1); opacity: 0; }
          100% { transform: translate(-50%, 50%) rotate(200deg) scale(0); opacity: 0; }
        }

        /* EXP Float Indicator */
        @keyframes expFloatAnim {
          0%, 25.5% { transform: translate(-50%, 0); opacity: 0; }
          28.0% { transform: translate(-50%, -10px); opacity: 1; }
          38.0% { transform: translate(-50%, -25px); opacity: 0; }
          100% { transform: translate(-50%, 0); opacity: 0; }
        }

        /* Golden Loot Chest Animation */
        @keyframes rpgChestAnim {
          0%, 40.0% { background: #ffd700; transform: translate(-50%, 50%) scale(1); box-shadow: 0 0 6px rgba(255,215,0,0.5); opacity: 1; }
          56.25% { background: #ffea70; transform: translate(-50%, 50%) scale(1.1); box-shadow: 0 0 15px rgba(255,215,0,0.9); }
          72.5% { background: #8b7500; transform: translate(-50%, 50%) scale(1); box-shadow: none; }
          93.7% { opacity: 0; }
          93.8%, 100% { background: #ffd700; transform: translate(-50%, 50%) scale(1); box-shadow: 0 0 6px rgba(255,215,0,0.5); opacity: 1; }
        }

        /* Golden loot sparkles */
        @keyframes chestOpen {
          0%, 56.25% { opacity: 0; transform: translate(-50%, 50%) scale(0.1); }
          58.0% { opacity: 1; transform: translate(-50%, 50%) scale(1.5); }
          68.0% { opacity: 0; transform: translate(-50%, 50%) scale(2.0); }
          100% { opacity: 0; transform: translate(-50%, 50%) scale(0.1); }
        }

        /* LEVEL UP floating indicators */
        @keyframes lvlUpText {
          0%, 56.25% { opacity: 0; transform: translate(-50%, 0); }
          59.0% { opacity: 1; transform: translate(-50%, -10px); }
          68.0% { opacity: 1; transform: translate(-50%, -20px); }
          75.0% { opacity: 0; transform: translate(-50%, -30px); }
          100% { opacity: 0; transform: translate(-50%, 0); }
        }

        /* Portal Swirling Gate */
        @keyframes rpgPortalAnim {
          0%, 72.5% { border-color: #aa66ff; box-shadow: 0 0 10px #aa66ff; background: radial-gradient(circle, #3a0066 0%, transparent 80%); }
          87.5%, 91.0% { border-color: #00ffff; box-shadow: 0 0 18px #00ffff, inset 0 0 10px #00ffff; background: radial-gradient(circle, #004d4d 0%, transparent 90%); }
          93.7% { border-color: #aa66ff; box-shadow: 0 0 10px #aa66ff; background: radial-gradient(circle, #3a0066 0%, transparent 80%); }
          100% { border-color: #aa66ff; box-shadow: 0 0 10px #aa66ff; }
        }

        /* Portal ripple flash */
        @keyframes portalRippleAnim {
          0%, 87.5% { transform: translate(-50%, 50%) scale(0.5); opacity: 0; }
          88.0% { opacity: 1; }
          93.0% { transform: translate(-50%, 50%) scale(2.2); opacity: 0; }
          100% { transform: translate(-50%, 50%) scale(0.5); opacity: 0; }
        }

        /* 5. FIGHTING PREVIEW */
        .fighter {
          position: absolute;
          width: 24px; height: 44px;
          bottom: 20%;
          border-radius: 4px;
        }
        .f-left {
          left: 30%;
          background: #66aaff;
          border-right: 3px solid #ffffff;
          box-shadow: 0 0 10px #66aaff80;
          animation: fighterA 4s infinite ease-in-out;
        }
        .f-right {
          right: 30%;
          background: #ff4b4b;
          border-left: 3px solid #ffffff;
          box-shadow: 0 0 10px #ff4b4b80;
          animation: fighterB 4s infinite ease-in-out;
        }
        .clash-flash {
          position: absolute;
          left: 50%; bottom: 35%;
          width: 50px; height: 50px;
          background: radial-gradient(circle, #fff 0%, rgba(255,255,255,0.4) 30%, transparent 70%);
          transform: translate(-50%, 50%) scale(0);
          opacity: 0;
          animation: clashSlash 4s infinite ease-out;
        }
        .fight-hud {
          position: absolute;
          top: 40px; left: 10%; right: 10%; height: 6px;
          display: flex; justify-content: space-between;
          z-index: 20;
        }
        .hp-bar {
          width: 45%; height: 100%;
          background: #00ff00;
          border: 1px solid #111;
          box-shadow: 0 0 4px #00ff00;
          transition: width 0.2s;
        }
        .hp-1 { animation: hpDown1 4s infinite linear; }
        .hp-2 { animation: hpDown2 4s infinite linear; }

        @keyframes fighterA {
          0%, 100% { left: 30%; }
          30% { left: 42%; }
          32% { left: 39%; }
          50% { left: 44%; }
          60% { left: 30%; }
        }
        @keyframes fighterB {
          0%, 100% { right: 30%; }
          28% { right: 42%; }
          30% { right: 39%; }
          48% { right: 44%; }
          60% { right: 30%; }
        }
        @keyframes clashSlash {
          0%, 27%, 35%, 100% { opacity: 0; transform: translate(-50%, 0) scale(0); }
          29%, 31% { opacity: 1; transform: translate(-50%, 0) scale(1.5); }
        }
        @keyframes hpDown1 {
          0%, 30% { width: 45%; background: #00ff00; }
          32%, 100% { width: 35%; background: #ffff00; }
        }
        @keyframes hpDown2 {
          0%, 48% { width: 45%; background: #00ff00; }
          50%, 100% { width: 20%; background: #ff0000; }
        }
      `}</style>
    </div>
  );
};

export default ScreenZero;
