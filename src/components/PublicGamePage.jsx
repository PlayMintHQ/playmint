import React, { useEffect, useState } from 'react';
import { getPublicGame } from '../game/savedGames';
import { THEME_ART_URLS } from '../game/themes';
import AccountButton from '../auth/AccountButton';
import { IconPlay, IconShare, IconRemix, IconGlobe } from './Icons';
import { navigate } from '../router';
import { shareLink } from '../utils/shareUtils';

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

export function PublicGamePage({ gameId, onPlay, onRemix }) {
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState(null);
  const [error, setError] = useState('');
  const [shareStatus, setShareStatus] = useState('idle');
  const [thumbFailed, setThumbFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!gameId) {
      setLoading(false);
      setError('No game ID provided.');
      return;
    }

    setLoading(true);
    setError('');

    getPublicGame(gameId).then((res) => {
      if (!active) return;
      setLoading(false);
      if (res.ok && res.game) {
        setGame(res.game);
        // Set document title and meta tags dynamically for client navigation
        document.title = `${res.game.title} — Play on PlayMint`;
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) {
          metaDesc.setAttribute('content', `Play "${res.game.title}", a procedural 2D ${modeLabel(res.game.mode)} game on PlayMint.`);
        }
      } else {
        setError(res.error || 'Game not found or is private.');
      }
    }).catch((err) => {
      if (!active) return;
      setLoading(false);
      setError(err?.message || 'Could not load game.');
    });

    return () => {
      active = false;
    };
  }, [gameId]);

  const handleShare = async () => {
    const url = window.location.href;
    const res = await shareLink({
      title: game?.title || 'PlayMint game',
      text: `Play "${game?.title || 'this game'}" on PlayMint!`,
      url
    });
    if (res.ok) {
      setShareStatus(res.method === 'share' ? 'shared' : 'copied');
      setTimeout(() => setShareStatus('idle'), 2500);
    }
  };

  const themeKey = game?.config?.themeKey || 'default';
  const showImage = !!game?.thumbnail_url && !thumbFailed;

  return (
    <div className="pm-route">
      <header className="pm-route__bar">
        <button type="button" className="pm-route__home" onClick={() => navigate('/')} aria-label="PlayMint home">
          <img src="/assets/Logo_PlayMint_(transparent).png" alt="PlayMint" />
        </button>
        <AccountButton />
      </header>

      <main className="pm-route__main">
        {loading && (
          <div className="pm-card pm-route__card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <p className="pm-route__text" style={{ fontSize: '1.1rem' }}>Loading game world…</p>
          </div>
        )}

        {error && !loading && (
          <div className="pm-card pm-route__card" style={{ textAlign: 'center', maxWidth: '520px', margin: '0 auto' }}>
            <h1 className="pm-heading" style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>Game Unavailable</h1>
            <p className="pm-route__text" style={{ color: 'var(--pm-text-muted, #94a3b8)', marginBottom: '1.5rem' }}>
              {error}
            </p>
            <div className="pm-route__actions" style={{ justifyContent: 'center' }}>
              <button type="button" className="pm-btn pm-btn-primary" onClick={() => navigate('/')}>
                Create Your Own Game
              </button>
              <button type="button" className="pm-btn pm-btn-muted" onClick={() => navigate('/my-games')}>
                My Games
              </button>
            </div>
          </div>
        )}

        {game && !loading && !error && (
          <div className="pm-card pm-public-game" style={{ maxWidth: '640px', margin: '0 auto', padding: '1.5rem' }}>
            {/* Thumbnail Showcase */}
            <div
              className="pm-library__art"
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '16 / 9',
                maxHeight: '360px',
                borderRadius: '8px',
                overflow: 'hidden',
                marginBottom: '1.25rem',
                backgroundColor: '#111'
              }}
            >
              {showImage ? (
                <img
                  src={game.thumbnail_url}
                  alt={game.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={() => setThumbFailed(true)}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundImage: `url(${THEME_ART_URLS[themeKey]?.backdrop || THEME_ART_URLS.default.backdrop})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                />
              )}
              <button
                type="button"
                className="pm-library__playBadge"
                onClick={() => onPlay(game)}
                title={`Play ${game.title}`}
                style={{ cursor: 'pointer' }}
              >
                <IconPlay />
              </button>
            </div>

            {/* Game Info Header */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <h1 className="pm-heading" style={{ fontSize: '1.75rem', margin: 0 }}>
                  {game.title}
                </h1>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span className="pm-library__mode" style={{ fontSize: '0.85rem' }}>
                    {modeLabel(game.mode)}
                  </span>
                  <span className="pm-library__mode" style={{ fontSize: '0.85rem', color: 'var(--pm-accent-teal, #14b8a6)', borderColor: 'rgba(20, 184, 166, 0.4)' }}>
                    <IconGlobe /> Public
                  </span>
                </div>
              </div>

              <p style={{ margin: '0.25rem 0 0.5rem', color: 'var(--pm-text-muted, #94a3b8)', fontSize: '0.9rem' }}>
                Created by <strong style={{ color: 'var(--pm-text, #f8fafc)' }}>{game.creator_name}</strong>
                {game.created_at && ` • ${formatDate(game.created_at)}`}
              </p>

              {game.parent_game && (
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: 'var(--pm-accent-amber, #f59e0b)' }}>
                  <IconRemix /> Remixed from{' '}
                  <a
                    href={`/g/${game.parent_game.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/g/${game.parent_game.id}`);
                    }}
                    style={{ color: 'var(--pm-accent-amber, #f59e0b)', textDecoration: 'underline' }}
                  >
                    {game.parent_game.title || 'Original Game'}
                  </a>
                </p>
              )}

              {game.prompt && (
                <p style={{ margin: '0.75rem 0 0', fontStyle: 'italic', fontSize: '0.9rem', color: 'var(--pm-text-dim, #cbd5e1)' }}>
                  “{game.prompt}”
                </p>
              )}
            </div>

            {/* Primary Action Buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="pm-btn pm-btn-primary"
                onClick={() => onPlay(game)}
                style={{ flex: '1 1 180px', justifyContent: 'center', padding: '0.8rem 1.25rem', fontSize: '1rem', fontWeight: 600 }}
              >
                <IconPlay /> Play Game
              </button>

              <button
                type="button"
                className="pm-btn pm-btn-outline"
                onClick={() => onRemix(game)}
                style={{ flex: '1 1 160px', justifyContent: 'center', borderColor: 'var(--pm-accent-amber, #f59e0b)', color: 'var(--pm-accent-amber, #f59e0b)' }}
                title="Remix this game with your own custom prompts or settings"
              >
                <IconRemix /> Remix Game
              </button>

              <button
                type="button"
                className="pm-btn pm-btn-outline"
                onClick={handleShare}
                style={{ flex: '0 0 auto', justifyContent: 'center' }}
                title="Share link"
              >
                <IconShare /> {shareStatus === 'copied' ? 'Copied!' : shareStatus === 'shared' ? 'Shared!' : 'Share'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
