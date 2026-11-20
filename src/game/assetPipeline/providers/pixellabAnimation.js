/**
 * PixelLab skeleton animation client (November 2026) — talks ONLY to our /api/animate
 * proxy (the key lives on the server). See api/animate.js and ../runCycle.js.
 *
 * animateHeroRun(heroCanvas) →
 *   1. fit the hero onto a 128×128 transparent frame (bottom-aligned, facing right)
 *   2. POST estimate  → the hero's 18-joint skeleton (≈0.1 generation)
 *   3. build 8 run + idle + jump skeletons from it (runCycle.js)
 *   4. POST start     → background job; POST poll every 3s
 *   5. decode the returned frames to 128×128 canvases
 * Throws a PixelLabError whose `kind` tells the caller whether to stop trying
 * ('unconfigured' | 'quota' | 'busy' | 'upstream' | 'timeout' | 'bad-output' | 'cancelled').
 */
import { buildRunSkeletons } from '../runCycle.js';
import { recordExternalCall } from './geminiImage.js';

export class PixelLabError extends Error {
  constructor(message, kind = 'upstream') {
    super(message);
    this.name = 'PixelLabError';
    this.kind = kind;
  }
}

// Documented ESTIMATE only: PixelLab bills in "generations" and publishes no USD price for
// this endpoint. The cost report labels it as an estimate; adjust when pricing is confirmed.
export const PIXELLAB_USD_PER_GENERATION = 0.008;
export const FRAME_SIZE = 128;

async function getAuthHeader() {
  try {
    const { getSupabase } = await import('../../../auth/supabaseClient.js');
    const supabase = await getSupabase();
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function post(body, signal) {
  const auth = await getAuthHeader();
  let res;
  try {
    res = await fetch('/api/animate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify(body),
      signal
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw new PixelLabError('cancelled', 'cancelled');
    throw new PixelLabError(`animation endpoint unreachable (${err?.message || err})`, 'unconfigured');
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (res.status === 404 || res.status === 405) throw new PixelLabError('animation endpoint not available', 'unconfigured');
  if (!res.ok) throw new PixelLabError(data?.error || `animation endpoint error ${res.status}`, data?.kind || (res.status === 429 ? 'quota' : 'upstream'));
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (canvas) => canvas.toDataURL('image/png').split(',')[1];

/** Fit the (keyed) hero onto a 128×128 transparent frame: ≤108px tall, bottom-aligned, centred. */
export function prepareHeroFrame(src) {
  const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
  const tmp = document.createElement('canvas');
  tmp.width = sw; tmp.height = sh;
  const tctx = tmp.getContext('2d');
  tctx.drawImage(src, 0, 0);
  const d = tctx.getImageData(0, 0, sw, sh).data;
  let minX = sw, minY = sh, maxX = -1, maxY = -1;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    if (d[(y * sw + x) * 4 + 3] >= 16) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) throw new PixelLabError('hero image is empty', 'bad-output');
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const scale = Math.min(108 / bh, 118 / bw);
  const dw = Math.max(1, Math.round(bw * scale)), dh = Math.max(1, Math.round(bh * scale));
  const out = document.createElement('canvas');
  out.width = FRAME_SIZE; out.height = FRAME_SIZE;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false; // keep the hero's pixels crisp
  ctx.drawImage(tmp, minX, minY, bw, bh, Math.round((FRAME_SIZE - dw) / 2), FRAME_SIZE - 6 - dh, dw, dh);
  return out;
}

async function decodeFrames(images) {
  const out = [];
  for (const data of images) {
    const img = new Image();
    img.src = data.startsWith('data:') ? data : `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = FRAME_SIZE; c.height = FRAME_SIZE;
    c.getContext('2d').drawImage(img, 0, 0, FRAME_SIZE, FRAME_SIZE);
    out.push(c);
  }
  return out;
}

/**
 * @param {HTMLImageElement|HTMLCanvasElement} heroSrc keyed static hero (transparent background)
 * @param {{description?: string, seed?: number, onProgress?: Function, signal?: AbortSignal, isCancelled?: () => boolean, timeoutMs?: number}} opts
 * @returns {Promise<{cells: HTMLCanvasElement[], generations: number, estUsd: number, firstFrame: HTMLCanvasElement}>}
 *   cells: 8 run frames, then idle, then jump (see RUN_SHEET_META in runCycle.js)
 */
export async function animateHeroRun(heroSrc, { description = 'game hero character', seed = 0, onProgress = () => {}, signal, isCancelled = () => false, timeoutMs = 150000 } = {}) {
  const t0 = performance.now();
  const first = prepareHeroFrame(heroSrc);
  const firstB64 = b64(first);

  onProgress('[ASSETS] Reading the hero skeleton...');
  const est = await post({ action: 'estimate', image: firstB64 }, signal);
  let skeletons;
  try {
    skeletons = buildRunSkeletons(est.keypoints);
  } catch (err) {
    throw new PixelLabError(`skeleton unusable: ${err.message}`, 'bad-output');
  }
  const firstKp = est.keypoints.map((k) => ({ x: k.x, y: k.y, label: k.label, z_index: Math.floor(k.z_index || 0) }));

  onProgress('[ASSETS] Animating the hero run cycle (skeleton)...');
  const started = await post({
    action: 'start',
    description: String(description).slice(0, 280),
    firstFrame: firstB64,
    firstKeypoints: firstKp,
    keypoints: skeletons,
    seed
  }, signal);

  let result = null;
  while (performance.now() - t0 < timeoutMs) {
    if (isCancelled()) throw new PixelLabError('cancelled', 'cancelled');
    await sleep(3000);
    const r = await post({ action: 'poll', jobId: started.jobId }, signal);
    if (r.status === 'completed') { result = r; break; }
    if (r.status === 'failed') throw new PixelLabError(r.error || 'animation job failed', 'upstream');
  }
  if (!result) throw new PixelLabError('animation job timed out', 'timeout');
  if (!Array.isArray(result.images) || result.images.length !== skeletons.length) {
    throw new PixelLabError(`expected ${skeletons.length} frames, got ${result.images?.length ?? 0}`, 'bad-output');
  }

  const cells = await decodeFrames(result.images);
  const generations = Number(result.usage?.generations ?? 3) + Number(est.usage?.generations ?? 0.1);
  const estUsd = generations * PIXELLAB_USD_PER_GENERATION;
  recordExternalCall({
    kind: 'animation', label: 'player_sheet:pixellab-skeleton', model: 'pixellab-animate-with-skeleton-v3',
    estUsd, generations, elapsedMs: Math.round(performance.now() - t0)
  });
  return { cells, generations, estUsd, firstFrame: first };
}
