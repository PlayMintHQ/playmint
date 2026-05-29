import React, { useState, useRef } from 'react';
import { GAME_PRESETS } from '../gameConfig';
import { parsePromptKeywords, generateTitle } from '../game/promptUtils';

const BANNED_WORDS = ['fuck', 'shit', 'bitch', 'cunt', 'ass', 'dick', 'pussy', 'cock', 'nigger', 'faggot'];

const AVAILABLE_MODES = [
  { key: 'standard', label: 'Runner', desc: 'Fast-paced infinite progression runner. Avoid obstacles, collect crates.' },
  { key: 'action_quest', label: 'Action Quest', desc: 'Classic 2D platformer with melee slashing, projectile combat, and patrolling enemies.' },
];

const COMING_SOON_MODES = [
  { key: 'rpg', label: 'RPG Adventure', desc: 'Grid pathfinding, loot chests, turn-based dialogue, and epic fantasy upgrades.' },
  { key: 'empire', label: 'Empire Builder', desc: 'Construct towers, gather crystals, and build your pixel galactic civilization.' },
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
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [progress, setProgress] = useState(0);
  const formRef = useRef(null);

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
        maxWidth: '700px',
        zIndex: 3,
        flex: 1,
        alignItems: 'stretch',
        boxSizing: 'border-box',
        marginBottom: '20px',
        margin: '0 auto'
      }}>
        
        {/* ================= COLUMN: INTERACTIVE GENERATOR DECK ================= */}
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

        .pm-deck {
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

        @media (min-width: 768px) {
          .pm-screenzero-container {
            height: 100vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
          }
          .pm-screenzero-grid {
            display: flex;
            flex-direction: column;
            gap: 32px;
            flex: 1;
            min-height: 0;
            overflow: hidden;
          }
          .pm-deck {
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
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          .vertical-scroll-deck {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            max-height: none;
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
      `}</style>
    </div>
  );
};

export default ScreenZero;
