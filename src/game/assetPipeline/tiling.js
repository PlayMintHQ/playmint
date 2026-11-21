// Seamless-tile helpers (2026-11-20, Arena Kit). Pure pixel math on RGBA arrays so it
// runs in node ($0 tests, scripts/test-tileable.mjs) as well as in the browser; the
// canvas wrappers at the bottom only call getImageData/putImageData on what they are
// given and import nothing from the DOM.
//
// Why this exists: image models are told "all four edges match" and mostly don't. A
// tile that repeats under a parallax layer (the drop below a rooftop) or along an edge
// (the rim strip) shows every miss as a hard line. `seamScore` measures the miss,
// `makeTileable` fixes it with the standard offset cross-blend.

const luma = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const pixDiff = (d, i, j) => (Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2])) / 3;

/**
 * How much worse the wrap-around seam is than an ordinary neighbouring-pixel step.
 * ~1 = invisible (a tileable texture), >2 = a visible line. Flat textures read ~1
 * (the epsilon keeps a near-uniform tile from dividing by zero).
 */
export function seamScore(data, w, h, axis = 'both') {
  const eps = 1.5;
  const axisScore = (horizontal) => {
    let seam = 0, inner = 0, nSeam = 0, nInner = 0;
    const lines = horizontal ? h : w;
    const len = horizontal ? w : h;
    const at = (line, k) => (horizontal ? (line * w + k) : (k * w + line)) * 4;
    for (let line = 0; line < lines; line++) {
      seam += pixDiff(data, at(line, 0), at(line, len - 1));
      nSeam++;
      const stride = Math.max(1, Math.floor(len / 64));
      for (let k = 0; k + 1 < len; k += stride) { inner += pixDiff(data, at(line, k), at(line, k + 1)); nInner++; }
    }
    return (seam / nSeam) / Math.max(eps, inner / Math.max(1, nInner));
  };
  if (axis === 'x') return axisScore(true);
  if (axis === 'y') return axisScore(false);
  return Math.max(axisScore(true), axisScore(false));
}

// Smoothstep weight: 0 at the image edge (where the original seam is), 1 once `band`
// of the span in from the edge.
function edgeWeight(pos, span, band) {
  const d = Math.min(pos, span - 1 - pos) / Math.max(1, span * band);
  const t = Math.min(1, Math.max(0, d));
  return t * t * (3 - 2 * t);
}

/**
 * Make the image wrap seamlessly: blend it with a half-shifted copy of itself, using
 * the original in the middle (its seam is far away) and the shifted copy at the edges
 * (whose content is continuous there). Returns a NEW Uint8ClampedArray.
 * axis: 'x' | 'y' | 'both'. band: how far in from each edge the blend reaches (0-0.5).
 */
export function makeTileable(data, w, h, axis = 'both', band = 0.35) {
  const pass = (src, horizontal) => {
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const sx = horizontal ? (x + (w >> 1)) % w : x;
        const sy = horizontal ? y : (y + (h >> 1)) % h;
        const j = (sy * w + sx) * 4;
        const wt = edgeWeight(horizontal ? x : y, horizontal ? w : h, band); // weight of the ORIGINAL
        for (let c = 0; c < 4; c++) out[i + c] = Math.round(src[i + c] * wt + src[j + c] * (1 - wt));
      }
    }
    return out;
  };
  let out = data;
  if (axis === 'x' || axis === 'both') out = pass(out, true);
  if (axis === 'y' || axis === 'both') out = pass(out, false);
  return out === data ? new Uint8ClampedArray(data) : out;
}

/**
 * Average / light / dark colour of an image (RGBA array), by luminance bands. `light`
 * is the mean of the brightest 15% of pixels, `dark` of the darkest 15%. Used to
 * colour code-drawn pieces (rim fallback, corner posts, depth haze) from the art.
 */
