// A real frame of the real game (2026-09-29).
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
 * Grabs the running game's canvas and returns it as a PNG Blob, letterboxed into
 * the card's 16:9 aspect (centre-cropped horizontally on tall phone screens, so
 * the card never letterboxes itself).
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
    // Belt and braces: an already-destroyed game (route change mid-capture) has
    // no live context and would throw out of the renderer.
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    // snapshot's callback can never be reached if the loop has stopped, so cap
    // the wait rather than leaving a save hanging on a promise.
    const guard = setTimeout(() => done(null), 4000);
    try {
      renderer.snapshot((image) => {
        clearTimeout(guard);
        try {
          done(toCardBlob(image));
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

/** Centre-crops a frame to 16:9 at card size and encodes it as a PNG Blob. */
const toCardBlob = (image) => {
  const srcW = image?.width || image?.videoWidth || 0;
  const srcH = image?.height || image?.videoHeight || 0;
  if (!srcW || !srcH) return null;
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Nearest-neighbour: the game renders with a NEAREST filter (pixelArt), and
  // bilinear downscaling of pixel art to 320px is what makes card art look
  // blurry next to the crisp in-game frame it came from.
  ctx.imageSmoothingEnabled = false;
  // Cover-crop to 16:9 (a phone in portrait gives a tall frame; a desktop window
  // a wide one — either way the card is 16:9).
  const targetAspect = THUMB_W / THUMB_H;
  const srcAspect = srcW / srcH;
  let sw = srcW;
  let sh = srcH;
  if (srcAspect > targetAspect) sw = Math.round(srcH * targetAspect);
  else sh = Math.round(srcW / targetAspect);
  const sx = Math.round((srcW - sw) / 2);
  const sy = Math.round((srcH - sh) / 2);
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, THUMB_W, THUMB_H);
  return canvasToBlob(canvas);
};

/** toBlob is async and absent in ancient Safari — both paths stay inside the promise. */
const canvasToBlob = (canvas) =>
  new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => resolve(blob || null), 'image/png');
  });

/**
 * Captures a frame once the game is actually up, on a small delay so the shot
 * is a settled scene (assets registered, player mid-stride) rather than the
 * first frame of a black canvas. Returns null instead of throwing, and is a
 * no-op when no game is mounted.
 *
 * Listens for `phaser-load-complete` (App already relies on that event) and
 * also fires on a timeout, because a resumed or already-loaded game can have
 * emitted the event before this listener existed.
 */
export const captureGameFrameWhenReady = (delayMs = 1400) =>
  new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.__PHASER_GAME) {
      resolve(null);
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(fallback);
      window.removeEventListener('phaser-load-complete', onLoad);
      setTimeout(() => resolve(null), delayMs + 4000);
      captureGameFrame().then(resolve);
    };
    const onLoad = () => setTimeout(finish, delayMs);
    const timer = setTimeout(finish, delayMs);
    // Backstop for the case where the event already fired (restore remount).
    const fallback = setTimeout(finish, delayMs + 2500);
    window.addEventListener('phaser-load-complete', onLoad);
  });
