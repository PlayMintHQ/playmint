import React, { useState } from 'react';
import { GAME_PRESETS } from '../gameConfig';

const RunnerControls = ({ liveParams, onSliderChange }) => (
  <>
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <label className="pm-label" style={{ margin: 0 }}>Speed</label>
        <span style={{ fontSize: '13px', color: 'var(--pm-accent-teal)', fontWeight: '600' }}>{Math.round(liveParams.runSpeed || 350)}</span>
      </div>
      <input type="range" className="pm-slider" name="runSpeed" min="100" max="1000" step="10" value={liveParams.runSpeed || 350} onChange={onSliderChange} />
    </div>
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <label className="pm-label" style={{ margin: 0 }}>Jump Force</label>
        <span style={{ fontSize: '13px', color: 'var(--pm-accent-teal)', fontWeight: '600' }}>{Math.round(liveParams.jumpForce || 750)}</span>
      </div>
      <input type="range" className="pm-slider" name="jumpForce" min="200" max="1500" step="10" value={liveParams.jumpForce || 750} onChange={onSliderChange} />
    </div>
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <label className="pm-label" style={{ margin: 0 }}>Gravity</label>
        <span style={{ fontSize: '13px', color: 'var(--pm-accent-teal)', fontWeight: '600' }}>{Math.round(liveParams.gravity || 1800)}</span>
      </div>
      <input type="range" className="pm-slider" name="gravity" min="500" max="3500" step="50" value={liveParams.gravity || 1800} onChange={onSliderChange} />
    </div>
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <label className="pm-label" style={{ margin: 0 }}>Spawn Delay (ms)</label>
        <span style={{ fontSize: '13px', color: 'var(--pm-accent-teal)', fontWeight: '600' }}>{Math.round(liveParams.obstacleDelay || 1200)}</span>
      </div>
      <input type="range" className="pm-slider" name="obstacleDelay" min="400" max="2500" step="100" value={liveParams.obstacleDelay || 1200} onChange={onSliderChange} />
    </div>
  </>
);

const PlatformerControls = ({ liveParams, onSliderChange }) => (
  <>
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <label className="pm-label" style={{ margin: 0 }}>Jump Height</label>
        <span style={{ fontSize: '13px', color: 'var(--pm-accent-teal)', fontWeight: '600' }}>{Math.round(liveParams.actionJumpHeight || 600)}</span>
      </div>
      <input type="range" className="pm-slider" name="actionJumpHeight" min="200" max="1500" step="10" value={liveParams.actionJumpHeight || 600} onChange={onSliderChange} />
    </div>
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <label className="pm-label" style={{ margin: 0 }}>Gravity</label>
        <span style={{ fontSize: '13px', color: 'var(--pm-accent-teal)', fontWeight: '600' }}>{Math.round(liveParams.actionGravity || 1500)}</span>
      </div>
      <input type="range" className="pm-slider" name="actionGravity" min="500" max="3500" step="50" value={liveParams.actionGravity || 1500} onChange={onSliderChange} />
    </div>
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <label className="pm-label" style={{ margin: 0 }}>Enemy Count</label>
        <span style={{ fontSize: '13px', color: 'var(--pm-accent-teal)', fontWeight: '600' }}>{Math.round(liveParams.actionEnemyCount || 5)}</span>
      </div>
      <input type="range" className="pm-slider" name="actionEnemyCount" min="0" max="20" step="1" value={liveParams.actionEnemyCount || 5} onChange={onSliderChange} />
    </div>
    {/* Temporarily disabled
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
      <label className="pm-label" style={{ margin: 0 }}>Enable Projectiles</label>
      <input type="checkbox" checked={!!liveParams.actionProjectileEnabled} onChange={(e) => setLiveParams(prev => ({ ...prev, actionProjectileEnabled: e.target.checked }))} style={{ accentColor: 'var(--pm-accent-teal)', width: '20px', height: '20px', cursor: 'pointer' }} />
    </div>
    */}
  </>
);

const ConfigActions = ({ liveParams, setLiveParams, setPresetKey }) => {
  const [exportStatus, setExportStatus] = useState('idle');
  const [isImporting, setIsImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');

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

  if (isImporting) {
    return (
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
          <button className="pm-btn pm-btn-outline" onClick={() => { setIsImporting(false); setImportError(''); }} style={{ padding: '8px' }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button className="pm-btn pm-btn-outline" onClick={handleShareLink} style={{ color: exportStatus === 'linkCopied' ? 'var(--pm-accent-teal)' : '' }}>
        {exportStatus === 'linkCopied' ? '✓ Link Copied' : 'Copy Share Link'}
      </button>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <button className="pm-btn pm-btn-outline" onClick={handleExport} style={{ padding: '8px' }}>
          {exportStatus === 'copied' ? '✓ Copied' : 'Export Config'}
        </button>
        <button className="pm-btn pm-btn-outline" onClick={() => { setIsImporting(true); setImportText(''); setImportError(''); }} style={{ padding: '8px' }}>Import Config</button>
      </div>
      <button
        className="pm-btn pm-btn-muted"
        onClick={() => {
          setLiveParams(prev => ({ ...GAME_PRESETS['standard'], gameName: 'PlayMint Core' }));
          setPresetKey('standard');
        }}
        style={{ marginTop: '4px' }}
      >
        Reset to Default
      </button>
    </>
  );
};

const CreatorPanel = ({
  isOpen,
  onClose,
  onOpenSelector,
  liveParams,
  setLiveParams,
  presetKey,
  setPresetKey,
  onSliderChange,
}) => {
  const isCustom = presetKey === 'custom';

  return (
    <div 
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className="pm-glass-panel"
      style={{
        position: 'fixed', top: 0, right: 0, height: '100dvh',
        width: '100vw', maxWidth: '380px',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)', zIndex: 1000,
        overflowY: 'auto', display: 'flex', flexDirection: 'column',
        borderLeft: '1px solid var(--pm-border)'
      }}
    >
      <div style={{ padding: '24px', borderBottom: '1px solid var(--pm-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="pm-heading" style={{ fontSize: '20px', margin: 0 }}>Creator Panel</h2>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--pm-text-secondary)', fontSize: '24px', cursor: 'pointer' }}>✕</button>
      </div>

      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        <button className="pm-btn pm-btn-primary" style={{ justifyContent: 'center' }} onClick={onOpenSelector}>
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
              <RunnerControls liveParams={liveParams} onSliderChange={onSliderChange} />
            ) : liveParams.gameType === 'platformer' ? (
              <PlatformerControls liveParams={liveParams} onSliderChange={onSliderChange} />
            ) : (
              <div style={{ color: 'var(--pm-text-tertiary)', fontSize: '13px', fontStyle: 'italic', textAlign: 'center' }}>
                No physics parameters available.
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <ConfigActions liveParams={liveParams} setLiveParams={setLiveParams} setPresetKey={setPresetKey} />
        </div>
      </div>
    </div>
  );
};

export default CreatorPanel;
