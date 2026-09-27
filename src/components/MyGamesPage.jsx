// /my-games (protected view) and the reserved /g/:id + not-found stubs.
//
// 2026-09-27, contract §2B: the shell becomes the real library — a responsive
// card grid (thumbnail, title, mode, date, Play) with rename and delete-with-
// confirmation. All data access lives in src/game/savedGames/index.js; this
// component is presentation + intent only.
//
// PLAY re-enters through the EXISTING share-link import path rather than a
// second boot route: a row's `config` IS the share payload (stripForShare), so
// Play re-encodes it into `#config=` and lets App's getInitialState() boot it.
// config.gameId → pendingRestoreId → getGameById() → the same AI art a shared
// link restores. That path is cross-device and cache-aware already, which is
// exactly the contract's "Play boots the saved game with its AI art".
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/authContext';
import AccountButton from '../auth/AccountButton';
import ConfirmDialog from './ConfirmDialog';
import { IconPlay } from './Icons';
import { navigate } from '../router';
import { encodeShareConfig } from '../game/shareLink';
import { listMyGames, renameGame, deleteGame } from '../game/savedGames';
import { thumbPalette } from '../game/savedGames/thumbnail';

// games.mode holds the internal gameType; the UI has always called the
// platformer "Action Quest" (ScreenZero's AVAILABLE_MODES is the source).
const MODE_LABELS = {
  runner: 'Runner',
  platformer: 'Action Quest',
  shooter: 'Shooter Arena',
};

const modeLabel = (mode) => MODE_LABELS[mode] || 'Game';

const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

// Fetch the library for a specific user id and return it STAMPED with that id.
// Module-level and setState-free on purpose: the effects below own every state
// write, and only from a promise callback.
const loadLibrary = async (userId) => {
  const res = await listMyGames();
  return {
    userId,
    games: res.games || [],
    error: res.ok ? '' : (res.error || 'Could not load your games.'),
    schemaMissing: !!res.schemaMissing,
  };
};

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

/**
 * Play a saved game.
 *
 * A CROSS-DOCUMENT navigation is required, not optional: getInitialState() is a
 * useState initializer, so it only ever runs on a fresh document, and the hash
 * is the app's import channel. `location.replace` (not assign) keeps the library
 * out of the back stack — Back from a game should not return to a stale grid.
 * This is the same "reload, reuse the tested import path" decision App's popstate
 * handler makes.
 */
const playSavedGame = (game) => {
  const config = {
    ...(game?.config || {}),
    // art_id and config.gameId are the same id (savedGames/index.js), but trust
    // the COLUMN: it is what the row was matched on, and it is what
    // getGameById() will look the art up under.
    gameId: game?.art_id || game?.config?.gameId || null,
    gameName: game?.title || game?.config?.gameName || 'PlayMint game',
  };
  try {
    const payload = encodeShareConfig(config);
    window.location.replace('/' + window.location.search + '#config=' + payload);
  } catch (err) {
    console.error('[MyGames] could not open saved game:', err);
  }
};

