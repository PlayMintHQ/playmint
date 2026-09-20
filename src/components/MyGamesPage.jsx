// /my-games (protected view) and the reserved /g/:id + not-found stubs.
// Week 1 ships the shell: guests get the sign-in dialog (never an error), and
// signed-in users see where their library will appear. The real grid (cards,
// Play, rename, delete) lands with the 27 Sep checkpoint.
import { useEffect } from 'react';
import { useAuth } from '../auth/authContext';
import AccountButton from '../auth/AccountButton';
import { navigate } from '../router';

function RouteShell({ title, children }) {
  return (
    <div className="pm-route">
      <header className="pm-route__bar">
        <button type="button" className="pm-route__home" onClick={() => navigate('/')} aria-label="PlayMint home">
          <img src="/assets/Logo_PlayMint_(transparent).png" alt="PlayMint" />
        </button>
        <AccountButton />
      </header>
      <main className="pm-route__main">
        <h1 className="pm-heading pm-route__title">{title}</h1>
        {children}
      </main>
    </div>
  );
}

export function MyGamesPage() {
  const { status, displayName, openSignIn } = useAuth();

  // Protected view: a guest landing here gets the sign-in dialog straight away.
  useEffect(() => {
    if (status === 'guest') openSignIn('my-games');
  }, [status, openSignIn]);

  return (
    <RouteShell title="My Games">
      {status === 'loading' && <p className="pm-route__text">Loading your account…</p>}

      {status === 'disabled' && (
        <p className="pm-route__text">Accounts are not enabled on this deployment.</p>
      )}

      {status === 'guest' && (
        <div className="pm-card pm-route__card">
          <p className="pm-route__text">Sign in to see the games you have saved. Playing never needs an account.</p>
          <div className="pm-route__actions">
            <button type="button" className="pm-btn pm-btn-primary" onClick={() => openSignIn('my-games')}>Sign in</button>
            <button type="button" className="pm-btn pm-btn-muted" onClick={() => navigate('/')}>Back to PlayMint</button>
          </div>
        </div>
      )}

      {status === 'authed' && (
        <div className="pm-card pm-route__card">
          <p className="pm-route__text">
            Welcome, <strong>{displayName}</strong>. Your saved games will appear here. Saving and the
            games library arrive with the next update.
          </p>
          <div className="pm-route__actions">
            <button type="button" className="pm-btn pm-btn-primary" onClick={() => navigate('/')}>Make a game</button>
          </div>
        </div>
      )}
    </RouteShell>
  );
}

export function RouteStubPage({ kind }) {
  const isGame = kind === 'game';
  return (
    <RouteShell title={isGame ? 'Public game pages are coming' : 'Page not found'}>
      <div className="pm-card pm-route__card">
        <p className="pm-route__text">
          {isGame
            ? 'Shareable public game pages are on the way. For now, games are shared with the Share button inside a game.'
            : 'There is nothing at this address.'}
        </p>
        <div className="pm-route__actions">
          <button type="button" className="pm-btn pm-btn-primary" onClick={() => navigate('/')}>Back to PlayMint</button>
        </div>
      </div>
    </RouteShell>
  );
}
