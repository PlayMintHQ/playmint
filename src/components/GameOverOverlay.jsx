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
    <div className="go-overlay">
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

        .go-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: rgba(5, 7, 12, 0.45);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          animation: fadeIn 0.35s ease-out;
          box-sizing: border-box;
          pointer-events: auto;
          padding: 16px;
        }
        
        .go-card {
          width: min(420px, 90%);
          padding: 40px 32px;
          border-radius: 24px;
          background: rgba(18, 24, 37, 0.82);
          border: 1px solid ${accentColor}2c;
          box-shadow: 0 24px 50px rgba(0, 0, 0, 0.55), 0 0 35px ${accentColor}12;
          text-align: center;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 28px;
          animation: scaleUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-sizing: border-box;
        }

        .go-aura {
          position: absolute;
          top: -15%;
          left: 50%;
          transform: translateX(-50%);
          width: 240px;
          height: 240px;
          border-radius: 50%;
          background: radial-gradient(circle, ${accentColor}1c 0%, transparent 70%);
          pointer-events: none;
          filter: blur(20px);
          z-index: 0;
        }

        .go-title-sec {
          z-index: 1;
          width: 100%;
        }

        .go-title {
          font-family: var(--font-heading);
          font-weight: 900;
          font-size: clamp(28px, 6vw, 38px);
          letter-spacing: 3px;
          color: ${isWin ? '#00FF99' : '#FF4B4B'};
          text-shadow: 0 0 20px ${isWin ? 'rgba(0, 255, 153, 0.35)' : 'rgba(255, 75, 75, 0.35)'};
          margin: 0;
          text-transform: uppercase;
        }

        .go-separator {
          width: 60px;
          height: 3px;
          background: linear-gradient(90deg, ${accentColor}, transparent);
          margin: 12px auto 0 auto;
          border-radius: 2px;
          opacity: 0.6;
        }

        .go-score-sec {
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }

        .go-score-label {
          font-family: var(--font-primary);
          font-size: 12px;
          color: var(--pm-text-secondary);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1.5px;
        }

        .go-score-num {
          font-family: var(--font-heading);
          font-size: 56px;
          font-weight: 900;
          color: #ffffff;
          line-height: 1;
          margin: 4px 0;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
        }

        .go-score-best {
          font-family: var(--font-primary);
          font-size: 13px;
          color: var(--pm-text-tertiary);
          font-weight: 500;
        }

        .go-btn-sec {
          z-index: 1;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .go-indicator {
          z-index: 1;
          font-family: var(--font-primary);
          font-size: 12px;
          color: var(--pm-text-tertiary);
          letter-spacing: 0.5px;
          animation: blinkText 1.4s infinite alternate;
          user-select: none;
        }

        /* Responsive styling for portrait mobile */
        @media (max-width: 480px) {
          .go-card {
            padding: 24px 20px;
            gap: 16px;
            border-radius: 20px;
          }
          .go-score-num {
            font-size: 42px;
          }
          .go-title {
            font-size: 26px;
          }
          .go-btn-sec {
            gap: 8px;
          }
          .go-indicator {
            font-size: 11px;
          }
        }

        /* Responsive styling for landscape/low-height mobile viewports */
        @media (max-height: 520px) {
          .go-card {
            padding: 16px 24px;
            gap: 8px;
            border-radius: 16px;
            flex-direction: row;
            flex-wrap: wrap;
            width: min(540px, 95%);
            justify-content: space-around;
            align-items: center;
          }
          .go-aura {
            display: none;
          }
          .go-title-sec {
            width: 100%;
            margin-bottom: 2px;
          }
          .go-title {
            font-size: 20px;
          }
          .go-separator {
            margin: 4px auto 0 auto;
          }
          .go-score-sec {
            width: 45%;
            gap: 2px;
          }
          .go-score-num {
            font-size: 32px;
          }
          .go-btn-sec {
            width: 45%;
            gap: 6px;
          }
          .go-indicator {
            width: 100%;
            font-size: 10px;
            margin-top: 4px;
          }
        }
      `}</style>

      {/* Main Glassmorphism Overlay Card */}
      <div className="go-card">
        {/* Soft Radial Ambient Aura matching the active theme key */}
        <div className="go-aura" />

        {/* Title Section (Original Exact Wording, strictly No Emojis) */}
        <div className="go-title-sec">
          <h1 className="go-title">
            {isWin ? 'YOU WIN!' : 'GAME OVER'}
          </h1>
          <div className="go-separator" />
        </div>

        {/* Score & Record Display Section */}
        <div className="go-score-sec">
          <span className="go-score-label">
            Score
          </span>
          <span className="go-score-num">
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
            <span className="go-score-best">
              Best Run: <strong style={{ color: 'var(--pm-text-secondary)' }}>{highScore}</strong>
            </span>
          )}
        </div>

        {/* Interactive Gradient Control Buttons */}
        <div className="go-btn-sec">
          {/* Play Again Button */}
          <button
            onClick={onRestart}
            onMouseEnter={() => setIsBtnHovered(true)}
            onMouseLeave={() => setIsBtnHovered(false)}
            style={{
              width: '100%',
              height: '46px',
              background: `linear-gradient(90deg, ${accentColor} 0%, #219B86 100%)`,
              border: 'none',
              borderRadius: '12px',
              color: '#ffffff',
              fontSize: '14px',
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
              height: '42px',
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
        <span className="go-indicator">
          Tap or press SPACE to restart
        </span>
      </div>
    </div>
  );
};

export default GameOverOverlay;
