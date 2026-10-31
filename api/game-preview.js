// Social Crawler & Meta Tag Preview Endpoint for Public Games (October 2026 Milestone §2C).
// Serves server-populated Open Graph & Twitter meta tags for /g/:id so shared links on
// Discord, Twitter, WhatsApp, iMessage, and Facebook render rich rich preview cards.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MODE_LABELS = {
  runner: 'Runner',
  platformer: 'Action Quest',
  shooter: 'Shooter Arena'
};

const publicBaseUrl = () => {
  const explicit = (process.env.BLOB_STORE_ID || '').replace(/^store_/i, '');
  const fromToken = (process.env.BLOB_READ_WRITE_TOKEN || '').match(/^vercel_blob_rw_([A-Za-z0-9]+)_/)?.[1];
  const id = explicit || fromToken;
  return id ? `https://${id.toLowerCase()}.public.blob.vercel-storage.com` : null;
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).send('Method not allowed');
    return;
  }

  const { id } = req.query;
  const gameId = Array.isArray(id) ? id[0] : id;

  // Locate the index.html template (dist in production, repo root in dev)
  let html = null;
  const distPath = join(process.cwd(), 'dist', 'index.html');
  const rootPath = join(process.cwd(), 'index.html');

  try {
    if (existsSync(distPath)) {
      html = readFileSync(distPath, 'utf8');
    } else if (existsSync(rootPath)) {
      html = readFileSync(rootPath, 'utf8');
    }
  } catch {
    html = null;
  }

  if (!html) {
    // Fallback minimal HTML shell if file read fails
    html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PlayMint Platform</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
  }

  if (!gameId) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
    return;
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  let game = null;
  if (supabaseUrl && supabaseKey) {
    try {
      const url = `${supabaseUrl}/rest/v1/games?id=eq.${encodeURIComponent(gameId)}&select=id,owner_id,title,mode,prompt,thumbnail_path,visibility&limit=1`;
      const r = await fetch(url, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      });
      if (r.ok) {
        const rows = await r.json();
        if (rows && rows.length > 0) {
          game = rows[0];
          if (game.owner_id) {
            try {
              const profUrl = `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(game.owner_id)}&select=display_name&limit=1`;
              const profRes = await fetch(profUrl, {
                headers: {
                  apikey: supabaseKey,
                  Authorization: `Bearer ${supabaseKey}`
                }
              });
              if (profRes.ok) {
                const profs = await profRes.json();
                if (profs && profs[0]?.display_name) {
                  game.creator_name = profs[0].display_name;
                }
              }
            } catch {
              /* profile lookup is non-fatal */
            }
          }
        }
      }
    } catch (err) {
      console.warn('[game-preview] Supabase fetch error:', err?.message || err);
    }
  }

  // If game is not found or strictly private, serve the base HTML
  if (!game || game.visibility === 'private') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(html);
    return;
  }

  // Construct meta content
  const title = String(game.title || 'PlayMint Game').slice(0, 80);
  const modeName = MODE_LABELS[game.mode] || 'Game';
  const creator = game.creator_name || 'Community Creator';
  const desc = `Play "${title}", a procedural 2D ${modeName} created by ${creator} on PlayMint.`;

  let imageUrl = 'https://playmintai.vercel.app/assets/Logo_PlayMint_(transparent).png';
  if (game.thumbnail_path) {
    if (game.thumbnail_path.startsWith('http')) {
      imageUrl = game.thumbnail_path;
    } else {
      const base = publicBaseUrl();
      if (base) {
        imageUrl = `${base}/${game.thumbnail_path.replace(/^\/+/, '')}`;
      }
    }
  }

  const pageUrl = `https://playmintai.vercel.app/g/${encodeURIComponent(gameId)}`;

  // Replace / inject social meta tags in HTML
  let customHtml = html
    .replace(/<title>.*?<\/title>/i, `<title>${title} — Play on PlayMint</title>`)
    .replace(/<meta\s+name=["']description["'].*?>/i, `<meta name="description" content="${desc}" />`)
    .replace(/<meta\s+property=["']og:title["'].*?>/i, `<meta property="og:title" content="${title} — PlayMint" />`)
    .replace(/<meta\s+property=["']og:description["'].*?>/i, `<meta property="og:description" content="${desc}" />`)
    .replace(/<meta\s+property=["']og:image["'].*?>/i, `<meta property="og:image" content="${imageUrl}" />`)
    .replace(/<meta\s+name=["']twitter:title["'].*?>/i, `<meta name="twitter:title" content="${title} — PlayMint" />`)
    .replace(/<meta\s+name=["']twitter:description["'].*?>/i, `<meta name="twitter:description" content="${desc}" />`)
    .replace(/<meta\s+name=["']twitter:image["'].*?>/i, `<meta name="twitter:image" content="${imageUrl}" />`);

  // Inject og:url if missing
  if (!customHtml.includes('og:url')) {
    customHtml = customHtml.replace('</head>', `  <meta property="og:url" content="${pageUrl}" />\n  </head>`);
  } else {
    customHtml = customHtml.replace(/<meta\s+property=["']og:url["'].*?>/i, `<meta property="og:url" content="${pageUrl}" />`);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  res.status(200).send(customHtml);
}