export function samplePalette(data, w, h, step = 1) {
  const bins = new Uint32Array(256);
  let n = 0, r = 0, g = 0, b = 0;
  const px = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 16) continue;
      const l = Math.round(luma(data, i));
      bins[l]++;
      n++; r += data[i]; g += data[i + 1]; b += data[i + 2];
      px.push(i);
    }
  }
  if (!n) return { avg: { r: 64, g: 64, b: 72 }, light: { r: 140, g: 140, b: 150 }, dark: { r: 20, g: 20, b: 26 }, luma: 64, spread: 0 };
  const avg = { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  // luminance cut-offs for the bottom / top 15%
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += bins[v]; if (acc >= n * 0.15) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += bins[v]; if (acc >= n * 0.15) { hi = v; break; } }
  const mean = (pred) => {
    let c = 0, rr = 0, gg = 0, bb = 0;
    for (const i of px) { if (pred(luma(data, i))) { c++; rr += data[i]; gg += data[i + 1]; bb += data[i + 2]; } }
    return c ? { r: Math.round(rr / c), g: Math.round(gg / c), b: Math.round(bb / c) } : avg;
  };
  const light = mean((l) => l >= hi);
  const dark = mean((l) => l <= lo);
  let variance = 0;
  const meanL = 0.299 * avg.r + 0.587 * avg.g + 0.114 * avg.b;
  for (const i of px) { const d = luma(data, i) - meanL; variance += d * d; }
  return { avg, light, dark, luma: meanL, spread: Math.sqrt(variance / n) };
}

export const toHex = (c) => (c.r << 16) | (c.g << 8) | c.b;
export const mixRgb = (a, b, t) => ({
  r: Math.round(a.r + (b.r - a.r) * t), g: Math.round(a.g + (b.g - a.g) * t), b: Math.round(a.b + (b.b - a.b) * t)
});
export const scaleRgb = (c, k) => ({
  r: Math.max(0, Math.min(255, Math.round(c.r * k))), g: Math.max(0, Math.min(255, Math.round(c.g * k))), b: Math.max(0, Math.min(255, Math.round(c.b * k)))
});

// ── canvas wrappers (browser) ────────────────────────────────────────────────────────
const SEAM_OK = 1.8; // above this the line is visible; below it we leave the art alone
const FLAT_SPREAD = 4; // luminance std-dev under this = a dead-uniform tile (nothing to show)

/**
 * Check a generated tile and fix its seams in place. Returns
 * { before, after, blended, flat } — `flat` means the texture carries no detail, so the
 * caller should drop it and let the code-drawn fallback show instead.
 */
export function tileCanvas(canvas, axis = 'both') {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const before = seamScore(img.data, w, h, axis);
  const spread = samplePalette(img.data, w, h, 2).spread;
  if (spread < FLAT_SPREAD) return { before, after: before, blended: false, flat: true };
  if (before <= SEAM_OK) return { before, after: before, blended: false, flat: false };
  const fixed = makeTileable(img.data, w, h, axis);
  const after = seamScore(fixed, w, h, axis);
  if (after < before) ctx.putImageData(new ImageData(fixed, w, h), 0, 0);
  return { before, after: Math.min(before, after), blended: after < before, flat: false };
}

/** Palette of a canvas / image element (downsampled so a 2K plate costs ~nothing). */
export function paletteOfSource(source, maxSide = 64) {
  const sw = source.width || source.naturalWidth, sh = source.height || source.naturalHeight;
  if (!sw || !sh) return null;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return samplePalette(data, w, h, 1);
}

/**
 * Colours of the top half (the walkable lip) and bottom half (the outer face) of a
 * rim strip, so corner posts and pool crusts can match the generated art.
 */
export function stripHalves(source) {
  const sw = source.width || source.naturalWidth, sh = source.height || source.naturalHeight;
  if (!sw || !sh) return null;
  const w = 64, h = 16;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const half = (w * (h / 2)) * 4;
  return {
    top: samplePalette(data.subarray(0, half), w, h / 2, 1),
    bottom: samplePalette(data.subarray(half), w, h / 2, 1)
  };
}

