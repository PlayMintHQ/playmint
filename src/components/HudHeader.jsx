import React from 'react';
import { IconFullscreen, IconFullscreenExit, IconMenu } from './Icons';

const HudHeader = ({
  liveParams,
  score,
  isFullscreen,
  isFullscreenSupported,
  onFullscreen,
  onExitFullscreen,
  onMenuOpen,
  onLogoClick,
}) => {
  return (
    <div className="hud-header">
      {/* Top row: Logo + Controls (always single line) */}
      <div className="hud-header__row">
        {/* LEFT: Logo (clickable) */}
        <button className="hud-header__logo" onClick={onLogoClick} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <img src="/assets/Logo_PlayMint_(transparent).png" alt="PlayMint" />
        </button>

        {/* CENTER: Title (hidden on mobile, shown inline on desktop) */}
        {liveParams.gameName && (
          <h1 className="hud-header__title hud-header__title--inline">
            {liveParams.gameName}
          </h1>
        )}

        {/* RIGHT: Controls */}
        <div className="hud-header__controls">
          <div className="hud-header__score pm-btn-outline">
            <span className="hud-header__score-label">SCORE: </span>
            <span style={{ color: 'var(--pm-accent-teal)' }}>{score}</span>
          </div>

          {!isFullscreen && isFullscreenSupported && (
            <button className="pm-btn pm-btn-outline hud-header__icon-btn hud-header__fullscreen-btn" onClick={onFullscreen} title="Fullscreen">
              <IconFullscreen />
            </button>
          )}
          {isFullscreen && (
            <button className="pm-btn pm-btn-danger hud-header__icon-btn hud-header__fullscreen-btn" onClick={onExitFullscreen} title="Exit Fullscreen">
              <IconFullscreenExit />
            </button>
          )}

          <button className="pm-btn pm-btn-primary hud-header__icon-btn" onClick={onMenuOpen}>
            <IconMenu />
          </button>
        </div>
      </div>

      {/* Mobile title row: shown below the icon bar on small screens */}
      {liveParams.gameName && (
        <h1 className="hud-header__title hud-header__title--mobile">
          {liveParams.gameName}
        </h1>
      )}

      {/* Temporary Debug Info Row */}
      <div style={{
        display: 'flex',
        gap: '12px',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '6px 14px',
        background: 'rgba(10, 15, 24, 0.9)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '20px',
        fontSize: '11px',
        fontFamily: 'monospace',
        color: 'var(--pm-text-secondary)',
        marginTop: '8px',
        pointerEvents: 'auto',
        width: 'fit-content',
        margin: '8px auto 0 auto',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
      }}>
        {liveParams.gameType === 'runner' ? (
          <>
            <span>Speed: <strong style={{ color: 'var(--pm-accent-teal)' }}>{Math.round(liveParams.runSpeed || 350)}</strong></span>
            <span>Jump: <strong style={{ color: 'var(--pm-accent-teal)' }}>{Math.round(liveParams.jumpForce || 750)}</strong></span>
            <span>Gravity: <strong style={{ color: 'var(--pm-accent-teal)' }}>{Math.round(liveParams.gravity || 1800)}</strong></span>
          </>
        ) : (
          <>
            <span>Speed: <strong style={{ color: 'var(--pm-accent-teal)' }}>{Math.round(liveParams.actionWalkSpeed || 300)}</strong></span>
            <span>Jump: <strong style={{ color: 'var(--pm-accent-teal)' }}>{Math.round(liveParams.actionJumpHeight || 600)}</strong></span>
            <span>Gravity: <strong style={{ color: 'var(--pm-accent-teal)' }}>{Math.round(liveParams.actionGravity || 1500)}</strong></span>
            <span>Enemies: <strong style={{ color: 'var(--pm-accent-teal)' }}>{Math.round(liveParams.actionEnemyCount || 3)}</strong></span>
          </>
        )}
        <span>Diff: <strong style={{ color: 'var(--pm-accent-purple)' }}>{liveParams.difficulty || 5}</strong></span>
      </div>
    </div>
  );
};

export default HudHeader;
