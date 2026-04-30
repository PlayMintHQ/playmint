import React from 'react';

const HudHeader = ({
  liveParams,
  score,
  isFullscreen,
  isFullscreenSupported,
  onFullscreen,
  onExitFullscreen,
  onMenuOpen,
}) => {
  return (
    <div className="hud-header">
      {/* Top row: Logo + Controls (always single line) */}
      <div className="hud-header__row">
        {/* LEFT: Logo */}
        <div className="hud-header__logo">
          <img src="/assets/Logo_PlayMint_(transparent).png" alt="PlayMint" />
        </div>

        {/* CENTER: Title (hidden on mobile, shown inline on desktop) */}
        {liveParams.gameName && (
          <h1 className="hud-header__title hud-header__title--inline">
            {liveParams.gameName}
          </h1>
        )}

        {/* RIGHT: Controls */}
        <div className="hud-header__controls">
          <div className="hud-header__score pm-btn-outline">
            SCORE: <span style={{ color: 'var(--pm-accent-teal)' }}>{score}</span>
          </div>

          {!isFullscreen && isFullscreenSupported && (
            <button className="pm-btn pm-btn-outline hud-header__icon-btn" onClick={onFullscreen} title="Fullscreen">⛶</button>
          )}
          {isFullscreen && (
            <button className="pm-btn pm-btn-danger hud-header__icon-btn" onClick={onExitFullscreen} title="Exit Fullscreen">✖</button>
          )}
          
          <button className="pm-btn pm-btn-primary hud-header__icon-btn" onClick={onMenuOpen}>
            ☰
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
