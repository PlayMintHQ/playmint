import React, { useState, useEffect } from 'react';
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

    // Detect Mode
    if (text.match(/(action|quest|fight|platformer|enemies|shoot|kill|combat)/)) {
      mode = 'action_quest';
      keywordsMatched++;
    } else if (text.match(/(run|dash|jump|runner|dodge|sprint)/)) {
      mode = 'standard';
      keywordsMatched++;
    }

    if (mode === 'random') {
      mode = Math.random() > 0.5 ? 'action_quest' : 'standard';
    }

    // Start with base preset
    newConfig = { ...GAME_PRESETS[mode] };
    
    // Default difficulty
    newConfig.difficulty = 5;

    // Apply Modifiers
    if (text.match(/(fast|speed|quick|rush)/)) {
      if (mode === 'standard') newConfig.runSpeed = 600;
      if (mode === 'action_quest') newConfig.actionJumpHeight = 800;
      keywordsMatched++;
    }
    if (text.match(/(slow|easy|relax|chill)/)) {
      newConfig.difficulty = 2;
      if (mode === 'standard') { newConfig.runSpeed = 200; newConfig.gravity = 1200; }
      if (mode === 'action_quest') { newConfig.actionEnemyCount = 1; newConfig.actionGravity = 1000; }
      keywordsMatched++;
    }
    if (text.match(/(hard|difficult|impossible|insane|chaos|crazy)/)) {
      newConfig.difficulty = 9;
      if (mode === 'standard') { newConfig.runSpeed = 800; newConfig.gravity = 2500; newConfig.obstacleDelay = 600; }
      if (mode === 'action_quest') { newConfig.actionEnemyCount = 12; newConfig.actionGravity = 2000; }
      keywordsMatched++;
    }
    if (text.match(/(moon|float|space|fly|low gravity|low|gravity)/)) {
      newConfig.gravity = 600;
      newConfig.actionGravity = 600;
      keywordsMatched++;
    }

    if (keywordsMatched === 0) {
      generateRandom("Prompt unrecognized. Generated a random variation.");
    } else {
      // Apply difficulty mappings universally if set
      applyDifficulty(newConfig, mode);
      newConfig.gameName = input.length > 20 ? input.substring(0, 20) + '...' : input;
      onGenerate('custom', newConfig);
    }
  };

  const generateRandom = (message) => {
    const mode = Math.random() > 0.5 ? 'action_quest' : 'standard';
    const config = { ...GAME_PRESETS[mode] };
    config.difficulty = Math.floor(Math.random() * 10) + 1;
    
    applyDifficulty(config, mode);
    
    config.gameName = mode === 'action_quest' ? 'Random Quest' : 'Random Runner';
    
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

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center',
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

      <div className="pm-glass-panel" style={{
        padding: '40px', borderRadius: '24px', width: '90%', maxWidth: '500px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.1)',
        position: 'relative', zIndex: 1
      }}>
        <h1 style={{
          fontSize: '36px', fontWeight: '900', color: 'var(--pm-text-primary)',
          marginBottom: '8px', textAlign: 'center', letterSpacing: '-1px',
          background: 'linear-gradient(to right, #0db4b9, #a259ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
        }}>
          PlayMint
        </h1>
        <p style={{ color: 'var(--pm-text-secondary)', marginBottom: '32px', textAlign: 'center', fontSize: '16px' }}>
          Type a prompt to generate your game.
        </p>

        <form onSubmit={handleGenerate} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input
            type="text"
            className="pm-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. 'fast and hard action quest'..."
            style={{ 
              padding: '16px 20px', fontSize: '18px', borderRadius: '12px',
              backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', outline: 'none', transition: 'all 0.2s ease',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--pm-accent-teal)'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.15)'}
            autoFocus
          />
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              type="submit" 
              className="pm-btn pm-btn-primary"
              disabled={isGenerating}
              style={{ 
                flex: 1, padding: '16px', fontSize: '18px', borderRadius: '12px',
                fontWeight: 'bold', letterSpacing: '0.5px',
                opacity: isGenerating ? 0.7 : 1, transform: isGenerating ? 'scale(0.98)' : 'scale(1)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              {isGenerating ? 'Generating...' : 'Generate ⚡'}
            </button>

            <button 
              type="button" 
              onClick={handleQuickStart}
              className="pm-btn pm-btn-outline"
              disabled={isGenerating}
              style={{ 
                padding: '16px 24px', fontSize: '16px', borderRadius: '12px',
                fontWeight: 'bold',
                opacity: isGenerating ? 0.7 : 1, transform: isGenerating ? 'scale(0.98)' : 'scale(1)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                backgroundColor: 'rgba(255,255,255,0.05)'
              }}
            >
              Quick Start
            </button>
          </div>
        </form>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '20px' }}>
          {['fast game', 'low gravity platformer', 'hard mode'].map((example, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleExampleClick(example)}
              style={{
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                color: 'var(--pm-text-secondary)', padding: '6px 12px', borderRadius: '20px',
                fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => { e.target.style.background = 'rgba(255,255,255,0.2)'; e.target.style.color = '#fff'; }}
              onMouseLeave={(e) => { e.target.style.background = 'rgba(255,255,255,0.1)'; e.target.style.color = 'var(--pm-text-secondary)'; }}
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
      `}</style>
    </div>
  );
};

export default ScreenZero;
