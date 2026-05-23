import React, { useState, useEffect } from 'react';

const ACCENT_COLORS = {
  lava: '#FF6B3D',
  ice: '#66AAFF',
  forest: '#66CC66',
  city: '#4488CC',
  space: '#AA66FF',
  default: '#00E599'
};

const ScoreTicker = ({ targetScore }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = parseInt(targetScore, 10);
    if (isNaN(end) || end === 0) {
      setCount(0);
      return;
    }

    const duration = 1000; // 1 second rollup
    const startTime = performance.now();
    let animationFrameId;

    const updateCount = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing: easeOutQuad
      const easeProgress = progress * (2 - progress);
      setCount(Math.floor(easeProgress * end));

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(updateCount);
      }
    };

    animationFrameId = requestAnimationFrame(updateCount);
    return () => cancelAnimationFrame(animationFrameId);
  }, [targetScore]);

  return <span>{count}</span>;
};

const GameOverOverlay = ({ isWin, score, themeKey, gameType, onRestart, onTweakSettings }) => {
  const [isBtnHovered, setIsBtnHovered] = useState(false);
  const [isTweakHovered, setIsTweakHovered] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const accentColor = ACCENT_COLORS[themeKey] || ACCENT_COLORS.default;

  useEffect(() => {
    // Fetch and check high score
    const key = `playmint_high_score_${gameType || 'runner'}_${themeKey || 'default'}`;
    const stored = localStorage.getItem(key);
    const parsedStored = stored ? parseInt(stored, 10) : 0;
    
    setHighScore(parsedStored);

    if (score > parsedStored) {
      localStorage.setItem(key, score.toString());
      setIsNewRecord(true);
      setHighScore(score);
    }
  }, [score, themeKey, gameType]);

  // Handle Space key for restart inside React
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        const el = document.activeElement;
        const isTextInput = el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')));
        if (isTextInput) return;
        
        e.preventDefault();
        onRestart();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onRestart]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(5, 7, 12, 0.45)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      animation: 'fadeIn 0.35s ease-out',
      boxSizing: 'border-box'
    }}>
      {/* Dynamic Keyframes Injection */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleUp {
          from { transform: scale(0.92); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes pulseBadge {
          0% { transform: scale(1); box-shadow: 0 0 8px rgba(212, 157, 51, 0.3); }
          100% { transform: scale(1.04); box-shadow: 0 0 16px rgba(212, 157, 51, 0.6); }
        }
        @keyframes blinkText {
          0% { opacity: 0.4; }
          100% { opacity: 0.8; }
        }
      `}</style>

      {/* Main Glassmorphism Overlay Card */}
      <div style={{
        width: 'min(420px, 90%)',
        padding: '40px 32px',
        borderRadius: '24px',
        background: 'rgba(18, 24, 37, 0.82)',
        border: `1px solid ${accentColor}2c`,
        boxShadow: `0 24px 50px rgba(0, 0, 0, 0.55), 0 0 35px ${accentColor}12`,
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '28px',
        animation: 'scaleUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        boxSizing: 'border-box'
      }}>
        {/* Soft Radial Ambient Aura matching the active theme key */}
        <div style={{
          position: 'absolute',
          top: '-15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '240px',
          height: '240px',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accentColor}1c 0%, transparent 70%)`,
          pointerEvents: 'none',
          filter: 'blur(20px)',
          zIndex: 0
        }} />

        {/* Title Section (Original Exact Wording, strictly No Emojis) */}
        <div style={{ zIndex: 1, width: '100%' }}>
          <h1 style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: '900',
            fontSize: 'clamp(28px, 6vw, 38px)',
            letterSpacing: '3px',
            color: isWin ? '#00FF99' : '#FF4B4B',
            textShadow: `0 0 20px ${isWin ? 'rgba(0, 255, 153, 0.35)' : 'rgba(255, 75, 75, 0.35)'}`,
            margin: 0,
            textTransform: 'uppercase'
          }}>
            {isWin ? 'YOU WIN!' : 'GAME OVER'}
          </h1>
          <div style={{
            width: '60px',
            height: '3px',
            background: `linear-gradient(90deg, ${accentColor}, transparent)`,
            margin: '12px auto 0 auto',
            borderRadius: '2px',
            opacity: 0.6
          }} />
        </div>

        {/* Score & Record Display Section */}
        <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <span style={{
            fontFamily: 'var(--font-primary)',
            fontSize: '12px',
            color: 'var(--pm-text-secondary)',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '1.5px'
          }}>
            Score
          </span>
          <span style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '56px',
            fontWeight: '900',
            color: '#ffffff',
            lineHeight: 1,
            margin: '4px 0',
            textShadow: '0 2px 10px rgba(0, 0, 0, 0.4)'
          }}>
            <ScoreTicker targetScore={score} />
          </span>

          {isNewRecord ? (
            <div style={{
              background: 'linear-gradient(90deg, #D49D33 0%, #FFDF00 100%)',
              color: '#0A0D14',
              padding: '4px 14px',
              borderRadius: '999px',
              fontSize: '11px',
              fontWeight: '800',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              boxShadow: '0 0 12px rgba(255, 223, 0, 0.35)',
              animation: 'pulseBadge 1.5s infinite alternate',
              marginTop: '4px'
            }}>
              NEW BEST
            </div>
          ) : (
            <span style={{
              fontFamily: 'var(--font-primary)',
              fontSize: '13px',
              color: 'var(--pm-text-tertiary)',
              fontWeight: '500'
            }}>
              Best Run: <strong style={{ color: 'var(--pm-text-secondary)' }}>{highScore}</strong>
            </span>
          )}
        </div>

        {/* Interactive Gradient Control Buttons */}
        <div style={{ zIndex: 1, width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Play Again Button */}
          <button
            onClick={onRestart}
            onMouseEnter={() => setIsBtnHovered(true)}
            onMouseLeave={() => setIsBtnHovered(false)}
            style={{
              width: '100%',
              height: '50px',
              background: `linear-gradient(90deg, ${accentColor} 0%, #219B86 100%)`,
              border: 'none',
              borderRadius: '12px',
              color: '#ffffff',
              fontSize: '15px',
              fontFamily: 'var(--font-primary)',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isBtnHovered 
                ? `0 8px 24px ${accentColor}55`
                : `0 4px 14px ${accentColor}25`,
              transform: isBtnHovered ? 'translateY(-2px)' : 'translateY(0)',
              transition: 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              outline: 'none'
            }}
          >
            Play Again
          </button>

          {/* Tweak Settings Button */}
          <button
            onClick={onTweakSettings}
            onMouseEnter={() => setIsTweakHovered(true)}
            onMouseLeave={() => setIsTweakHovered(false)}
            style={{
              width: '100%',
              height: '46px',
              background: isTweakHovered ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              color: isTweakHovered ? '#ffffff' : 'var(--pm-text-secondary)',
              fontSize: '13px',
              fontFamily: 'var(--font-primary)',
              fontWeight: '600',
              cursor: 'pointer',
              transform: isTweakHovered ? 'translateY(-1px)' : 'translateY(0)',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none'
            }}
          >
            Tweak Settings
          </button>
        </div>

        {/* Subtitle Space Restart Indicator (Original exact phrasing, strictly No Emojis) */}
        <span style={{
          zIndex: 1,
          fontFamily: 'var(--font-primary)',
          fontSize: '12px',
          color: 'var(--pm-text-tertiary)',
          letterSpacing: '0.5px',
          animation: 'blinkText 1.4s infinite alternate',
          userSelect: 'none'
        }}>
          Tap or press SPACE to restart
        </span>
      </div>
    </div>
  );
};

export default GameOverOverlay;
