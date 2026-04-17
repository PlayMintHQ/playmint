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
          return { presetKey: 'custom', liveParams: importedConfig };
        }
      } catch (error) {
        console.error('Failed to parse config from URL:', error);
      }
    }
  }
  return { presetKey: 'standard', liveParams: { ...GAME_PRESETS['standard'] } };
};

function App() {
  const [initialConfig] = useState(getInitialState);
  const [presetKey, setPresetKey] = useState(initialConfig.presetKey);
  const [liveParams, setLiveParams] = useState(initialConfig.liveParams);
  const fullscreenContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // New states for inline Import/Export UI
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
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const handleFullscreen = () => {
    if (fullscreenContainerRef.current && !document.fullscreenElement) {
      fullscreenContainerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
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
    setLiveParams({ ...GAME_PRESETS[key] });
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
        setLiveParams(importedConfig);
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
    <div style={{ textAlign: 'center', fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#111827', minHeight: '100vh', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: '30px' }}>
        <img src="/assets/Logo_PlayMint_(transparent).png" alt="PlayMint" style={{ height: '160px', marginBottom: '5px' }} />
        <h1 style={{ margin: '0', color: '#ffffff', fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '2.5rem', fontWeight: '900', letterSpacing: '2px', textTransform: 'uppercase', textShadow: '2px 4px 6px rgba(0,0,0,0.5)' }}>PlayMint</h1>
      </div>

      <div style={{ position: 'relative', marginBottom: '20px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: '6px' }}>
          <span style={{ marginRight: '4px', fontWeight: 'bold', color: '#9ca3af', fontSize: '14px' }}>Play:</span>
          {Object.keys(GAME_PRESETS).map((key) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              style={{
                padding: '10px 20px',
                backgroundColor: presetKey === key ? '#3182ce' : '#1f2937',
                color: presetKey === key ? '#ffffff' : '#d1d5db',
                border: presetKey === key ? '2px solid #3182ce' : '2px solid #374151',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                boxShadow: presetKey === key ? '0 4px 6px rgba(49, 130, 206, 0.2)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              {GAME_PRESETS[key].name}
            </button>
          ))}

          <span style={{ margin: '0 6px', color: '#4b5563', fontWeight: 'bold', fontSize: '18px' }}>|</span>
          <span style={{ marginRight: '4px', fontWeight: 'bold', color: '#9ca3af', fontSize: '14px' }}>Create:</span>
          <button
            onClick={handleCustomSelect}
            style={{
              padding: '10px 20px',
              backgroundColor: isCustom ? '#dd6b20' : '#1f2937',
              color: isCustom ? '#ffffff' : '#d1d5db',
              border: isCustom ? '2px solid #dd6b20' : '2px solid #374151',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              boxShadow: isCustom ? '0 4px 6px rgba(221, 107, 32, 0.2)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            Custom
          </button>

          <button
            onClick={handleFullscreen}
            style={{
              marginLeft: '6px',
              padding: '10px 20px',
              backgroundColor: '#48bb78',
              color: '#ffffff',
              border: '2px solid #48bb78',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              boxShadow: '0 4px 6px rgba(72, 187, 120, 0.2)',
              transition: 'all 0.2s ease'
            }}
          >
            Go Fullscreen ⛶
          </button>
        </div>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'stretch',
        width: '100%',
        margin: '0 auto',
      }}>

        {!isFullscreen && (
          <div style={{ width: '260px', flexShrink: 0, marginRight: '20px' }}></div>
        )}

        <div
          ref={fullscreenContainerRef}
          style={{
            width: isFullscreen ? '100vw' : '800px',
            flexShrink: 0,
            position: 'relative',
            backgroundColor: isFullscreen ? '#000' : 'transparent',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: isFullscreen ? '100vh' : '480px',
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

        {!isFullscreen && (
          <div style={{ width: '260px', flexShrink: 0, marginLeft: '20px' }}>
            {isCustom && (
              <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#fff',
                padding: '20px',
                borderRadius: '0',
                boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                boxSizing: 'border-box'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', color: '#2d3748' }}>Custom Mode</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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

                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                        style={{ width: '100%', padding: '8px 0', background: exportStatus === 'linkCopied' ? '#2f855a' : '#805ad5', color: '#ffffff', border: 'none', borderRadius: '0', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'background 0.2s ease', marginBottom: '8px' }}
                      >
                        {exportStatus === 'linkCopied' ? 'Link Copied!' : 'Copy Share Link'}
                      </button>
                      <button
                        onClick={handleExport}
                        style={{ width: '100%', padding: '8px 0', background: exportStatus === 'copied' ? '#2f855a' : '#48bb78', color: '#ffffff', border: 'none', borderRadius: '0', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'background 0.2s ease', marginBottom: '8px' }}
                      >
                        {exportStatus === 'copied' ? 'Copied to Clipboard!' : 'Export Config (JSON)'}
                      </button>
                      <button
                        onClick={handleImportToggle}
                        style={{ width: '100%', padding: '8px 0', background: '#3182ce', color: '#ffffff', border: 'none', borderRadius: '0', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                      >
                        Import Config (JSON)
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setLiveParams({ ...GAME_PRESETS['standard'] });
                      setIsImporting(false); // Reset import view on reset
                    }}
                    style={{ width: '100%', padding: '8px 0', background: '#edf2f7', color: '#4a5568', border: 'none', borderRadius: '0', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                  >
                    Reset to Default
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <p style={{ color: '#9ca3af', marginTop: '12px', fontSize: '1rem', fontWeight: '500' }}>
        Click or press <kbd style={{ background: '#374151', padding: '4px 8px', borderRadius: '6px', border: '1px solid #4b5563', boxShadow: '0 2px 0 #111827', color: '#f3f4f6', fontFamily: 'monospace', fontWeight: 'bold' }}>SPACE</kbd> to jump
      </p>
    </div>
  );
}

export default App;
