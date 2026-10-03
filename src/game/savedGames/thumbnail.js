// My Games card art compositor (revised 2026-10-03).
//
// Composited from the game's OWN assets — backdrop, floor, platform, player,
// and enemies/obstacles/collectibles.
// This guarantees that ANY saved game — whether auto-saved before live frame capture
// finishes, or loaded without WebGL readPixels — displays a rich, complete scene:
// the background, the ground floor line, floating platforms, coins/collectibles,
// the enemy, and the player character.

import { THEME_ART_URLS } from '../themes';

export const THUMB_W = 320;
export const THUMB_H = 180;

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

const loadArt = (url) =>
  new Promise((resolve) => {
    if (!url || typeof Image === 'undefined') return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

const paletteCache = new Map();

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
  // Align bottom-left so the landscape / horizon is visible
  ctx.drawImage(img, 0, h - dh, dw, dh);
  return true;
};

// Draw tiled or stretched floor at the bottom of the card (~28px high)
const drawFloor = (ctx, floorImg) => {
  const floorH = 28;
  const floorY = THUMB_H - floorH;
  if (floorImg) {
    const iw = floorImg.naturalWidth || floorImg.width || 32;
    const ih = floorImg.naturalHeight || floorImg.height || 32;
    for (let x = 0; x < THUMB_W; x += floorH) {
      ctx.drawImage(floorImg, 0, 0, iw, ih, x, floorY, floorH, floorH);
    }
  } else {
    // Stylized ground strip matching game floor
    ctx.fillStyle = '#223828';
    ctx.fillRect(0, floorY, THUMB_W, floorH);
    ctx.fillStyle = '#3a6642';
    ctx.fillRect(0, floorY, THUMB_W, 4);
  }
};

// Draw a floating platform with collectible / coin on it
const drawPlatformAndCollectibles = (ctx, platformImg, coinImg) => {
  const platX = 170;
  const platY = 95;
  const platW = 80;
  const platH = 14;

  if (platformImg) {
    const iw = platformImg.naturalWidth || platformImg.width || 32;
    const ih = platformImg.naturalHeight || platformImg.height || 16;
    ctx.drawImage(platformImg, 0, 0, iw, ih, platX, platY, platW, platH);
  } else {
    ctx.fillStyle = '#445566';
    ctx.fillRect(platX, platY, platW, platH);
    ctx.fillStyle = '#667788';
    ctx.fillRect(platX, platY, platW, 3);
  }

  // Draw collectible / coin above platform
  if (coinImg) {
    const cw = 20;
    const ch = 20;
    ctx.drawImage(coinImg, platX + 30, platY - 24, cw, ch);
  } else {
    // Gold coin fallback
    ctx.beginPath();
    ctx.arc(platX + 40, platY - 14, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#ffcc00';
    ctx.fill();
    ctx.strokeStyle = '#ff9900';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
};

// Draw the player character anchored above the floor on the left
const drawPlayer = (ctx, img, frames) => {
  const floorH = 28;
  const cols = Math.max(1, frames?.cols || 1);
  const rows = Math.max(1, frames?.rows || 1);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return false;
  const sw = iw / cols;
  const sh = ih / rows;
  const targetH = 56;
  const scale = targetH / sh;
  const targetW = sw * scale;
  const playerX = 42;
  const playerY = THUMB_H - floorH - targetH + 2; // slight ground overlap
  ctx.drawImage(img, 0, 0, sw, sh, playerX, playerY, targetW, targetH);
  return true;
};

// Draw enemy or obstacle on the right side of the screen
const drawEnemyOrObstacle = (ctx, enemyImg, obstacleImg) => {
  const floorH = 28;
  const targetImg = enemyImg || obstacleImg;
  if (!targetImg) return;
  const iw = targetImg.naturalWidth || targetImg.width;
  const ih = targetImg.naturalHeight || targetImg.height;
  if (!iw || !ih) return;
  const targetH = 46;
  const scale = targetH / ih;
  const targetW = iw * scale;
  const enemyX = THUMB_W - targetW - 32;
  const enemyY = THUMB_H - floorH - targetH + 2;
  ctx.drawImage(targetImg, 0, 0, iw, ih, enemyX, enemyY, targetW, targetH);
};

/**
 * Composite a full rich game scene for the thumbnail card.
 * Never throws — a missing thumbnail is cosmetic and must not fail a save.
 */
export const composeThumbnail = async ({ preloadedImages, assetMeta, themeKey } = {}) => {
  const generatedBg = preloadedImages?.background_far || preloadedImages?.background_mid;
  const player = preloadedImages?.player;
  const floor = preloadedImages?.floor;
  const platform = preloadedImages?.platform;
  const collectible = preloadedImages?.collectible;
  const enemy = preloadedImages?.enemy;
  const obstacle = preloadedImages?.obstacle;

  const key = themeKey || 'default';
  const palette = await sampleThemePalette(key);

  // Load fallback art if generated art is missing
  const themeArt = generatedBg ? null : await loadArt(THEME_ART_URLS[key]?.backdrop || THEME_ART_URLS.default.backdrop);
  const fallbackGround = floor ? null : await loadArt(THEME_ART_URLS[key]?.ground || THEME_ART_URLS.default.ground);

  const backdrop = generatedBg || themeArt;
  const effectiveFloor = floor || fallbackGround;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Background layer
    if (cover(ctx, backdrop, THUMB_W, THUMB_H)) {
      const scrim = ctx.createLinearGradient(0, THUMB_H * 0.45, 0, THUMB_H);
      scrim.addColorStop(0, 'rgba(0,0,0,0)');
      scrim.addColorStop(1, 'rgba(0,0,0,0.35)');
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

    // 2. Floor / Ground
    drawFloor(ctx, effectiveFloor);

    // 3. Platform & Coin / Collectible
    drawPlatformAndCollectibles(ctx, platform, collectible);

    // 4. Enemy or Obstacle
    drawEnemyOrObstacle(ctx, enemy, obstacle);

    // 5. Player Character (facing forward / right, on ground)
    if (player) {
      drawPlayer(ctx, player, assetMeta?.slots?.player?.frames);
    }

    return await new Promise((resolve) => {
      if (typeof canvas.toBlob !== 'function') { resolve(null); return; }
      canvas.toBlob((blob) => resolve(blob && blob.size > 0 ? blob : null), 'image/png');
    });
  } catch (err) {
    console.warn('[SavedGames] thumbnail composition skipped:', err?.message || err);
    return null;
  }
};