// ── Ground synthesis (2026-11-21, ground-as-material) ───────────────────────────────────
// The shooter's ground must be a MATERIAL: it may never encode geometry (walls, an edge, a
// skyline), because the walkable region is defined by code. These pure functions build a
// full-arena ground from a small seamless tile (`bakeStochastic`) or from nothing at all
// (`proceduralGround`), deterministically from a seed, so the result is identical on every
// device and testable in node.

/** FNV-1a string hash → 32-bit seed. */
export function hashSeed(str) {
  let h = 2166136261;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** mulberry32 PRNG → () => [0,1). */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise in [-1, 1] on a coarse lattice (`wave` px between lattice points).
function makeValueNoise(w, h, wave, rand) {
  const cols = Math.ceil(w / wave) + 3, rows = Math.ceil(h / wave) + 3;
  const lat = new Float32Array(cols * rows);
  for (let i = 0; i < lat.length; i++) lat[i] = rand() * 2 - 1;
  return (x, y) => {
    const fx = x / wave, fy = y / wave;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = lat[y0 * cols + x0], b = lat[y0 * cols + x0 + 1];
    const c = lat[(y0 + 1) * cols + x0], d = lat[(y0 + 1) * cols + x0 + 1];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}

// 4×4 Bayer ordered-dither thresholds in (0,1): crisp joins between tile cells, no ghosting.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/**
 * Fill outW×outH from a small SEAMLESS tile without a visible repeat: staggered cells, each
 * with a random wrap offset and one of 4 flip orientations (no 90° turns: a directional ground
 * such as diagonal stripes or panels would otherwise show patches of rotated pattern), joined by an ordered-dither
 * band, then a faint low-frequency tint so the periodicity cue disappears.
 * @param tile  {data: Uint8ClampedArray (RGBA), w, h}
 * @returns Uint8ClampedArray RGBA, outW*outH*4
 */
export function bakeStochastic(tile, outW, outH, seed, { cell = 288, join = 14, tint = 0.05 } = {}) {
  const { data: td, w: tw, h: th } = tile;
  const rand = rng(seed);
  const cols = Math.ceil(outW / cell) + 3, rows = Math.ceil(outH / cell) + 3;
  const cellParams = new Array(cols * rows);
  for (let i = 0; i < cellParams.length; i++) {
    cellParams[i] = { dx: Math.floor(rand() * tw), dy: Math.floor(rand() * th), o: Math.floor(rand() * 4) };
  }
  const stagger = (r) => ((r & 1) ? cell >> 1 : 0);
  const rowCol = (x, r) => {
    const xo = stagger(r);
    const c = Math.floor((x - xo) / cell);
    return { c, u: (x - xo) - c * cell };
  };
  const param = (r, c) => cellParams[Math.max(0, Math.min(rows - 1, r + 1)) * cols + Math.max(0, Math.min(cols - 1, c + 1))];
  // Coordinates may run past a cell's edge (u or v outside [0, cell)): sample() wraps through
  // the seamless tile, so a neighbour cell simply continues into its neighbour's area.
  const sample = (p, u, v, out, oi) => {
    let px = u, py = v;
    if (p.o & 1) px = cell - 1 - px;
    if (p.o & 2) py = cell - 1 - py;
    const tx = (((px + p.dx) % tw) + tw) % tw, ty = (((py + p.dy) % th) + th) % th;
    const ti = ((ty | 0) * tw + (tx | 0)) * 4;
    out[oi] = td[ti]; out[oi + 1] = td[ti + 1]; out[oi + 2] = td[ti + 2]; out[oi + 3] = 255;
  };
  const noise = makeValueNoise(outW, outH, 700, rand);
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const r0 = Math.floor(y / cell);
    const v0 = y - r0 * cell;
    for (let x = 0; x < outW; x++) {
      const { c: c0, u: u0 } = rowCol(x, r0);
      let r = r0, c = c0, u = u0, v = v0;
      // join with the left neighbour (ordered dither over `join` px), then with the row above
      if (u0 < join && BAYER[((y & 3) << 2) | (x & 3)] >= 0.5 + 0.5 * (u0 / join)) { c = c0 - 1; u = u0 + cell; }
      if (v0 < join && BAYER[((x & 3) << 2) | (y & 3)] >= 0.5 + 0.5 * (v0 / join)) {
        r = r0 - 1;
        const rc = rowCol(x, r);
        c = rc.c; u = rc.u; v = v0 + cell;
      }
      const oi = (y * outW + x) * 4;
      sample(param(r, c), u, v, out, oi);
      const k = 1 + noise(x, y) * tint;
      out[oi] *= k; out[oi + 1] *= k; out[oi + 2] *= k;
    }
  }
  return out;
}

/**
 * A ground with NO source image: panelled concrete/metal in the given palette — the last rung
 * of the fallback ladder, so a ground always exists and can never contain geometry.
 * @param palette {avg, light, dark} (rgb objects)
 */
export function proceduralGround(outW, outH, palette, seed) {
  const rand = rng(seed);
  const lo = makeValueNoise(outW, outH, 520, rand);
  const mid = makeValueNoise(outW, outH, 150, rand);
  const base = palette?.avg || { r: 70, g: 74, b: 84 };
  const dark = palette?.dark || { r: base.r * 0.5, g: base.g * 0.5, b: base.b * 0.5 };
  const light = palette?.light || { r: Math.min(255, base.r * 1.4), g: Math.min(255, base.g * 1.4), b: Math.min(255, base.b * 1.4) };
  // Panel grid with jittered pitch: thin darker seams + a slight per-panel value shift.
  const pitch = 128 + Math.floor(rand() * 48);
  const panelShift = new Float32Array(64 * 64);
  for (let i = 0; i < panelShift.length; i++) panelShift[i] = (rand() - 0.5) * 0.10;
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const px = Math.floor(x / pitch), py = Math.floor(y / pitch);
      const shift = panelShift[((py & 63) << 6) | (px & 63)];
      const gx = x - px * pitch, gy = y - py * pitch;
      const seam = (gx < 2 || gy < 2) ? 1 : 0;
      const hi = (gx === 2 || gy === 2) ? 1 : 0; // a 1px highlight beside the seam
      let k = 1 + lo(x, y) * 0.08 + mid(x, y) * 0.05 + shift;
      const speck = ((hashSeed(`${x},${y}`) & 1023) < 3) ? (rand() < 0.5 ? 0.82 : 1.15) : 1;
      k *= speck;
      let r = base.r * k, g = base.g * k, b = base.b * k;
      if (seam) { r = dark.r; g = dark.g; b = dark.b; }
      else if (hi) { r = r * 0.7 + light.r * 0.3; g = g * 0.7 + light.g * 0.3; b = b * 0.7 + light.b * 0.3; }
      const oi = (y * outW + x) * 4;
      out[oi] = r; out[oi + 1] = g; out[oi + 2] = b; out[oi + 3] = 255;
    }
  }
  return out;
}

/** Palette of the CENTRE of an image (the plate's skyline lives at its edges). Browser only. */
export function paletteOfCenter(source, frac = 0.4, maxSide = 64) {
  const sw = source.width || source.naturalWidth, sh = source.height || source.naturalHeight;
  if (!sw || !sh) return null;
  const cw = sw * frac, ch = sh * frac;
  const k = Math.min(1, maxSide / Math.max(cw, ch));
  const w = Math.max(1, Math.round(cw * k)), h = Math.max(1, Math.round(ch * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h);
  return samplePalette(ctx.getImageData(0, 0, w, h).data, w, h, 1);
}
