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
          if (!importedConfig.gameName) importedConfig.gameName = 'My Runner Game';
          return { presetKey: 'custom', liveParams: importedConfig };
        }
      } catch (error) {
        console.error('Failed to parse config from URL:', error);
      }
    }
  }
  return { presetKey: 'standard', liveParams: { ...GAME_PRESETS['standard'], gameName: 'My Runner Game' } };
};

function App() {
  const [initialConfig] = useState(getInitialState);
  const [presetKey, setPresetKey] = useState(initialConfig.presetKey);
  const [liveParams, setLiveParams] = useState(initialConfig.liveParams);
  const fullscreenContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [score, setScore] = useState(0);

  // New states for inline Import/Export UI
  const [exportStatus, setExportStatus] = useState('idle');
  const [isImporting, setIsImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#config=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
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

  // Sync synchronously to window so Phaser picks it up correctly on initial mount
  if (typeof window !== 'undefined') {
    window.__GAME_LIVE_CONFIG = liveParams;
  }

  // Emit event to update already running game instance
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
    // Switching to a preset snaps liveParams to that preset's values,
    // so the game updates live and sliders reflect where you left off if
    // you switch back to Custom.
    // Preserve the custom name.
    setLiveParams(prev => ({ ...GAME_PRESETS[key], gameName: prev.gameName }));
  };

  const handleCustomSelect = () => {
    // Entering Custom mode: keep current liveParams as-is so the game
    // doesn't jump, and reveal the panel for editing.
    setPresetKey('custom');
  };

  const handleExport = () => {
    try {
      const configString = JSON.stringify(liveParams, null, 2);
      navigator.clipboard.writeText(configString);
      setExportStatus('copied');
      setTimeout(() => setExportStatus('idle'), 2000); // Reset text after 2 seconds
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
        setLiveParams({ gameName: 'My Runner Game', ...importedConfig });
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
    <div ref={fullscreenContainerRef} style={{ textAlign: 'center', fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#111827', minHeight: '100dvh', padding: '0', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
      
      {/* Unified HUD Header */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        padding: '10px 15px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        zIndex: 900,
        boxSizing: 'border-box',
        pointerEvents: 'none'
      }}>
        {/* LEFT COLUMN: Logo */}
        <div style={{ flex: '1 1 0', display: 'flex', justifyContent: 'flex-start', pointerEvents: 'auto' }}>
          <img src="/assets/Logo_PlayMint_(transparent).png" alt="PlayMint" style={{ height: 'clamp(35px, 8vw, 80px)' }} />
        </div>

        {/* CENTER COLUMN: Title */}
        {liveParams.gameName && (
          <div style={{ flex: '2 1 auto', display: 'flex', justifyContent: 'center', textAlign: 'center' }}>
            <h1 style={{
              margin: '0',
              color: '#ffffff',
              fontFamily: '"Impact", "Arial Black", sans-serif',
              fontStyle: 'italic',
              fontSize: 'clamp(18px, 5vw, 48px)',
              fontWeight: '900',
              letterSpacing: '1px',
              textTransform: 'uppercase',
              textShadow: '2px 2px 0 #000, 3px 3px 0 rgba(0,0,0,0.5)',
              lineHeight: 1.1,
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              pointerEvents: 'none'
            }}>
              {liveParams.gameName}
            </h1>
          </div>
        )}

        {/* RIGHT COLUMN: Score & Controls */}
        <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', pointerEvents: 'auto' }}>
          
          {/* Score */}
          <div style={{
            fontSize: 'clamp(16px, 4vw, 24px)',
            fontWeight: '900',
            color: '#ffffff',
            textShadow: '2px 2px 0 #000, 3px 3px 0 rgba(0,0,0,0.5)',
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontStyle: 'italic',
            letterSpacing: '1px',
            lineHeight: 1,
            whiteSpace: 'nowrap'
          }}>
            SCORE: {score}
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {!isFullscreen && (
              <button
                onClick={handleFullscreen}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#48bb78',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '18px',
                  lineHeight: 1
                }}
                title="Go Fullscreen"
              >
                ⛶
              </button>
            )}
            <button
              onClick={() => setIsMenuOpen(true)}
              style={{
                padding: '8px 12px',
                backgroundColor: '#374151',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span style={{ fontSize: '18px', lineHeight: 1 }}>☰</span>
            </button>
          </div>
        </div>
      </div>

      {/* Side Menu Panel */}
      <div 
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100dvh',
          maxHeight: '-webkit-fill-available',
          width: '100vw',
          maxWidth: '340px',
          backgroundColor: '#1f2937',
          boxShadow: '-4px 0 15px rgba(0,0,0,0.5)',
          transform: isMenuOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease-in-out',
          zIndex: 1000,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: 'auto',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box'
        }}
      >
        {/* Menu Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid #374151' }}>
          <h2 style={{ margin: 0, color: '#ffffff', fontSize: '18px' }}>Settings</h2>
          <button
            onClick={() => setIsMenuOpen(false)}
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: '24px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Menu Content */}
        <div style={{ padding: '20px', paddingBottom: '80px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div>
            <span style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#9ca3af', fontSize: '14px', textAlign: 'left' }}>Game Name:</span>
            <input
              type="text"
              name="gameName"
              value={liveParams.gameName || ''}
              onChange={(e) => setLiveParams(prev => ({ ...prev, gameName: e.target.value }))}
              placeholder="Enter Game Name"
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: '#2d3748',
                color: '#ffffff',
                border: '1px solid #4a5568',
                borderRadius: '8px',
                fontSize: '14px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <span style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#9ca3af', fontSize: '14px', textAlign: 'left' }}>Play Preset:</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {Object.keys(GAME_PRESETS).map((key) => (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  style={{
                    flex: '1 1 45%',
                    padding: '8px 10px',
                    backgroundColor: presetKey === key ? '#3182ce' : '#2d3748',
                    color: presetKey === key ? '#ffffff' : '#d1d5db',
                    border: presetKey === key ? '2px solid #3182ce' : '2px solid #4a5568',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '13px',
                    boxShadow: presetKey === key ? '0 4px 6px rgba(49, 130, 206, 0.2)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {GAME_PRESETS[key].name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#9ca3af', fontSize: '14px', textAlign: 'left' }}>Mode:</span>
            <button
              onClick={handleCustomSelect}
              style={{
                width: '100%',
                padding: '10px 20px',
                backgroundColor: isCustom ? '#dd6b20' : '#2d3748',
                color: isCustom ? '#ffffff' : '#d1d5db',
                border: isCustom ? '2px solid #dd6b20' : '2px solid #4a5568',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                boxShadow: isCustom ? '0 4px 6px rgba(221, 107, 32, 0.2)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              Custom Tuning
            </button>
          </div>

          {isCustom && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#fff',
              padding: '15px',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
              boxSizing: 'border-box'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#4a5568' }}>Speed</label>
                    <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#dd6b20' }}>{Math.round(liveParams.runSpeed)}</span>
                  </div>
                  <input type="range" name="runSpeed" min="100" max="1000" step="10" value={liveParams.runSpeed} onChange={handleSliderChange} style={{ width: '100%', accentColor: '#dd6b20' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#4a5568' }}>Jump Force</label>
                    <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#dd6b20' }}>{Math.round(liveParams.jumpForce)}</span>
                  </div>
                  <input type="range" name="jumpForce" min="200" max="1500" step="10" value={liveParams.jumpForce} onChange={handleSliderChange} style={{ width: '100%', accentColor: '#dd6b20' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#4a5568' }}>Gravity</label>
                    <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#dd6b20' }}>{Math.round(liveParams.gravity)}</span>
                  </div>
                  <input type="range" name="gravity" min="500" max="3500" step="50" value={liveParams.gravity} onChange={handleSliderChange} style={{ width: '100%', accentColor: '#dd6b20' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#4a5568' }}>Spawn Delay (ms)</label>
                    <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#dd6b20' }}>{Math.round(liveParams.obstacleDelay)}</span>
                  </div>
                  <input type="range" name="obstacleDelay" min="400" max="2500" step="100" value={liveParams.obstacleDelay} onChange={handleSliderChange} style={{ width: '100%', accentColor: '#dd6b20' }} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {isImporting ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', backgroundColor: '#f7fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    <textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder="Paste JSON here..."
                      style={{ width: '100%', height: '80px', fontSize: '11px', padding: '6px', border: '1px solid #cbd5e0', borderRadius: '4px', boxSizing: 'border-box', fontFamily: 'monospace' }}
                    />
                    {importError && <span style={{ color: '#e53e3e', fontSize: '11px', fontWeight: 'bold' }}>{importError}</span>}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={handleImportApply}
                        style={{ flex: 1, padding: '6px 0', background: '#3182ce', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                      >
                        Apply
                      </button>
                      <button
                        onClick={handleImportCancel}
                        style={{ flex: 1, padding: '6px 0', background: '#e2e8f0', color: '#4a5568', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={handleShareLink}
                      style={{ width: '100%', padding: '8px 0', background: exportStatus === 'linkCopied' ? '#2f855a' : '#805ad5', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'background 0.2s ease' }}
                    >
                      {exportStatus === 'linkCopied' ? 'Link Copied!' : 'Copy Share Link'}
                    </button>
                    <button
                      onClick={handleExport}
                      style={{ width: '100%', padding: '8px 0', background: exportStatus === 'copied' ? '#2f855a' : '#48bb78', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'background 0.2s ease' }}
                    >
                      {exportStatus === 'copied' ? 'Copied to Clipboard!' : 'Export Config (JSON)'}
                    </button>
                    <button
                      onClick={handleImportToggle}
                      style={{ width: '100%', padding: '8px 0', background: '#3182ce', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                    >
                      Import Config (JSON)
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setLiveParams(prev => ({ ...GAME_PRESETS['standard'], gameName: prev.gameName }));
                    setIsImporting(false);
                  }}
                  style={{ width: '100%', padding: '8px 0', background: '#edf2f7', color: '#4a5568', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginTop: '4px' }}
                >
                  Reset to Default
                </button>
              </div>
            </div>
          )}
        </div>
      </div>



      {/* Main Game Container */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100vw',
        height: '100dvh',
        position: 'relative'
      }}>
        <div
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            backgroundColor: 'transparent',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            touchAction: 'none'
          }}
        >
          <GameComponent isFullscreen={isFullscreen} />
          {isFullscreen && (
            <button
              onClick={handleExitFullscreen}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                padding: '10px 15px',
                backgroundColor: 'rgba(0,0,0,0.6)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                zIndex: 100
              }}
            >
              ✖ Exit Fullscreen
            </button>
          )}
        </div>
      </div>

      <p style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', margin: 0, color: '#9ca3af', fontSize: 'clamp(0.8rem, 4vw, 1rem)', fontWeight: '500', zIndex: 10, pointerEvents: 'none', textShadow: '1px 1px 2px #000', whiteSpace: 'nowrap' }}>
        Tap or press <kbd style={{ background: '#374151', padding: '4px 8px', borderRadius: '6px', border: '1px solid #4b5563', boxShadow: '0 2px 0 #111827', color: '#f3f4f6', fontFamily: 'monospace', fontWeight: 'bold' }}>SPACE</kbd> to jump
      </p>

    </div>
  );
}

export default App;
