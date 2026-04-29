import React, { useState, useRef, useEffect } from 'react';
import GameComponent from './GameComponent';
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
  const fullscreenContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFullscreenSupported, setIsFullscreenSupported] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSelectorOpen, setIsSelectorOpen] = useState(!initialConfig.isImported);
  const [score, setScore] = useState(0);

  const [exportStatus, setExportStatus] = useState('idle');
  const [isImporting, setIsImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#config=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

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

  useEffect(() => {
    const handleScoreUpdate = (e) => setScore(e.detail);
    window.addEventListener('update-score', handleScoreUpdate);
    return () => window.removeEventListener('update-score', handleScoreUpdate);
  }, []);

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

  if (typeof window !== 'undefined') {
    window.__GAME_LIVE_CONFIG = liveParams;
  }

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('update-game-config', { detail: liveParams }));
  }, [liveParams]);

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

  const handleExport = () => {
    try {
      const configString = JSON.stringify(liveParams, null, 2);
      navigator.clipboard.writeText(configString);
      setExportStatus('copied');
      setTimeout(() => setExportStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to copy config to clipboard:', error);
    }
  };

  const handleShareLink = () => {
    try {
      const configString = JSON.stringify(liveParams);
      const encodedConfig = btoa(configString);
      const shareUrl = `${window.location.origin}${window.location.pathname}${window.location.search}#config=${encodedConfig}`;
      navigator.clipboard.writeText(shareUrl);
      setExportStatus('linkCopied');
      setTimeout(() => setExportStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to copy link to clipboard:', error);
    }
  };

  const handleImportToggle = () => {
    setIsImporting(true);
    setImportText('');
    setImportError('');
  };

  const handleImportApply = () => {
    try {
      const importedConfig = JSON.parse(importText);
      if (typeof importedConfig === 'object' && importedConfig !== null && Object.keys(importedConfig).length > 0) {
        setLiveParams({ gameName: 'PlayMint Core', ...importedConfig });
        setPresetKey('custom');
        setIsImporting(false);
        setImportError('');
      } else {
        setImportError('Invalid format.');
      }
    } catch (error) {
      console.error('Failed to import configuration:', error);
      setImportError('Invalid JSON.');
    }
  };

  const handleImportCancel = () => {
    setIsImporting(false);
    setImportError('');
  };

  const isCustom = presetKey === 'custom';

  return (
    <div ref={fullscreenContainerRef} style={{ position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden' }}>
      
      {/* Game Selector Modal Layer */}
      {isSelectorOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 11000, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', overflowY: 'auto', background: 'rgba(11, 14, 20, 0.95)', backdropFilter: 'blur(10px)' }}>
          <img src="/assets/Logo_PlayMint_(transparent).png" alt="PlayMint" style={{ height: '40px', marginBottom: '30px' }} />
          <h2 className="pm-heading" style={{ color: '#fff', fontSize: 'clamp(24px, 5vw, 36px)', margin: '0 0 40px 0', fontFamily: 'var(--font-game)', letterSpacing: '2px' }}>SELECT MODE</h2>
          
          <div style={{ maxWidth: '1000px', width: '100%' }}>
            <h3 className="pm-heading" style={{ color: 'var(--pm-accent-teal)', marginBottom: '8px', fontSize: '20px', textAlign: 'left' }}>Available Now</h3>
            <div style={{ height: '2px', background: 'linear-gradient(90deg, var(--pm-accent-teal) 0%, transparent 100%)', marginBottom: '30px', width: '100%' }}></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px', marginBottom: '50px' }}>
              
              {/* Runner */}
              <div 
                className="pm-card"
                onClick={() => { applyPreset('standard'); setIsSelectorOpen(false); }}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '30px 20px', border: presetKey === 'standard' ? '2px solid var(--pm-accent-teal)' : '2px solid transparent', background: 'radial-gradient(circle at bottom left, rgba(33, 155, 134, 0.15), var(--pm-bg-panel-light) 70%)' }}
              >
                <h4 className="pm-heading" style={{ margin: '0', fontSize: '20px' }}>Runner</h4>
              </div>

              {/* Action Quest */}
              <div 
                className="pm-card"
                onClick={() => { applyPreset('action_quest'); setIsSelectorOpen(false); }}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '30px 20px', border: presetKey === 'action_quest' ? '2px solid var(--pm-accent-teal)' : '2px solid transparent', background: 'radial-gradient(circle at bottom right, rgba(212, 157, 51, 0.15), var(--pm-bg-panel-light) 70%)' }}
              >
                <h4 className="pm-heading" style={{ margin: '0', fontSize: '20px' }}>Action Quest</h4>
              </div>
            </div>

            <h3 className="pm-heading" style={{ color: 'var(--pm-text-secondary)', borderBottom: '1px solid var(--pm-border)', paddingBottom: '15px', marginBottom: '30px', fontSize: '16px' }}>Coming Soon</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
              {['Empire Builder', 'RPG Adventure', 'Fighting Arena', 'Racing Rush', 'Shooter Arena', 'Survival Mode', 'Simulator World'].map(name => (
                <div key={name} className="pm-card" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.5 }}>
                  <span style={{ fontSize: '14px', fontWeight: '500' }}>{name}</span>
                  <span className="pm-badge" style={{ background: 'var(--pm-bg-main)', color: 'var(--pm-text-tertiary)' }}>LOCKED</span>
                </div>
              ))}
            </div>
          </div>
          
          <button 
            className="pm-btn pm-btn-outline"
            onClick={() => setIsSelectorOpen(false)}
            style={{ marginTop: '50px' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Unified HUD Header */}
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%',
        padding: 'clamp(10px, 2vw, 20px) clamp(15px, 3vw, 30px)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        zIndex: 900, boxSizing: 'border-box', pointerEvents: 'none',
        background: 'linear-gradient(to bottom, rgba(11,14,20,0.8) 0%, transparent 100%)'
      }}>
        {/* LEFT COLUMN: Logo */}
        <div style={{ flex: '0 1 auto', display: 'flex', alignItems: 'center', pointerEvents: 'auto' }}>
          <img src="/assets/Logo_PlayMint_(transparent).png" alt="PlayMint" style={{ height: 'clamp(24px, 4vw, 32px)' }} />
        </div>

        {/* CENTER COLUMN: Title */}
        {liveParams.gameName && (
          <div style={{ 
            position: 'absolute', left: '50%', transform: 'translateX(-50%)', 
            zIndex: 1, pointerEvents: 'none'
          }}>
            <h1 style={{
              margin: '0', color: 'var(--pm-text-primary)', fontFamily: 'var(--font-game)',
              fontStyle: 'italic', fontSize: 'clamp(20px, 4vw, 36px)', fontWeight: '900',
              letterSpacing: '1px', textTransform: 'uppercase',
              textShadow: '2px 2px 0 #000, 4px 4px 15px rgba(0,229,153,0.3)',
              lineHeight: 1.1, whiteSpace: 'nowrap'
            }}>
              {liveParams.gameName}
            </h1>
          </div>
        )}

        {/* RIGHT COLUMN: Controls & Profile */}
        <div style={{ flex: '0 1 auto', display: 'flex', alignItems: 'center', gap: '16px', pointerEvents: 'auto' }}>
          <div className="pm-btn-outline" style={{
            fontSize: 'clamp(14px, 3vw, 18px)', fontWeight: '700', color: '#fff',
            fontFamily: 'var(--font-heading)', letterSpacing: '1px',
            padding: '8px 16px', borderRadius: '12px', cursor: 'default', pointerEvents: 'none'
          }}>
            SCORE: <span style={{ color: 'var(--pm-accent-teal)' }}>{score}</span>
          </div>

          {!isFullscreen && isFullscreenSupported && (
            <button className="pm-btn pm-btn-outline" onClick={handleFullscreen} style={{ padding: '8px', borderRadius: '8px' }} title="Fullscreen">⛶</button>
          )}
          {isFullscreen && (
            <button className="pm-btn pm-btn-danger" onClick={handleExitFullscreen} style={{ padding: '8px', borderRadius: '8px' }} title="Exit Fullscreen">✖</button>
          )}
          
          <button className="pm-btn pm-btn-primary" onClick={() => setIsMenuOpen(true)}>
            ☰
          </button>
        </div>
      </div>

      {/* Side Menu Panel (Editor Customize) */}
      <div 
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className="pm-glass-panel"
        style={{
          position: 'fixed', top: 0, right: 0, height: '100dvh',
          width: '100vw', maxWidth: '380px',
          transform: isMenuOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)', zIndex: 1000,
          overflowY: 'auto', display: 'flex', flexDirection: 'column',
          borderLeft: '1px solid var(--pm-border)'
        }}
      >
        <div style={{ padding: '24px', borderBottom: '1px solid var(--pm-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="pm-heading" style={{ fontSize: '20px', margin: 0 }}>Creator Panel</h2>
          </div>
          <button onClick={() => setIsMenuOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--pm-text-secondary)', fontSize: '24px', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <button className="pm-btn pm-btn-primary" style={{ justifyContent: 'center' }} onClick={() => { setIsSelectorOpen(true); setIsMenuOpen(false); }}>
            Change Mode
          </button>

          <div>
            <label className="pm-label">Game Title:</label>
            <input
              type="text"
              name="gameName"
              className="pm-input"
              value={liveParams.gameName || ''}
              onChange={(e) => setLiveParams(prev => ({ ...prev, gameName: e.target.value }))}
              placeholder="Enter Game Name"
            />
          </div>

          <div>
            <label className="pm-label">Mode Options:</label>
            <button 
              onClick={() => setPresetKey('custom')}
              className={`pm-btn ${isCustom ? 'pm-btn-primary' : 'pm-btn-outline'}`}
              style={{ width: '100%', padding: '10px' }}
            >
              Custom Tuning
            </button>
          </div>

          {isCustom && (
            <div className="pm-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h3 className="pm-heading" style={{ fontSize: '16px', margin: 0, borderBottom: '1px solid var(--pm-border)', paddingBottom: '10px' }}>Physics & Gameplay</h3>
                
              {liveParams.gameType === 'runner' ? (
                <>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <label className="pm-label" style={{ margin: 0 }}>Speed</label>
                      <span style={{ fontSize: '13px', color: 'var(--pm-accent-teal)', fontWeight: '600' }}>{Math.round(liveParams.runSpeed || 350)}</span>
                    </div>
                    <input type="range" className="pm-slider" name="runSpeed" min="100" max="1000" step="10" value={liveParams.runSpeed || 350} onChange={handleSliderChange} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <label className="pm-label" style={{ margin: 0 }}>Jump Force</label>
                      <span style={{ fontSize: '13px', color: 'var(--pm-accent-teal)', fontWeight: '600' }}>{Math.round(liveParams.jumpForce || 750)}</span>
                    </div>
                    <input type="range" className="pm-slider" name="jumpForce" min="200" max="1500" step="10" value={liveParams.jumpForce || 750} onChange={handleSliderChange} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <label className="pm-label" style={{ margin: 0 }}>Gravity</label>
                      <span style={{ fontSize: '13px', color: 'var(--pm-accent-teal)', fontWeight: '600' }}>{Math.round(liveParams.gravity || 1800)}</span>
                    </div>
                    <input type="range" className="pm-slider" name="gravity" min="500" max="3500" step="50" value={liveParams.gravity || 1800} onChange={handleSliderChange} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <label className="pm-label" style={{ margin: 0 }}>Spawn Delay (ms)</label>
                      <span style={{ fontSize: '13px', color: 'var(--pm-accent-teal)', fontWeight: '600' }}>{Math.round(liveParams.obstacleDelay || 1200)}</span>
                    </div>
                    <input type="range" className="pm-slider" name="obstacleDelay" min="400" max="2500" step="100" value={liveParams.obstacleDelay || 1200} onChange={handleSliderChange} />
                  </div>
                </>
              ) : liveParams.gameType === 'platformer' ? (
                <>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <label className="pm-label" style={{ margin: 0 }}>Jump Height</label>
                      <span style={{ fontSize: '13px', color: 'var(--pm-accent-teal)', fontWeight: '600' }}>{Math.round(liveParams.actionJumpHeight || 600)}</span>
                    </div>
                    <input type="range" className="pm-slider" name="actionJumpHeight" min="200" max="1500" step="10" value={liveParams.actionJumpHeight || 600} onChange={handleSliderChange} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <label className="pm-label" style={{ margin: 0 }}>Gravity</label>
                      <span style={{ fontSize: '13px', color: 'var(--pm-accent-teal)', fontWeight: '600' }}>{Math.round(liveParams.actionGravity || 1500)}</span>
                    </div>
                    <input type="range" className="pm-slider" name="actionGravity" min="500" max="3500" step="50" value={liveParams.actionGravity || 1500} onChange={handleSliderChange} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <label className="pm-label" style={{ margin: 0 }}>Enemy Count</label>
                      <span style={{ fontSize: '13px', color: 'var(--pm-accent-teal)', fontWeight: '600' }}>{Math.round(liveParams.actionEnemyCount || 5)}</span>
                    </div>
                    <input type="range" className="pm-slider" name="actionEnemyCount" min="0" max="20" step="1" value={liveParams.actionEnemyCount || 5} onChange={handleSliderChange} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                    <label className="pm-label" style={{ margin: 0 }}>Enable Projectiles</label>
                    <input type="checkbox" checked={!!liveParams.actionProjectileEnabled} onChange={(e) => setLiveParams(prev => ({ ...prev, actionProjectileEnabled: e.target.checked }))} style={{ accentColor: 'var(--pm-accent-teal)', width: '20px', height: '20px', cursor: 'pointer' }} />
                  </div>
                </>
              ) : (
                <div style={{ color: 'var(--pm-text-tertiary)', fontSize: '13px', fontStyle: 'italic', textAlign: 'center' }}>
                  No physics parameters available.
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {isImporting ? (
              <div className="pm-card" style={{ padding: '16px' }}>
                <label className="pm-label">Paste Config JSON</label>
                <textarea
                  className="pm-input"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  style={{ height: '80px', fontFamily: 'monospace', marginBottom: '10px' }}
                />
                {importError && <p style={{ color: '#ef4444', fontSize: '12px', marginBottom: '10px' }}>{importError}</p>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button className="pm-btn pm-btn-primary" onClick={handleImportApply} style={{ padding: '8px' }}>Apply</button>
                  <button className="pm-btn pm-btn-outline" onClick={handleImportCancel} style={{ padding: '8px' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <button className="pm-btn pm-btn-outline" onClick={handleShareLink} style={{ color: exportStatus === 'linkCopied' ? 'var(--pm-accent-teal)' : '' }}>
                  {exportStatus === 'linkCopied' ? '✓ Link Copied' : 'Copy Share Link'}
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button className="pm-btn pm-btn-outline" onClick={handleExport} style={{ padding: '8px' }}>
                    {exportStatus === 'copied' ? '✓ Copied' : 'Export Config'}
                  </button>
                  <button className="pm-btn pm-btn-outline" onClick={handleImportToggle} style={{ padding: '8px' }}>Import Config</button>
                </div>
                <button
                  className="pm-btn pm-btn-muted"
                  onClick={() => {
                    setLiveParams(prev => ({ ...GAME_PRESETS['standard'], gameName: 'PlayMint Core' }));
                    setIsImporting(false);
                    setPresetKey('standard');
                  }}
                  style={{ marginTop: '4px' }}
                >
                  Reset to Default
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Game Container */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <GameComponent isFullscreen={isFullscreen} />
        </div>
      </div>

      {liveParams.gameType === 'runner' && (
        <div style={{ position: 'fixed', bottom: '30px', width: '100%', textAlign: 'center', zIndex: 10, pointerEvents: 'none' }}>
          <p style={{ margin: 0, color: 'var(--pm-text-secondary)', fontSize: '14px', background: 'var(--pm-bg-panel)', padding: '8px 16px', display: 'inline-block', borderRadius: '20px', border: '1px solid var(--pm-border)', boxShadow: 'var(--pm-shadow-panel)' }}>
            Tap or press <span style={{ background: 'var(--pm-bg-input)', padding: '2px 8px', borderRadius: '4px', color: 'var(--pm-accent-teal)', fontFamily: 'monospace', fontWeight: 'bold' }}>SPACE</span> to jump
          </p>
        </div>
      )}

    </div>
  );
}

export default App;
