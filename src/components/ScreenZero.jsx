import React, { useState, useRef } from 'react';
import { GAME_PRESETS } from '../gameConfig';
import { parsePromptKeywords, generateTitle } from '../game/promptUtils';

const BANNED_WORDS = ['fuck', 'shit', 'bitch', 'cunt', 'ass', 'dick', 'pussy', 'cock', 'nigger', 'faggot'];

const AVAILABLE_MODES = [
  { key: 'standard', label: 'Runner' },
  { key: 'action_quest', label: 'Action Quest' },
];

const COMING_SOON_MODES = [
  'Empire Builder', 'RPG Adventure', 'Fighting Arena',
  'Racing Rush', 'Shooter Arena', 'Survival Mode', 'Simulator World',
];

const ScreenZero = ({ onGenerate, onClose, isOverlay, onStartTransition, onCompleteTransition, isTransitioning }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [transitionPhase, setTransitionPhase] = useState('idle'); // idle | expanding | compiling | fading | done
  const [selectedMode, setSelectedMode] = useState(null); // null | 'standard' | 'action_quest'
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

    const newConfig = { ...GAME_PRESETS[mode] };
    newConfig.themeKey = themeKey;

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
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      zIndex: 9999,
      overflowY: 'auto',
      overflowX: 'hidden',
      padding: 'clamp(24px, 5vh, 64px) 0',
      boxSizing: 'border-box',
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

      {/* Winter parallax layers — three backgrounds at different depths */}
      <div style={getBackgroundStyle(0.85, 1, '/assets/themes/winter/bg-1.png')} className="parallax-layer" />
      <div style={getBackgroundStyle(1, 2, '/assets/themes/winter/bg-2.png')} className="parallax-layer" />
      <div style={getBackgroundStyle(1, 3, '/assets/themes/winter/bg-3.png')} className="parallax-layer" />
      
      {/* Dark gradient overlay for readability */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1,
        background: `
          linear-gradient(180deg, rgba(7,10,16,0.5) 0%, rgba(7,10,16,0.15) 40%, rgba(7,10,16,0.4) 70%, rgba(7,10,16,0.8) 100%)
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

      {/* Floating glow orbs */}
      <div style={{
        position: 'fixed', width: '400px', height: '400px',
        background: 'radial-gradient(circle, rgba(13,180,185,0.12) 0%, transparent 70%)',
        top: '-5%', left: '-5%', borderRadius: '50%', filter: 'blur(50px)',
        animation: 'float 14s infinite alternate', zIndex: 2
      }} />
      <div style={{
        position: 'fixed', width: '350px', height: '350px',
        background: 'radial-gradient(circle, rgba(162,89,255,0.08) 0%, transparent 70%)',
        bottom: '10%', right: '-5%', borderRadius: '50%', filter: 'blur(50px)',
        animation: 'float 18s infinite alternate-reverse', zIndex: 2
      }} />

      {/* ===== TOP: Title area (fixed close button for secure overlay positioning) ===== */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        padding: 'clamp(16px, 3vw, 32px)',
        zIndex: 4
      }}>
        {isOverlay && (
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid var(--pm-border)',
              color: 'var(--pm-text-secondary)', fontSize: '18px',
              padding: '6px 12px', borderRadius: '8px', cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.target.style.background = 'rgba(255,255,255,0.2)'; e.target.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.target.style.background = 'rgba(255,255,255,0.08)'; e.target.style.color = 'var(--pm-text-secondary)'; }}
          >
            ✕ Close
          </button>
        )}
      </div>

      {/* ===== MIDDLE: Logo + Slogan ===== */}
      <div className="pm-screenzero-hero" style={{
        flex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        width: '100%',
        zIndex: 3,
        pointerEvents: 'none',
        opacity: (transitionPhase === 'compiling' || transitionPhase === 'fading') ? 0.3 : 1,
        transition: 'opacity 0.6s ease-in-out',
        animation: transitionPhase === 'idle' ? 'sloganFade 0.8s ease-out' : undefined
      }}>
        <img
          src="/assets/Logo_PlayMint_(transparent).png"
          alt="PlayMint"
          className="pm-screenzero-logo"
          style={{ height: '36px', marginBottom: '12px', opacity: 0.9, display: 'block', marginLeft: 'auto', marginRight: 'auto' }}
        />
        {(transitionPhase !== 'compiling' && transitionPhase !== 'fading') && (
          <p className="pm-screenzero-slogan" style={{
            margin: 0,
            fontFamily: 'var(--font-heading)',
            fontSize: 'clamp(18px, 3.5vw, 32px)',
            fontWeight: '700',
            color: 'var(--pm-text-primary)',
            letterSpacing: '-0.3px',
            opacity: 0.8,
            textShadow: '0 2px 24px rgba(0,0,0,0.4)',
            transition: 'opacity 0.4s ease'
          }}>
            From words to worlds.
          </p>
        )}
      </div>

      {/* ===== BOTTOM: Prompt dock ===== */}
      <div className="pm-screenzero-dock" style={{
        width: '100%',
        marginTop: 'auto',
        padding: '0 clamp(16px, 4vw, 48px) clamp(24px, 4vh, 48px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        zIndex: 3,
        position: 'relative',
        animation: transitionPhase === 'idle' ? 'dockRise 0.6s ease-out' : undefined,
        pointerEvents: transitionPhase === 'done' ? 'none' : undefined,
        transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)'
      }}>
        
        {(transitionPhase === 'compiling' || transitionPhase === 'fading') ? (
          /* ===== RETRO CYBERNETIC COMPILER TERMINAL ===== */
          <div style={{
            width: 'min(600px, 95%)',
            background: 'rgba(6, 10, 16, 0.92)',
            border: '1px solid var(--pm-accent-teal)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), 0 0 25px rgba(0, 229, 153, 0.15)',
            backdropFilter: 'blur(16px)',
            fontFamily: 'monospace',
            boxSizing: 'border-box',
            animation: 'dockRise 0.4s ease-out',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {/* Terminal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff5f56' }} />
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ffbd2e' }} />
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#27c93f' }} />
              </div>
              <span style={{ color: 'var(--pm-text-tertiary)', fontSize: '10px', fontWeight: 'bold', letterSpacing: '1px', fontFamily: 'monospace' }}>PLAYMINT COMPILER v2.0</span>
            </div>

            {/* Terminal Logs */}
            <div style={{ height: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
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

            {/* Progress Area */}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--pm-text-secondary)' }}>
                <span style={{ fontFamily: 'monospace' }}>Compiling Matrix</span>
                <span style={{ color: 'var(--pm-accent-teal)', fontWeight: 'bold', fontFamily: 'monospace' }}>{Math.round(progress)}%</span>
              </div>
              <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
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
          /* ===== ORIGINAL PROMPT FORM / MODE SELECTION ===== */
          <div ref={formRef} className="pm-screenzero-content" style={{
            width: 'min(640px, 100%)',
            transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
            transform: transitionPhase === 'expanding' ? 'scale(1.6)' : 'scale(1)',
            opacity: transitionPhase === 'expanding' ? 0 : 1
          }}>
            <form onSubmit={handleGenerate} className="pm-screenzero-form" style={{
              width: '100%',
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: '8px',
              background: 'rgba(10,15,22,0.85)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '16px',
              padding: '8px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,229,153,0.06)',
              backdropFilter: 'blur(12px)'
            }}>
              <input
                type="text"
                className="pm-input"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. 'lava runner with low gravity'"
                style={{
                  padding: '12px 16px', fontSize: '14px', borderRadius: '12px',
                  backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)'
                }}
                autoFocus
              />
              <button
                type="submit"
                className="pm-btn pm-btn-primary"
                disabled={isGenerating}
                style={{
                  padding: '10px 18px', fontSize: '13px', borderRadius: '12px',
                  fontWeight: 'bold', opacity: isGenerating ? 0.7 : 1
                }}
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
              <button
                type="button"
                onClick={handleQuickStart}
                className="pm-btn pm-btn-outline pm-screenzero-quick"
                disabled={isGenerating}
                style={{
                  padding: '10px 14px', fontSize: '12px', borderRadius: '12px'
                }}
              >
                Quick Start
              </button>
            </form>

            {/* ===== GAME MODE SELECTOR ===== */}
            <div className="pm-screenzero-modes" style={{ marginTop: '16px', textAlign: 'center' }}>
              <p style={{
                margin: '0 0 10px 0',
                fontSize: '12px',
                fontWeight: '600',
                color: 'var(--pm-text-secondary)',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
              }}>
                Choose your game type
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                {AVAILABLE_MODES.map((mode) => {
                  const isActive = selectedMode === mode.key;
                  return (
                    <button
                      key={mode.key}
                      type="button"
                      disabled={isGenerating}
                      onClick={() => setSelectedMode(isActive ? null : mode.key)}
                      style={{
                        padding: '6px 16px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: isGenerating ? 'default' : 'pointer',
                        transition: 'all 0.2s ease',
                        background: isActive ? 'rgba(0,229,153,0.15)' : 'rgba(255,255,255,0.06)',
                        border: isActive ? '1px solid var(--pm-accent-teal)' : '1px solid rgba(255,255,255,0.12)',
                        color: isActive ? 'var(--pm-accent-teal)' : 'var(--pm-text-secondary)',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive && !isGenerating) {
                          e.target.style.background = 'rgba(255,255,255,0.12)';
                          e.target.style.color = '#fff';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive && !isGenerating) {
                          e.target.style.background = 'rgba(255,255,255,0.06)';
                          e.target.style.color = 'var(--pm-text-secondary)';
                        }
                      }}
                    >
                      {mode.label}
                    </button>
                  );
                })}
                {COMING_SOON_MODES.map((name) => (
                  <span
                    key={name}
                    style={{
                      padding: '6px 16px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '500',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      color: 'var(--pm-text-tertiary)',
                      opacity: 0.4,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'default',
                    }}
                  >
                    {name}
                    <span style={{
                      fontSize: '9px',
                      fontWeight: '700',
                      background: 'rgba(255,255,255,0.06)',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      color: 'var(--pm-text-tertiary)',
                    }}>
                      LOCKED
                    </span>
                  </span>
                ))}
              </div>
            </div>

            <div className="pm-screenzero-chips" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px', justifyContent: 'center' }}>
              {['lava runner', 'ice quest', 'forest sprint', 'city runner', 'space quest'].map((example, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleExampleClick(example)}
                  style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--pm-text-secondary)', padding: '5px 12px', borderRadius: '999px',
                    fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s ease',
                    opacity: 0.7
                  }}
                  onMouseEnter={(e) => { e.target.style.background = 'rgba(255,255,255,0.15)'; e.target.style.color = '#fff'; e.target.style.opacity = '1'; }}
                  onMouseLeave={(e) => { e.target.style.background = 'rgba(255,255,255,0.06)'; e.target.style.color = 'var(--pm-text-secondary)'; e.target.style.opacity = '0.7'; }}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scanlineSweep {
          0% { top: -5%; }
          100% { top: 105%; }
        }
        @keyframes parallaxFar {
          0% { background-position-x: 50%; }
          100% { background-position-x: 48%; }
        }
        @keyframes parallaxMid {
          0% { background-position-x: 50%; }
          100% { background-position-x: 46%; }
        }
        @keyframes parallaxNear {
          0% { background-position-x: 50%; }
          100% { background-position-x: 44%; }
        }
        @keyframes float {
          0% { transform: translateY(0) scale(1); }
          100% { transform: translateY(-15px) scale(1.03); }
        }
        @keyframes dockRise {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes sloganFade {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 640px) {
          .pm-screenzero-form {
            grid-template-columns: 1fr auto;
            border-radius: 14px;
          }
          .pm-screenzero-quick {
            display: none;
          }
          .pm-screenzero-modes {
            display: none;
          }
          .pm-screenzero-chips {
            display: none;
          }
        }
        @media (max-height: 550px) {
          .pm-screenzero-slogan {
            display: none !important;
          }
          .pm-screenzero-logo {
            height: 24px !important;
            margin-bottom: 4px !important;
          }
          .pm-screenzero-chips {
            display: none !important;
          }
        }
        @media (max-height: 480px) {
          .pm-screenzero-hero {
            display: none !important;
          }
        }
        @media (max-height: 600px) {
          .pm-screenzero-dock {
            padding-bottom: 12px;
          }
          .pm-screenzero-modes {
            margin-top: 8px;
          }
          .pm-screenzero-chips {
            margin-top: 6px;
          }
        }
        .pm-screenzero-content::-webkit-scrollbar {
          width: 4px;
        }
        .pm-screenzero-content::-webkit-scrollbar-track {
          background: transparent;
        }
        .pm-screenzero-content::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.15);
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
};

export default ScreenZero;
