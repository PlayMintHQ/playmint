// Account entry point: "Sign in" for guests, avatar + dropdown when signed in.
// Renders NOTHING when auth is not configured, so a deploy without the Supabase
// env vars looks exactly like the pre-accounts app.
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './authContext';
import { navigate } from '../router';

export default function AccountButton({ compact = false, onMyGames }) {
  const { status, user, displayName, openSignIn, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Outside-click + Esc as NATIVE window-capture listeners: HudHeader stops
  // pointerdown propagation at its root, and App's key guard stops key events
  // inside [data-pm-modal] before React sees them.
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  if (status === 'disabled') return null;

  const cls = `pm-account-btn${compact ? ' pm-account-btn--compact' : ''}`;

  if (status !== 'authed') {
    return (
      <button
        type="button"
        className={cls}
        onClick={() => openSignIn()}
        disabled={status === 'loading'}
        aria-label="Sign in"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span className="pm-account-btn__label">Sign in</span>
      </button>
    );
  }

  const initial = (displayName || user?.email || '?').charAt(0).toUpperCase();

  const goMyGames = () => {
    setOpen(false);
    if (typeof onMyGames === 'function') onMyGames();
    else navigate('/my-games');
  };

  return (
    <div className="pm-account" ref={rootRef} data-pm-modal="">
      <button
        type="button"
        className={`${cls} pm-account-btn--authed`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${displayName}`}
      >
        <span className="pm-account-btn__avatar" aria-hidden="true">{initial}</span>
        <span className="pm-account-btn__label">{displayName}</span>
      </button>
      {open && (
        <div className="pm-account-menu pm-glass-panel" role="menu">
          <div className="pm-account-menu__who">
            <div className="pm-account-menu__name">{displayName}</div>
            {user?.email && <div className="pm-account-menu__email">{user.email}</div>}
          </div>
          <button type="button" role="menuitem" className="pm-account-menu__item" onClick={goMyGames}>
            My Games
          </button>
          <button
            type="button"
            role="menuitem"
            className="pm-account-menu__item pm-account-menu__item--danger"
            onClick={() => { setOpen(false); signOut(); }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
