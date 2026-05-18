import React, { useState } from 'react';
import { GAME_PRESETS } from '../gameConfig';

const BANNED_WORDS = ['fuck', 'shit', 'bitch', 'cunt', 'ass', 'dick', 'pussy', 'cock', 'nigger', 'faggot'];

const ScreenZero = ({ onGenerate }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleGenerate = (e) => {
    if (e) e.preventDefault();
    setIsGenerating(true);

    setTimeout(() => {
      processPrompt(prompt);
      setIsGenerating(false);
    }, 800); // Fake delay for UX
  };

  const handleQuickStart = () => {
    setIsGenerating(true);
    setTimeout(() => {
      generateRandom("Quick start! Generated a default preset.");
      setIsGenerating(false);
    }, 500);
  };

  const handleExampleClick = (exampleText) => {
    setPrompt(exampleText);
    setIsGenerating(true);
    setTimeout(() => {
      processPrompt(exampleText);
      setIsGenerating(false);
    }, 800);
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
    if (trimmed.length > 4 && trimmed.length < 32) {
      return trimmed;
    }

    const themeNames = {
      lava: ['Ashfall', 'Molten', 'Cinder', 'Inferno'],
      ice: ['Glacier', 'Frost', 'Arctic', 'Snowfall'],
      forest: ['Verdant', 'Wildwood', 'Grove', 'Emerald'],
      default: ['PlayMint', 'Core', 'Nova', 'Prime']
    };
    const modeNames = mode === 'action_quest'
      ? ['Quest', 'Runes', 'Raid', 'Path']
      : ['Run', 'Sprint', 'Rush', 'Dash'];

    const themeList = themeNames[theme] || themeNames.default;
    const title = `${themeList[Math.floor(Math.random() * themeList.length)]} ${modeNames[Math.floor(Math.random() * modeNames.length)]}`;
    return title;
  };

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'flex-end', alignItems: 'center',
      background: 'linear-gradient(135deg, #0a0f16 0%, #111827 100%)',
      zIndex: 9999, overflow: 'hidden'
    }}>
      {/* Animated background elements */}
      <div style={{
        position: 'absolute', width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(13,180,185,0.15) 0%, transparent 70%)',
        top: '-20%', left: '-10%', borderRadius: '50%', filter: 'blur(40px)', animation: 'float 10s infinite alternate'
      }} />
      <div style={{
        position: 'absolute', width: '500px', height: '500px',
        background: 'radial-gradient(circle, rgba(162,89,255,0.1) 0%, transparent 70%)',
        bottom: '-10%', right: '-10%', borderRadius: '50%', filter: 'blur(40px)', animation: 'float 12s infinite alternate-reverse'
      }} />

      <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.5 }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(circle at 20% 30%, rgba(0,229,153,0.2), transparent 45%), radial-gradient(circle at 80% 20%, rgba(255,140,0,0.18), transparent 50%), radial-gradient(circle at 50% 80%, rgba(138,43,226,0.18), transparent 55%)'
        }} />
      </div>

      <div style={{
        width: 'min(720px, 90vw)',
        marginBottom: 'clamp(24px, 6vh, 60px)',
        zIndex: 2,
        animation: 'dockRise 0.6s ease-out'
      }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: '10px'
        }}>
          <h1 style={{
            fontSize: 'clamp(20px, 4vw, 30px)', fontWeight: '900', margin: 0,
            letterSpacing: '-0.5px', color: 'var(--pm-text-primary)'
          }}>
            Enter the Mint
          </h1>
          <span style={{
            color: 'var(--pm-text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px'
          }}>
            V0 Generator
          </span>
        </div>

        <form onSubmit={handleGenerate} className="pm-screenzero-form" style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          gap: '10px',
          background: 'rgba(10,15,22,0.78)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: '999px',
          padding: '10px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,229,153,0.08)',
          backdropFilter: 'blur(10px)'
        }}>
          <input
            type="text"
            className="pm-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. 'lava runner with low gravity'"
            style={{
              padding: '12px 16px', fontSize: '15px', borderRadius: '999px',
              backgroundColor: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)'
            }}
            autoFocus
          />
          <button
            type="submit"
            className="pm-btn pm-btn-primary"
            disabled={isGenerating}
            style={{
              padding: '10px 18px', fontSize: '14px', borderRadius: '999px',
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
              padding: '10px 16px', fontSize: '13px', borderRadius: '999px'
            }}
          >
            Quick Start
          </button>
        </form>

        <div className="pm-screenzero-chips" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
          {['lava runner', 'ice quest', 'forest sprint'].map((example, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleExampleClick(example)}
              style={{
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                color: 'var(--pm-text-secondary)', padding: '6px 12px', borderRadius: '999px',
                fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => { e.target.style.background = 'rgba(255,255,255,0.2)'; e.target.style.color = '#fff'; }}
              onMouseLeave={(e) => { e.target.style.background = 'rgba(255,255,255,0.08)'; e.target.style.color = 'var(--pm-text-secondary)'; }}
            >
              Try: {example}
            </button>
          ))}
        </div>
      </div>

      {/* Toast Notification */}
      <div style={{
        position: 'absolute', bottom: toastMessage ? '40px' : '-100px',
        left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.8)', border: '1px solid var(--pm-accent-purple)',
        color: '#fff', padding: '12px 24px', borderRadius: '30px',
        fontWeight: '500', transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        zIndex: 10000, boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', gap: '8px'
      }}>
        <span style={{ fontSize: '20px' }}>✨</span> {toastMessage}
      </div>
      
        <style>{`
          @keyframes float {
            0% { transform: translateY(0) scale(1); }
            100% { transform: translateY(-20px) scale(1.05); }
          }
          @keyframes dockRise {
            0% { opacity: 0; transform: translateY(10px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @media (max-width: 640px) {
            .pm-screenzero-form {
              grid-template-columns: 1fr;
              border-radius: 18px;
            }
            .pm-screenzero-quick {
              display: none;
            }
            .pm-screenzero-chips {
              display: none;
            }
          }
        `}</style>
    </div>
  );
};

export default ScreenZero;
