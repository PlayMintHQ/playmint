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
    <div className="hud-header" onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
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
    </div>
  );
};

export default HudHeader;