function GameCard({ game, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(game.title || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  // Enter commits, and unmounting the input fires no blur — but a click on Save
  // DOES blur it first. One commit per editing session, whichever arrives first.
  const committedRef = useRef(false);

  useEffect(() => {
    if (editing && inputRef.current) {
      try { inputRef.current.focus({ preventScroll: true }); } catch { /* ignore */ }
      if (inputRef.current?.select) inputRef.current.select();
    }
  }, [editing]);

  // A thumbnail that 404s (or was never uploaded — static-art games have no
  // file) falls back to the world's own gradient, so a card is never broken.
  const [thumbFailed, setThumbFailed] = useState(false);
  const palette = thumbPalette(game?.config?.themeKey);
  const showImage = !!game?.thumbnail_url && !thumbFailed;

  const startEdit = () => {
    setDraft(game.title || '');
    setError('');
    committedRef.current = false;
    setEditing(true);
  };

  const commit = async (save) => {
    if (committedRef.current) return;
    committedRef.current = true;
    if (!save) { setEditing(false); return; }
    setBusy(true);
    setError('');
    const res = await renameGame(game.id, draft);
    setBusy(false);
    if (res.ok) {
      setEditing(false);
      onRename(game.id, res.title);
    } else {
      // Re-arm so the field stays editable and a retry is possible.
      committedRef.current = false;
      setError(res.error);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    if (e.key === 'Escape') { e.preventDefault(); commit(false); }
  };

  return (
    <article className="pm-library__card">
      <button
        type="button"
        className="pm-library__art"
        onClick={() => playSavedGame(game)}
        title={`Play ${game.title}`}
        aria-label={`Play ${game.title}`}
      >
        {showImage ? (
          <img
            src={game.thumbnail_url}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <span
            className="pm-library__artFallback"
            style={{ background: `linear-gradient(160deg, ${palette[0]}, ${palette[1]} 55%, ${palette[2]})` }}
            aria-hidden="true"
          />
        )}
        <span className="pm-library__playBadge" aria-hidden="true"><IconPlay /></span>
      </button>

      <div className="pm-library__body">
        {editing ? (
          <div className="pm-library__rename">
            <label className="pm-srOnly" htmlFor={`pm-lib-title-${game.id}`}>Title</label>
            <input
              id={`pm-lib-title-${game.id}`}
              ref={inputRef}
              className="pm-input pm-library__renameInput"
              value={draft}
              maxLength={80}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => commit(true)}
              disabled={busy}
            />
            <div className="pm-library__renameActions">
              <button type="button" className="pm-btn pm-btn-primary" onMouseDown={(e) => e.preventDefault()} onClick={() => commit(true)} disabled={busy}>
                {busy ? '…' : 'Save'}
              </button>
              <button type="button" className="pm-btn pm-btn-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => commit(false)} disabled={busy}>
                Cancel
              </button>
            </div>
            {error && <p className="pm-library__error" role="alert">{error}</p>}
          </div>
        ) : (
          <>
            <h2 className="pm-library__title" title={game.title}>{game.title}</h2>
            <p className="pm-library__meta">
              <span className="pm-library__mode">{modeLabel(game.mode)}</span>
              {formatDate(game.updated_at || game.created_at) && (
                <span className="pm-library__date">{formatDate(game.updated_at || game.created_at)}</span>
              )}
            </p>
          </>
        )}

        <div className="pm-library__actions">
          <button type="button" className="pm-btn pm-btn-primary pm-library__play" onClick={() => playSavedGame(game)}>
            <IconPlay /> Play
          </button>
          <button type="button" className="pm-btn pm-btn-outline" onClick={startEdit} disabled={busy || editing}>
            Rename
          </button>
          <button type="button" className="pm-btn pm-btn-danger" onClick={() => onDelete(game)} disabled={busy}>
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

export function MyGamesPage() {
  const { status, user, displayName, openSignIn } = useAuth();
  // The loaded library is stored WITH the user id it belongs to, and rendered
  // only while that id still matches. Two reasons, one mechanism:
  //   • a sign-out → sign-in as someone else in the same tab can never show the
  //     previous account's rows, not even for the few hundred ms a refetch takes;
  //   • the load effect only ever writes state from a promise callback, which is
  //     where a fetch is allowed to report back.
  const [loaded, setLoaded] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const mine = loaded && loaded.userId === user?.id ? loaded : null;
  const games = mine?.games || [];
  const loading = !mine;
  const error = mine?.error || '';
  const schemaMissing = !!mine?.schemaMissing;

  // Protected view: a guest landing here gets the sign-in dialog straight away.
  useEffect(() => {
    if (status === 'guest') openSignIn('my-games');
  }, [status, openSignIn]);

  const refreshKey = status === 'authed' ? (user?.id || null) : null;

  useEffect(() => {
    if (refreshKey === null) return;
    loadLibrary(refreshKey).then(setLoaded);
  }, [refreshKey]);

  // A save fired while a game is running dispatches this, so the grid is current
  // the moment the user walks in rather than showing a pre-save snapshot.
  useEffect(() => {
    if (refreshKey === null) return undefined;
    const onChanged = () => { loadLibrary(refreshKey).then(setLoaded); };
    window.addEventListener('pm-games-changed', onChanged);
    return () => window.removeEventListener('pm-games-changed', onChanged);
  }, [refreshKey]);

  const handleRenamed = (id, title) => {
    setLoaded((prev) => (prev ? { ...prev, games: prev.games.map((g) => (g.id === id ? { ...g, title } : g)) } : prev));
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError('');
    const res = await deleteGame(pendingDelete.id);
    setDeleting(false);
    if (res.ok) {
      setLoaded((prev) => (prev ? { ...prev, games: prev.games.filter((g) => g.id !== pendingDelete.id) } : prev));
      setPendingDelete(null);
    } else {
      setDeleteError(res.error);
    }
  };

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
        <>
          <p className="pm-route__text">
            Signed in as <strong>{displayName}</strong>. Games you generate are saved here automatically.
          </p>

          {error && !schemaMissing && (
            <p className="pm-library__error" role="alert">{error}</p>
          )}
          {schemaMissing && (
            <p className="pm-library__error" role="alert">
              The games table has not been created in this Supabase project yet — the September migration still needs to be
              applied. PlayMint itself keeps working; only the library is unavailable.
            </p>
          )}

          {loading && <p className="pm-route__text">Loading your games…</p>}

          {!loading && !schemaMissing && games.length === 0 && !error && (
            <div className="pm-card pm-route__card">
              <p className="pm-route__text">Nothing saved yet. Make a game and it lands here on its own.</p>
              <div className="pm-route__actions">
                <button type="button" className="pm-btn pm-btn-primary" onClick={() => navigate('/')}>Make a game</button>
              </div>
            </div>
          )}

          {!loading && games.length > 0 && (
            <>
              <div className="pm-library__grid">
                {games.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    onRename={handleRenamed}
                    onDelete={(g) => { setDeleteError(''); setPendingDelete(g); }}
                  />
                ))}
              </div>
              <div className="pm-route__actions pm-library__footer">
                <button type="button" className="pm-btn pm-btn-primary" onClick={() => navigate('/')}>Make a game</button>
              </div>
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this game?"
        message={pendingDelete
          ? `“${pendingDelete.title}” will be removed from My Games. You can always share the link again to keep it.`
          : ''}
        error={deleteError}
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => { if (!deleting) { setPendingDelete(null); setDeleteError(''); } }}
        onConfirm={confirmDelete}
      />
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
