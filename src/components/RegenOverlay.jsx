import React from 'react';

const LOG_COLORS = [
  ['[SYSTEM]', 'var(--pm-accent-teal)'],
  ['[EDITOR]', 'var(--pm-accent-orange)'],
  ['[DESIGN]', '#8A2BE2'],
  ['[ASSETS]', 'var(--pm-accent-orange)'],
  ['[ENGINE]', 'var(--pm-accent-teal)']
];

/**
 * Full-screen progress overlay shown while the Creator Panel / Quick Edit prompt
 * redraws or regenerates a world in place (the start screen has its own compiler
 * terminal; this is the in-game equivalent). Renders nothing when `state` is null.
 * The game stays PAUSED for as long as this is up (App's shouldPause includes
 * regenState); Cancel keeps the current game and resumes it.
 *
 * z-index sits above GameOverOverlay (9999): a run that ended just before the edit
 * started must never cover the progress screen.
 */
const RegenOverlay = ({ state, onCancel }) => {
  if (!state) return null;

  return (
    <div
      data-pm-modal
      style={{
        position: 'fixed', inset: 0, zIndex: 10050,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(4, 7, 12, 0.82)', backdropFilter: 'blur(6px)'
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="pm-glass-panel" style={{
        width: 'min(560px, calc(100vw - 32px))',
        borderRadius: '14px', border: '1px solid var(--pm-border)',
        padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#FF5F57' }} />
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#FEBC2E' }} />
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#28C840' }} />
          </div>
          <span style={{ color: 'var(--pm-text-tertiary)', fontSize: '10px', fontWeight: 'bold', letterSpacing: '1px' }}>
            GAME PAUSED — UPDATING
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minHeight: '120px', maxHeight: '180px', overflowY: 'auto' }}>
          {state.logs.map((log, i) => {
            const color = (LOG_COLORS.find(([prefix]) => log.startsWith(prefix)) || [null, '#fff'])[1];
            return (
              <div key={i} style={{
                color, fontSize: '12px', lineHeight: 1.5, textAlign: 'left',
                fontFamily: 'monospace', textShadow: `0 0 6px ${color}40`, whiteSpace: 'pre-wrap'
              }}>
                {log}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--pm-text-secondary)' }}>
            <span>{state.title || 'Regenerating World'}</span>
            <span style={{ color: 'var(--pm-accent-teal)', fontWeight: 'bold' }}>{Math.round(state.progress)}%</span>
          </div>
          <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              width: `${state.progress}%`, height: '100%',
              background: 'linear-gradient(90deg, var(--pm-accent-teal), #8A2BE2)',
              boxShadow: '0 0 8px var(--pm-accent-teal)', borderRadius: '3px',
              transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }} />
          </div>
        </div>

        {onCancel && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="pm-btn pm-btn-muted"
              onClick={onCancel}
              disabled={state.cancelling}
            >
              {state.cancelling ? 'Cancelling…' : 'Cancel — keep my game'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RegenOverlay;
