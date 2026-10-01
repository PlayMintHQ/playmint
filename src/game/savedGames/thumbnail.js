// My Games card art (2026-09-27, reworked 2026-09-29). Composited from the
// game's OWN art — the background and player images that generation already
// produced and the asset cache already uploaded. No new paid generation step
// (contract 2B).
//
// The player's image is a 1xN run-cycle STRIP whenever the spritesheet gates
// passed, so drawing the raw image would paint the whole strip into the card.
// assetMeta.slots.player.frames carries the grid, and cell 0 is drawn instead.
//
// A static-art game (Gemini dead / cache-only boot — see buildFallbackBoot) has
// no preloadedImages at all, and no art_id to upload under. It used to get no
// file, and the grid painted THUMB_PALETTE[themeKey] — but a prompt-generated
// game has themeKey null (no theme defaults to 'ice' any more), so that landed
// on THUMB_PALETTE.default: #0a0d14 → #5f7590, a near-black 16:9 rectangle. The
// client read that as "the thumbnail area is blank". The fix is that the card
// now paints the BUILT-IN WORLD'S REAL ART (THEME_ART_URLS backdrop) and a
// palette SAMPLED from that same art, so every card is identifiable whether or
// not an upload succeeded.

import { THEME_ART_URLS } from '../themes';

export const THUMB_W = 320;
export const THUMB_H = 180;

// Fallback palette per built-in world, sky → ground. Last resort ONLY: a card
// with reachable art samples its own colours from that art (sampleThemePalette).
// `default` is deliberately mid-tone rather than near-black — a prompt-generated
// game has no themeKey, so this is the palette a custom world lands on, and a
// near-black card is indistinguishable from a failed load.
export const THUMB_PALETTE = {
  ice: ['#12324d', '#2a6a8f', '#9fe0f2'],
  lava: ['#3a1109', '#8f2a0e', '#ffab52'],
  forest: ['#12301c', '#2a5c33', '#a2dc7c'],
  city: ['#151a2c', '#343c63', '#93b6ff'],
  space: ['#0d0a26', '#2e2260', '#c0a2ff'],
  default: ['#1b2740', '#31456b', '#8fa6c4']
};

export const thumbPalette = (themeKey) =>
  THUMB_PALETTE[themeKey] || THUMB_PALETTE.default;

const toHex = (r, g, b) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/**
 * Load a same-origin art URL into an HTMLImageElement. Never rejects — a card
 * must not depend on a fetch succeeding.
 */
const loadArt = (url) =>
  new Promise((resolve) => {
    if (!url || typeof Image === 'undefined') return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

// themeKey → [c1, c2, c3]. Cached for the session: there are six built-in
// worlds, so the whole library samples at most six images, once.
const paletteCache = new Map();

/**
 * The card's fallback gradient, sampled from the world's own backdrop art.
 *
 * Samples a 4-column grid (top / upper-mid / ground band) of a tiny downscale of
 * the real image, so the gradient matches what the game actually looks like —
 * a lava world goes orange, an ice world goes blue — with no hard-coded table to
 * drift out of sync with the art. Falls back to THUMB_PALETTE when the art
 * cannot load (offline, path drift), which is the only case the table serves now.
 *
 * @param {string} [themeKey]
 * @returns {Promise<string[]>} three CSS colours
 */
export const sampleThemePalette = async (themeKey) => {
  const key = themeKey || 'default';
  const cached = paletteCache.get(key);
  if (cached) return cached;
  const img = await loadArt(THEME_ART_URLS[key]?.backdrop || THEME_ART_URLS.default.backdrop);
  if (!img) return thumbPalette(key);
  try {
    const w = 12;
    const h = 7;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return thumbPalette(key);
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    // Column means at three depths: the sky band, the mid band, the ground band.
    const band = (rowFrom, rowTo) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = rowFrom; y < rowTo; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
      }
      return toHex(r / n, g / n, b / n);
    };
    // Lift the sky band a little: real backdrops are often dark, and the grid
    // paints this over a near-black page.
    const palette = [band(0, 2), band(2, 4), band(4, 7)];
    paletteCache.set(key, palette);
    return palette;
  } catch {
    return thumbPalette(key);
  }
};

const cover = (ctx, img, w, h) => {
  if (!img) return false;
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
 * Composite a PNG Blob for a game, or null when nothing can be painted (the
 * caller then leaves thumbnail_path null and the card paints a sampled
 * gradient). Never throws — a missing thumbnail is cosmetic and must not fail a
 * save.
 *
 * Backdrop resolution, in order:
 *   1. the game's OWN generated background (background_far, else background_mid)
 *   2. the BUILT-IN WORLD'S real backdrop art for a static-art game — a local
 *      asset, no spend, and the difference between a recognisable card and a
 *      blank one
 *   3. the sampled palette
 *
 * @param {object} opts
 * @param {Record<string, HTMLImageElement>} [opts.preloadedImages]
 * @param {object} [opts.assetMeta]  read for slots.player.frames (the strip grid)
 * @param {string} [opts.themeKey]  built-in world key, for the no-Art fill
 * @returns {Promise<Blob|null>}
 */
export const composeThumbnail = async ({ preloadedImages, assetMeta, themeKey } = {}) => {
  const generatedBg = preloadedImages?.background_far || preloadedImages?.background_mid;
  const player = preloadedImages?.player;
  const palette = await sampleThemePalette(themeKey);
  // Resolved in parallel with the canvas work below: a static-art game pays one
  // local image load, memoized for the session.
  const themeArt = generatedBg ? null : await loadArt(THEME_ART_URLS[themeKey || 'default']?.backdrop);
  const backdrop = generatedBg || themeArt;
  if (!backdrop && !player) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (cover(ctx, backdrop, THUMB_W, THUMB_H)) {
      // Scrim: the card is a fraction of the game's size, so the subject needs
      // the contrast the game gets from its own floor band.
      const scrim = ctx.createLinearGradient(0, THUMB_H * 0.45, 0, THUMB_H);
      scrim.addColorStop(0, 'rgba(0,0,0,0)');
      scrim.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, THUMB_W, THUMB_H);
    } else {
      const grad = ctx.createLinearGradient(0, 0, THUMB_W, THUMB_H);
      grad.addColorStop(0, palette[0]);
      grad.addColorStop(0.55, palette[1]);
      grad.addColorStop(1, palette[2]);
      ctx.fillStyle = grad;
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
