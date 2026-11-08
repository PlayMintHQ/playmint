// /my-games (protected view) and the reserved /g/:id + not-found stubs.
//
// 2026-09-27, contract §2B: the shell becomes the real library — a responsive
// card grid (thumbnail, title, mode, date, Play) with rename and delete-with-
// confirmation. All data access lives in src/game/savedGames/index.js; this
// component is presentation + intent only.
//
// PLAY opens the game's own record: /g/<rowId>?play=1 (2026-11-05, client: "a
// Community game should load from its exact public game ID / public game
// record"). The public page fetches that row by id and boots it — one path for
// My Games, Community and shared links, always the row that was clicked.
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/authContext';
import AccountButton from '../auth/AccountButton';
import ConfirmDialog from './ConfirmDialog';
import { IconPlay, IconGlobe, IconLock, IconShare, IconRemix } from './Icons';
import { navigate } from '../router';
import { listMyGames, listPublicGames, renameGame, deleteGame, setGameVisibility, setGameRemix } from '../game/savedGames';
import { shareLink, copyLink, gameShareUrl } from '../utils/shareUtils';
import { THEME_ART_URLS } from '../game/themes';

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
 * Play a saved game: a fresh document on the game's own record. Cross-document on
 * purpose (no state from the library or a previous game survives), `replace` so
 * Back from the game does not return to a stale grid.
 */
const playSavedGame = (game) => {
  if (!game?.id) return;
  window.location.replace(`/g/${encodeURIComponent(game.id)}?play=1`);
};

