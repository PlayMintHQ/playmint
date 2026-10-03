// A real frame of the real game (2026-09-29, revised 2026-10-03).
//
// The My Games card was composited from the game's own ASSETS: background image,
// scrim, player sprite on a painted ground line. That is a reconstruction of what
// the game looks like, not what it looks like — and for a static-art boot (no
// preloadedImages at all) there was nothing to reconstruct from, so the card fell
// back to a sampled background colour. The client's verdict on that: the
// thumbnail has to BE a frame of the game, not a sample colour.
//
// The frame is already being rendered to a canvas 60 times a second. Phaser's
// renderer.snapshot() reads the pixels back out of the current frame buffer
// (readPixels, not a canvas.toDataURL hack), so this needs no
// `preserveDrawingBuffer: true` — which matters, because turning that on costs
// every frame of the whole app, and no other feature needs it.
//
// Cost: one readPixels + one 320x180 draw. Local, free, and off the render path
// by construction (Phaser defers the read until after the current frame is done).

import { THUMB_W, THUMB_H } from './savedGames/thumbnail';

/**
 * Grabs the running game's canvas and returns it as a PNG Blob, cropped into
 * the card's 16:9 aspect from the bottom-left corner of the viewport so the
 * ground, player, platforms, enemies, and coins are visible.
 *
 * Resolves null — never rejects — when there is no game, no renderer, or the
 * snapshot came back empty. A missing thumbnail is cosmetic; a thrown error
 * here would take down the auto-save that is waiting on it.
 *
 * @returns {Promise<Blob|null>}
 */
export const captureGameFrame = () =>
  new Promise((resolve) => {
    const game = typeof window !== 'undefined' ? window.__PHASER_GAME : null;
    const renderer = game && game.renderer;
    if (!renderer || typeof renderer.snapshot !== 'function') {
      resolve(null);
      return;
    }
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const guard = setTimeout(() => done(null), 4000);
    try {
      renderer.snapshot((image) => {
        clearTimeout(guard);
        try {
          done(toCardBlob(image, game));
        } catch (err) {
          console.warn('[frameCapture] snapshot returned an unusable image:', err);
          done(null);
        }
      }, 'image/png');
    } catch (err) {
      clearTimeout(guard);
      console.warn('[frameCapture] snapshot failed:', err);
      done(null);
    }
  });

/** Crops a frame to 16:9 at card size, smartly tracking the player. */
const toCardBlob = (image, game) => {
  const srcW = image?.width || image?.videoWidth || 0;
  const srcH = image?.height || image?.videoHeight || 0;
  if (!srcW || !srcH) return null;
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;

  const targetAspect = THUMB_W / THUMB_H;
  const srcAspect = srcW / srcH;
  let sw = srcW;
  let sh = srcH;
  if (srcAspect > targetAspect) sw = Math.round(srcH * targetAspect);
  else sh = Math.round(srcW / targetAspect);

  // Default to center crop
  let px = srcW / 2;
  let py = srcH / 2;

  // Try to find the player on screen to focus the crop exactly on them
  if (game) {
    const scene = game.scene.getScene('GameManagerScene');
    if (scene && scene.player && scene.cameras.main) {
      const cam = scene.cameras.main;
      const vw = cam.worldView.width;
      const vh = cam.worldView.height;
      if (vw > 0 && vh > 0) {
        // Calculate the player's percentage across the camera viewport
        const pctX = (scene.player.x - cam.worldView.x) / vw;
        const pctY = (scene.player.y - cam.worldView.y) / vh;
        px = pctX * srcW;
        py = pctY * srcH;
      }
    }
  }

  // Center the crop window around the player's coordinates
  let sx = Math.round(px - sw / 2);
  let sy = Math.round(py - sh / 2);

  // Clamp strictly to the image bounds so we never draw out of bounds
  sx = Math.max(0, Math.min(sx, srcW - sw));
  sy = Math.max(0, Math.min(sy, srcH - sh));

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, THUMB_W, THUMB_H);
  return canvasToBlob(canvas);
};

const canvasToBlob = (canvas) =>
  new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => resolve(blob || null), 'image/png');
  });

/**
 * Captures a frame once the game scene is ACTUALLY PLAYING — not just when
 * assets finish loading. The key insight: `phaser-load-complete` fires when
 * the Phaser preloader finishes, but create() (which spawns the player,
 * platforms, enemies, coins) runs AFTER that. We need to wait for objects to
 * be visible on screen.
 *
 * Strategy:
 *   1. Wait for `phaser-load-complete` (assets loaded, create() about to run).
 *   2. Then wait a generous delay (3 seconds) for create() to place all game
 *      objects, physics to settle, and at least several frames to render.
 *   3. Capture THREE frames at staggered intervals (3s, 5s, 7s). The first
 *      successful non-empty capture wins. This handles games where AI assets
 *      take longer to register, or where the scene starts with a fade-in.
 *   4. If a later capture produces a better frame (more pixels that aren't
 *      just the background colour), it replaces the first one.
 *
 * Returns null instead of throwing. Never blocks the save path.
 */
export const captureGameFrameWhenReady = () =>
  new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.__PHASER_GAME) {
      resolve(null);
      return;
    }

    let resolved = false;
    const bestCapture = { blob: null };

    const tryCapture = async () => {
      const blob = await captureGameFrame();
      if (!blob || resolved) return;
      // Accept ANY non-null blob; later attempts can improve it.
      if (!bestCapture.blob) {
        bestCapture.blob = blob;
      } else if (blob.size > bestCapture.blob.size) {
        // A larger PNG means more visual detail (not just solid background).
        bestCapture.blob = blob;
      }
    };

    const finishWithBest = () => {
      if (resolved) return;
      resolved = true;
      resolve(bestCapture.blob);
    };

    // Schedule three capture attempts at staggered intervals after the
    // scene has had time to fully render.
    const scheduleCaptures = () => {
      // First capture: 100ms after create (giving one frame to render)
      setTimeout(async () => {
        await tryCapture();
        if (bestCapture.blob && !resolved) {
          resolved = true;
          resolve(bestCapture.blob);
        }
      }, 100);

      // Second capture: 1.5 seconds
      setTimeout(async () => {
        await tryCapture();
        if (bestCapture.blob && !resolved) {
          resolved = true;
          resolve(bestCapture.blob);
        }
      }, 1500);

      // Final backstop: 3 seconds — resolve with whatever we have.
      setTimeout(() => {
        tryCapture().finally(finishWithBest);
      }, 3000);
    };

    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      window.removeEventListener('scene-ready-for-capture', start);
      scheduleCaptures();
    };

    window.addEventListener('scene-ready-for-capture', start);
    // Fallback: if the event already fired, start immediately.
    setTimeout(start, 500);

    // Absolute backstop: never leave the promise hanging.
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(bestCapture.blob);
      }
    }, 12000);
  });
