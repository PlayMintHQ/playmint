import React, { useState, useRef } from 'react';
import { GAME_PRESETS } from '../gameConfig';

const BANNED_WORDS = ['fuck', 'shit', 'bitch', 'cunt', 'ass', 'dick', 'pussy', 'cock', 'nigger', 'faggot'];

const ScreenZero = ({ onGenerate, onClose, isOverlay }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [transitionPhase, setTransitionPhase] = useState('idle'); // idle | expanding | done
  const formRef = useRef(null);

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleGenerate = (e) => {
    if (e) e.preventDefault();
    setIsGenerating(true);
    setTransitionPhase('expanding');

    // After the expand animation finishes, run the prompt
    setTimeout(() => {
      setTransitionPhase('done');
      processPrompt(prompt);
    }, 700);
  };

  const handleQuickStart = () => {
    setIsGenerating(true);
    setTransitionPhase('expanding');
    setTimeout(() => {
      setTransitionPhase('done');
      generateRandom("Quick start! Generated a default preset.");
    }, 700);
  };

  const handleExampleClick = (exampleText) => {
    setPrompt(exampleText);
    setIsGenerating(true);
    setTransitionPhase('expanding');
    setTimeout(() => {
      setTransitionPhase('done');
      processPrompt(exampleText);
    }, 700);
  };

  const processPrompt = (input) => {
    const text = input.toLowerCase().trim();
    
    // Safety check
    const isUnsafe = BANNED_WORDS.some(word => text.includes(word));
    if (isUnsafe || text === '') {
      generateRandom(isUnsafe ? "Inappropriate prompt. Generated a random variation." : "Generated a random variation.");
      return;
    }

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
    
    // Default difficulty
    newConfig.difficulty = 5;
    newConfig.themeKey = themeKey;

    const isFast = text.match(/(fast|speed|quick|rush)/);
    const isSlow = text.match(/(slow|easy|relax|chill)/);
    const isHard = text.match(/(hard|difficult|impossible|insane|chaos|crazy)/);
    const isLowGravity = text.match(/(moon|float|space|fly|low gravity|zero gravity)/);

    if (isSlow) {
      newConfig.difficulty = 2;
      keywordsMatched++;
    }
    if (isHard) {
      newConfig.difficulty = 9;
      keywordsMatched++;
    }

    applyDifficulty(newConfig, mode);

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
      generateRandom("Prompt unrecognized. Generated a random variation.");
    } else {
      newConfig.gameName = generateImmersiveTitle(input, mode, themeKey);
      onGenerate('custom', newConfig);
    }
  };

  const generateRandom = (message) => {
    const mode = Math.random() > 0.5 ? 'action_quest' : 'standard';
    const config = { ...GAME_PRESETS[mode] };
    config.difficulty = Math.floor(Math.random() * 10) + 1;
    
    applyDifficulty(config, mode);
    
    config.gameName = mode === 'action_quest' ? 'Random Quest' : 'Random Runner';
    const themePool = ['forest', 'lava', 'ice', 'default'];
    config.themeKey = themePool[Math.floor(Math.random() * themePool.length)];
    
    showToast(message);
    setTimeout(() => {
      onGenerate('custom', config);
    }, 1500); // Give time to read toast
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

  const generateImmersiveTitle = (input, mode, theme) => {
    const trimmed = input.trim();
    // If prompt is a reasonable length, use it directly but capitalize properly
    if (trimmed.length > 4 && trimmed.length < 36) {
      return trimmed
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }

    const themeNames = {
      lava: ['Ashfall', 'Molten', 'Cinder', 'Inferno', 'Ember', 'Scorch'],
      ice: ['Glacier', 'Frost', 'Arctic', 'Snowfall', 'Permafrost', 'Hoarfrost'],
      forest: ['Verdant', 'Wildwood', 'Grove', 'Emerald', 'Fern', 'Canopy'],
      default: ['Prime', 'Core', 'Nova', 'Omega', 'Apex', 'Flux']
    };
    const modeNames = mode === 'action_quest'
      ? ['Quest', 'Runes', 'Raid', 'Path', 'Chronicle', 'Saga']
      : ['Run', 'Sprint', 'Rush', 'Dash', 'Circuit', 'Marathon'];

    const themeList = themeNames[theme] || themeNames.default;
    const title = `${themeList[Math.floor(Math.random() * themeList.length)]} ${modeNames[Math.floor(Math.random() * modeNames.length)]}`;
    return title;
  };

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      zIndex: 9999, overflow: 'hidden'
    }}>
      {/* Winter parallax layers — three backgrounds at different depths */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: 'url(/assets/themes/winter/bg-1.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center 30%',
        imageRendering: 'pixelated',
        opacity: 0.85,
        animation: 'parallaxFar 12s ease-in-out infinite alternate'
      }} />
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: 'url(/assets/themes/winter/bg-2.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center 30%',
        imageRendering: 'pixelated',
        opacity: 1,
        animation: 'parallaxMid 8s ease-in-out infinite alternate'
      }} />
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: 'url(/assets/themes/winter/bg-3.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center 30%',
        imageRendering: 'pixelated',
        opacity: 1,
        animation: 'parallaxNear 5s ease-in-out infinite alternate'
      }} />
      {/* Dark gradient overlay for readability */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        background: `
          linear-gradient(180deg, rgba(7,10,16,0.5) 0%, rgba(7,10,16,0.15) 40%, rgba(7,10,16,0.4) 70%, rgba(7,10,16,0.8) 100%)
        `
      }} />

      {/* Grid lines */}
      <svg style={{ position: 'absolute', inset: 0, zIndex: 2, width: '100%', height: '100%', opacity: 0.06 }}>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,229,153,0.5)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Floating glow orbs */}
      <div style={{
        position: 'absolute', width: '400px', height: '400px',
        background: 'radial-gradient(circle, rgba(13,180,185,0.12) 0%, transparent 70%)',
        top: '-5%', left: '-5%', borderRadius: '50%', filter: 'blur(50px)',
        animation: 'float 14s infinite alternate', zIndex: 2
      }} />
      <div style={{
        position: 'absolute', width: '350px', height: '350px',
        background: 'radial-gradient(circle, rgba(162,89,255,0.08) 0%, transparent 70%)',
        bottom: '10%', right: '-5%', borderRadius: '50%', filter: 'blur(50px)',
        animation: 'float 18s infinite alternate-reverse', zIndex: 2
      }} />

      {/* ===== TOP: Title area (absolute, only visible as overlay close button) ===== */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
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

      {/* ===== MIDDLE: Slogan ===== */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 3, textAlign: 'center',
        pointerEvents: 'none',
        animation: transitionPhase === 'idle' ? 'sloganFade 0.8s ease-out' : undefined
      }}>
        <p style={{
          margin: 0,
          fontFamily: 'var(--font-heading)',
          fontSize: 'clamp(18px, 3.5vw, 32px)',
          fontWeight: '700',
          color: 'var(--pm-text-primary)',
          letterSpacing: '-0.3px',
          opacity: 0.8,
          textShadow: '0 2px 24px rgba(0,0,0,0.4)'
        }}>
          From words to worlds.
        </p>
      </div>

      {/* ===== BOTTOM: Prompt dock ===== */}
      <div style={{
        width: '100%',
        marginTop: 'auto',
        padding: '0 clamp(16px, 4vw, 48px) clamp(24px, 4vh, 48px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        zIndex: transitionPhase === 'expanding' ? 100 : 3,
        position: transitionPhase === 'expanding' ? 'fixed' : 'relative',
        inset: transitionPhase === 'expanding' ? 0 : undefined,
        justifyContent: transitionPhase === 'expanding' ? 'center' : undefined,
        animation: transitionPhase === 'idle' ? 'dockRise 0.6s ease-out' : undefined,
        pointerEvents: transitionPhase === 'done' ? 'none' : undefined,
        transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)'
      }}>
        <div ref={formRef} style={{
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

          <div className="pm-screenzero-chips" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', justifyContent: 'center' }}>
            {['lava runner', 'ice quest', 'forest sprint'].map((example, i) => (
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
      </div>

      {/* Toast Notification */}
      <div style={{
        position: 'absolute', bottom: toastMessage ? '120px' : '-100px',
        left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.85)', border: '1px solid var(--pm-accent-purple)',
        color: '#fff', padding: '10px 20px', borderRadius: '30px',
        fontWeight: '500', transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        zIndex: 10000, boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', gap: '8px',
        fontSize: '13px'
      }}>
        <span style={{ fontSize: '18px' }}>✨</span> {toastMessage}
      </div>
      
        <style>{`
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
            100% { background-position-x: 42%; }
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
            0% { opacity: 0; transform: translate(-50%, -40%); }
            100% { opacity: 1; transform: translate(-50%, -50%); }
          }
          @media (max-width: 640px) {
            .pm-screenzero-form {
              grid-template-columns: 1fr auto;
              border-radius: 14px;
            }
            .pm-screenzero-quick {
              display: none;
            }
            .pm-screenzero-chips {
              display: none;
            }
          }
          @media (max-height: 500px) {
            .pm-screenzero-chips {
              display: none;
            }
          }
        `}</style>
    </div>
  );
};

export default ScreenZero;
