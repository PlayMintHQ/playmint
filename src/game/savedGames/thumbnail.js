// My Games card art (2026-09-27). Composited from the game's OWN art — the
// background and player images that generation already produced and the asset
// cache already uploaded. No new paid generation step (contract 2B).
//
// The player's image is a 1xN run-cycle STRIP whenever the spritesheet gates
// passed, so drawing the raw image would paint the whole strip into the card.
// assetMeta.slots.player.frames carries the grid, and cell 0 is drawn instead.
//
// Static-theme games (a Gemini-dead or cache-only boot — see buildFallbackBoot)
// have no preloadedImages at all and no art_id to upload under, so they get no
// file: the grid paints THUMB_PALETTE[themeKey] instead. Every world that can
// reach that branch has real static art in the game itself, so the card still
// reads as the right game.

export const THUMB_W = 320;
export const THUMB_H = 180;

// Sky → ground per built-in world, for the no-Art fallback card. themes.js
// carries tints but no CSS-ready palette, and the fallback must not invent one
// per prompt — the five curated sets are the whole point of that branch.
export const THUMB_PALETTE = {
  ice: ['#0d2740', '#1d4f6e', '#8fd4e8'],
  lava: ['#2b0d0d', '#7a2410', '#ff9a3c'],
  forest: ['#0f2417', '#1f4a2a', '#8fce6a'],
  city: ['#101322', '#2a3050', '#7fa8ff'],
  space: ['#08061c', '#241a4d', '#b18cff'],
  default: ['#0a0d14', '#1b2436', '#5f7590'],
};

export const thumbPalette = (themeKey) =>
  THUMB_PALETTE[themeKey] || THUMB_PALETTE.default;

const cover = (ctx, img, w, h) => {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return false;
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return true;
};

// Bottom-anchored, ~62% of card height, centred — the player reads as the
// subject the way it does in the game (ground-anchored, origin 0.5/1).
const drawPlayer = (ctx, img, frames) => {
  const cols = Math.max(1, frames?.cols || 1);
  const rows = Math.max(1, frames?.rows || 1);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return false;
  const sw = iw / cols;
  const sh = ih / rows;
  const th = THUMB_H * 0.62;
  const scale = th / sh;
  const tw = sw * scale;
  ctx.drawImage(img, 0, 0, sw, sh, (THUMB_W - tw) / 2, THUMB_H - th, tw, th);
  return true;
};

/**
 * Composite a PNG Blob for a game, or null when the game has no generated art
 * (the caller then leaves thumbnail_path null and the card paints a gradient).
 * Never throws — a missing thumbnail is cosmetic and must not fail a save.
 *
 * @param {object} opts
 * @param {Record<string, HTMLImageElement>} [opts.preloadedImages]
 * @param {object} [opts.assetMeta]  read for slots.player.frames (the strip grid)
 * @param {string} [opts.themeKey]  built-in world key, for the no-Art fill
 * @returns {Promise<Blob|null>}
 */
export const composeThumbnail = async ({ preloadedImages, assetMeta, themeKey } = {}) => {
  const bg = preloadedImages?.background_far || preloadedImages?.background_mid;
  const player = preloadedImages?.player;
  if (!bg && !player) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (bg && cover(ctx, bg, THUMB_W, THUMB_H)) {
      // Scrim: the card is a fraction of the game's size, so the subject needs
      // the contrast the game gets from its own floor band.
      const scrim = ctx.createLinearGradient(0, THUMB_H * 0.45, 0, THUMB_H);
      scrim.addColorStop(0, 'rgba(0,0,0,0)');
      scrim.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, THUMB_W, THUMB_H);
    } else {
      ctx.fillStyle = thumbPalette(themeKey)[0];
      ctx.fillRect(0, 0, THUMB_W, THUMB_H);
    }

    if (player) drawPlayer(ctx, player, assetMeta?.slots?.player?.frames);

    return await new Promise((resolve) => {
      if (typeof canvas.toBlob !== 'function') { resolve(null); return; }
      canvas.toBlob((blob) => resolve(blob && blob.size > 0 ? blob : null), 'image/png');
    });
  } catch (err) {
    console.warn('[SavedGames] thumbnail skipped:', err?.message || err);
    return null;
  }
};
