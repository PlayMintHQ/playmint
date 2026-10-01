import React from 'react';
import { IconFullscreen, IconFullscreenExit, IconMenu, IconSave } from './Icons';
import AccountButton from '../auth/AccountButton';

const HudHeader = ({
  liveParams,
  score,
  isFullscreen,
  isFullscreenSupported,
  onFullscreen,
  onExitFullscreen,
  onMenuOpen,
  onLogoClick,
  onMyGames,
  onSave,
  saveState,
  canSave,
  playerAnimState,
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

          {/* Always rendered. The old code hid this on narrow screens and when
              the browser reported no Fullscreen API, which on iOS Safari left a
              portrait phone with a letterboxed game and NO way to fix it. When
              native fullscreen is genuinely unavailable the button explains the
              manual route (landscape / add to Home Screen) rather than doing
              nothing. */}
          {!isFullscreen && (
            <button
              className="pm-btn pm-btn-outline hud-header__icon-btn hud-header__fullscreen-btn"
              onClick={onFullscreen}
              title={isFullscreenSupported ? 'Fullscreen' : 'Fullscreen — rotate to landscape, or add this page to your Home Screen for fullscreen'}
              aria-label="Fullscreen"
            >
              <IconFullscreen />
            </button>
          )}
          {isFullscreen && (
            <button className="pm-btn pm-btn-danger hud-header__icon-btn hud-header__fullscreen-btn" onClick={onExitFullscreen} title="Exit Fullscreen">
              <IconFullscreenExit />
            </button>
          )}

          {/* Renders nothing when accounts are not configured. */}
          <AccountButton compact onMyGames={onMyGames} />

          {/* Save to My Games. Hidden entirely when the deployment has no
              accounts, so a keyless build shows no dead control. */}
          {canSave && (
            <button
              className="pm-btn pm-btn-outline hud-header__icon-btn"
              onClick={onSave}
              disabled={saveState === 'saving'}
              title={saveState === 'error' ? 'Could not save — press to try again' : 'Save to My Games'}
              aria-label="Save to My Games"
            >
              {saveState === 'saving' && '…'}
              {saveState === 'saved' && <span aria-hidden="true">✓</span>}
              {saveState === 'error' && <span aria-hidden="true">!</span>}
              {saveState === 'idle' && <IconSave />}
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

      {/* Player-animation repair. This game's sprite sheet failed its quality
          gates, so the player boots static; App is redrawing it in the
          background. Honest, non-blocking, and it says so rather than leaving
          the player to look frozen with no explanation. */}
      {playerAnimState === 'running' && (
        <p className="hud-note" role="status">Animating your character…</p>
      )}
      {playerAnimState === 'failed' && (
        <p className="hud-note hud-note--warn" role="status">
          This character came out static — generating a new one could not be completed.
        </p>
      )}
    </div>
  );
};

export default HudHeader;