function GameCard({ game, onRename, onDelete, onVisibility, isCommunity = false }) {
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

  // Card art is normally a real captured frame of the game (a PNG uploaded when
  // the game was saved — see game/frameCapture.js). This state only exists for
  // the rows that predate that, or whose upload never reached the store: those
  // fall back to the built-in world's own backdrop image, never to a flat
  // gradient. The client's verdict on a colour swatch: "there must be a frame
  // within the game, not just the sample color".
  const [thumbFailed, setThumbFailed] = useState(false);
  const themeKey = game?.config?.themeKey;
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

  const [toggling, setToggling] = useState(false);
  const [shareStatus, setShareStatus] = useState('idle');
  const [copyStatus, setCopyStatus] = useState('idle');
  // Versioned per what the preview card shows (see gameShareUrl).
  const urlFor = (visibility) => gameShareUrl(game.id, { visibility, title: game.title, artId: game.art_id, thumb: game.thumbnail_path });
  const [sharePrompt, setSharePrompt] = useState(null); // 'share' | 'copy' while asking to publish
  const [shareError, setShareError] = useState('');

  const toggleRemix = async () => {
    setToggling(true);
    const next = game.allow_remix !== true;
    const res = await setGameRemix(game.id, next);
    setToggling(false);
    if (res.ok) {
      if (onRename) onRename(game.id, game.title, undefined, res.allow_remix);
    } else {
      setError(res.error);
    }
  };

  const toggleVisibility = async () => {
    setToggling(true);
    const isPublic = game.visibility !== 'public';
    const res = await setGameVisibility(game.id, isPublic, { artId: game.art_id || null });
    setToggling(false);
    if (res.ok) {
      if (onRename) onRename(game.id, game.title, res.visibility);
    } else {
      alert(res.error || 'Failed to change visibility');
    }
  };

  const deliver = async (action, url) => {
    const res = action === 'copy'
      ? await copyLink(url)
      : await shareLink({ title: game.title, text: `Play "${game.title}" on PlayMint!`, url });
    if (!res.ok) return;
    if (action === 'copy') { setCopyStatus('copied'); setTimeout(() => setCopyStatus('idle'), 2500); }
    else { setShareStatus(res.method === 'share' ? 'shared' : 'copied'); setTimeout(() => setShareStatus('idle'), 2500); }
  };
  // A private game's link opens for nobody and previews as the generic card —
  // ask to publish first (the confirm click is the share sheet's gesture).
  const startShare = (action) => {
    if (!isCommunity && game.visibility === 'private') { setShareError(''); setSharePrompt(action); return; }
    deliver(action, urlFor(game.visibility));
  };
  const publishAndShare = async () => {
    const action = sharePrompt;
    const published = setGameVisibility(game.id, true, { artId: game.art_id || null });
    const shared = deliver(action, urlFor('public'));
    const res = await published;
    if (!res.ok) { setShareError(res.error || 'Could not make the game public.'); return; }
    if (onVisibility) onVisibility(game.id, 'public');
    setSharePrompt(null);
    await shared;
  };
  const handleShare = () => startShare('share');
  const handleCopy = () => startShare('copy');

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
            onError={(e) => {
              const retries = parseInt(e.target.dataset.retries || '0', 10);
              if (retries < 3) {
                e.target.dataset.retries = retries + 1;
                setTimeout(() => {
                  const url = new URL(game.thumbnail_url, window.location.origin);
                  url.searchParams.set('retry', Date.now());
                  e.target.src = url.toString();
                }, 1000 * (retries + 1));
              } else {
                setThumbFailed(true);
              }
            }}
          />
        ) : (
          <span
            className="pm-library__artFallback"
            style={{ backgroundImage: `url(${THEME_ART_URLS[themeKey || 'default']?.backdrop || THEME_ART_URLS.default.backdrop})` }}
            aria-hidden="true"
          />
        )}
        <span className="pm-library__playBadge" aria-hidden="true"><IconPlay /></span>
        {game.art_missing && !isCommunity && (
          <span
            className="pm-library__artMissing"
            title="This game's artwork is no longer stored. Play shows its built-in world; use Quick Edit to redraw it."
          >
            Artwork missing
          </span>
        )}
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
              {isCommunity && game.creator_name && (
                <span className="pm-library__mode" style={{ opacity: 0.9 }}>by {game.creator_name}</span>
              )}
              {game.remix_parent_id && (
                <span className="pm-library__mode" style={{ color: 'var(--pm-accent-amber, #f59e0b)', borderColor: 'rgba(245, 158, 11, 0.4)' }} title="Remixed from an existing game">
                  <IconRemix /> Remixed
                </span>
              )}
              {formatDate(game.updated_at || game.created_at) && (
                <span className="pm-library__date">{formatDate(game.updated_at || game.created_at)}</span>
              )}
              {!isCommunity && (
                <button 
                  type="button" 
                  className="pm-library__visibility-toggle" 
                  onClick={toggleVisibility} 
                  disabled={toggling || busy || editing}
                  title={game.visibility === 'public' ? 'Public — Click to make private' : 'Private — Click to make public'}
                >
                  {game.visibility === 'public' ? (
                    <><IconGlobe /> <span>Public</span></>
                  ) : (
                    <><IconLock /> <span>Private</span></>
                  )}
                </button>
              )}
              {!isCommunity && (
                <button
                  type="button"
                  className="pm-library__visibility-toggle"
                  onClick={toggleRemix}
                  disabled={toggling || busy || editing}
                  title={game.allow_remix === true ? 'Others can remix this game — click to turn off' : 'Remixing is off — click to allow others to remix'}
                >
                  <IconRemix /> <span>Remix: {game.allow_remix === true ? 'On' : 'Off'}</span>
                </button>
              )}
              {game.visibility === 'public' && (
                <a
                  href={`/g/${game.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--pm-accent-teal, #14b8a6)',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(20, 184, 166, 0.1)',
                    border: '1px solid rgba(20, 184, 166, 0.25)'
                  }}
                  title="Open public share page in a new tab"
                >
                  View Page ↗
                </a>
              )}
            </p>
          </>
        )}

        <ConfirmDialog
          open={!!sharePrompt}
          title="Make this game public?"
          message={`"${game.title}" is private: anyone you send the link to could not open it, and chat apps would show a generic PlayMint card. Make it public so the link works and shows the game's own preview? It will also appear in Community Games.`}
          error={shareError}
          danger={false}
          confirmLabel={sharePrompt === 'copy' ? 'Make public & copy link' : 'Make public & share'}
          onCancel={() => setSharePrompt(null)}
          onConfirm={publishAndShare}
        />
        <div className="pm-library__actions">
          <button type="button" className="pm-btn pm-btn-primary pm-library__play" onClick={() => playSavedGame(game)}>
            <IconPlay /> Play
          </button>
          {/* Community cards always show the creator's remix choice, so a
              visitor knows BEFORE opening the page (client 2026-11-04). */}
          {isCommunity && (game.allow_remix === true ? (
            <button
              type="button"
              className="pm-btn pm-btn-outline"
              onClick={() => {
                navigate(`/g/${game.id}`);
              }}
              style={{ color: 'var(--pm-accent-amber, #f59e0b)', borderColor: 'rgba(245, 158, 11, 0.4)' }}
              title="View public details and remix"
            >
              <IconRemix /> Remix
            </button>
          ) : (
            <button
              type="button"
              className="pm-btn pm-btn-outline"
              disabled
              aria-disabled="true"
              style={{ opacity: 0.5, cursor: 'not-allowed' }}
              title="The creator turned remixing off for this game"
            >
              <IconRemix /> Remix: Off
            </button>
          ))}
          <button
            type="button"
            className="pm-btn pm-btn-outline"
            onClick={handleShare}
            title={game.visibility === 'public' ? 'Share the public link' : 'Share link (note: game is currently private)'}
          >
            <IconShare /> {shareStatus === 'copied' ? 'Copied!' : shareStatus === 'shared' ? 'Shared!' : 'Share'}
          </button>
          <button
            type="button"
            className="pm-btn pm-btn-outline"
            onClick={handleCopy}
            title={game.visibility === 'public' ? 'Copy the public game link' : 'Copy link (note: game is currently private)'}
          >
            {copyStatus === 'copied' ? '✓ Copied' : 'Copy Link'}
          </button>
          {!isCommunity && (
            <>
              <button type="button" className="pm-btn pm-btn-outline" onClick={startEdit} disabled={busy || editing}>
                Rename
              </button>
              <button type="button" className="pm-btn pm-btn-danger" onClick={() => onDelete(game)} disabled={busy}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export function MyGamesPage() {
  const { status, user, displayName, openSignIn } = useAuth();
  const [activeTab, setActiveTab] = useState('mine');
  const [publicData, setPublicData] = useState(null);
  const [loadingPublic, setLoadingPublic] = useState(false);

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

  // Protected view for My Games: a guest landing here gets the sign-in dialog
  useEffect(() => {
    if (activeTab === 'mine' && status === 'guest') openSignIn('my-games');
  }, [activeTab, status, openSignIn]);

  const refreshKey = status === 'authed' ? (user?.id || null) : null;

  useEffect(() => {
    if (refreshKey === null) return;
    loadLibrary(refreshKey).then(setLoaded);
  }, [refreshKey]);

  // Load public community games when switching to public tab
  useEffect(() => {
    if (activeTab === 'public' && !publicData && !loadingPublic) {
      setLoadingPublic(true);
      listPublicGames().then((res) => {
        setPublicData(res);
        setLoadingPublic(false);
      });
    }
  }, [activeTab, publicData, loadingPublic]);

  // A save fired while a game is running dispatches this, so the grid is current
  // the moment the user walks in rather than showing a pre-save snapshot.
  useEffect(() => {
    if (refreshKey === null) return undefined;
    const onChanged = () => {
      loadLibrary(refreshKey).then(setLoaded);
      if (activeTab === 'public') {
        listPublicGames().then(setPublicData);
      }
    };
    window.addEventListener('pm-games-changed', onChanged);
    return () => window.removeEventListener('pm-games-changed', onChanged);
  }, [refreshKey, activeTab]);

  const handleRenamed = (id, title, visibility, allowRemix) => {
    setLoaded((prev) => (prev ? { ...prev, games: prev.games.map((g) => (g.id === id ? { ...g, title, ...(visibility ? { visibility } : {}), ...(allowRemix !== undefined ? { allow_remix: allowRemix } : {}) } : g)) } : prev));
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
    <RouteShell title={activeTab === 'mine' ? 'My Games' : 'Community Games'}>
      {/* Tab Switcher: My Games | Community Games */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`pm-btn ${activeTab === 'mine' ? 'pm-btn-primary' : 'pm-btn-outline'}`}
          onClick={() => setActiveTab('mine')}
        >
          My Games {mine?.games?.length ? `(${mine.games.length})` : ''}
        </button>
        <button
          type="button"
          className={`pm-btn ${activeTab === 'public' ? 'pm-btn-primary' : 'pm-btn-outline'}`}
          onClick={() => setActiveTab('public')}
        >
          <IconGlobe /> Community Games {publicData?.games?.length ? `(${publicData.games.length})` : ''}
        </button>
      </div>

      {activeTab === 'public' && (
        <>
          <p className="pm-route__text">
            Explore and play public games created and shared by the PlayMint community.
          </p>

          {loadingPublic && <p className="pm-route__text">Loading community games…</p>}

          {!loadingPublic && publicData?.error && (
            <p className="pm-library__error" role="alert">{publicData.error}</p>
          )}

          {!loadingPublic && (!publicData?.games || publicData.games.length === 0) && !publicData?.error && (
            <div className="pm-card pm-route__card">
              <p className="pm-route__text">No public community games published yet. Make a game and click the Public toggle to share it with everyone!</p>
              <div className="pm-route__actions">
                <button type="button" className="pm-btn pm-btn-primary" onClick={() => navigate('/')}>Make a game</button>
              </div>
            </div>
          )}

          {!loadingPublic && publicData?.games && publicData.games.length > 0 && (
            <>
              <div className="pm-library__grid">
                {publicData.games.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    isCommunity={true}
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

      {activeTab === 'mine' && (
        <>
          {status === 'loading' && <p className="pm-route__text">Loading your account…</p>}

          {status === 'disabled' && (
            <p className="pm-route__text">Accounts are not enabled on this deployment.</p>
          )}

          {status === 'guest' && (
            <div className="pm-card pm-route__card">
              <p className="pm-route__text">Sign in to see the games you have saved. Playing never needs an account.</p>
              <div className="pm-route__actions">
                <button type="button" className="pm-btn pm-btn-primary" onClick={() => openSignIn('my-games')}>Sign in</button>
                <button type="button" className="pm-btn pm-btn-muted" onClick={() => setActiveTab('public')}>Explore Community Games</button>
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
                        onVisibility={(id, visibility) => handleRenamed(id, game.title, visibility)}
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
