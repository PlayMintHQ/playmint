#!/usr/bin/env node
// Arena Kit tile helpers, checked at $0 on synthetic pixels (Node 18+, no deps).
// Covers src/game/assetPipeline/tiling.js: seamScore, makeTileable, samplePalette.
//
// Usage: node scripts/test-tileable.mjs

import { seamScore, makeTileable, samplePalette, mixRgb, scaleRgb, toHex } from '../src/game/assetPipeline/tiling.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

const mulberry = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Build an RGBA array from f(x, y) -> [r, g, b].
const make = (w, h, f) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = f(x, y);
    const i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  return d;
};

const W = 128, H = 128, TAU = Math.PI * 2;
const rnd = mulberry(7);
const phases = Array.from({ length: 6 }, () => [rnd() * TAU, rnd() * TAU, 1 + Math.floor(rnd() * 4), 1 + Math.floor(rnd() * 4)]);
// Periodic in both axes by construction (integer wave counts) → a genuinely tileable texture.
const periodic = (x, y) => {
  let v = 0;
  for (const [px, py, kx, ky] of phases) v += Math.sin((x / W) * TAU * kx + px) * Math.cos((y / H) * TAU * ky + py);
  const c = Math.max(0, Math.min(255, 128 + v * 22));
  return [c, c * 0.9, c * 0.7];
};

// 1. a tileable texture scores as invisible
const tile = make(W, H, periodic);
const s0 = seamScore(tile, W, H, 'both');
check('periodic texture has no visible seam', s0 < 1.8, `score ${s0.toFixed(2)}`);

// 2. a horizontal ramp is not tileable on x, is on y; blending fixes x without breaking y
const ramp = make(W, H, (x, y) => { const c = (x / (W - 1)) * 255; return [c, c, c]; });
const rx = seamScore(ramp, W, H, 'x'), ry = seamScore(ramp, W, H, 'y');
check('ramp: x seam is flagged', rx > 5, `x ${rx.toFixed(1)}`);
check('ramp: y seam is clean', ry < 1.8, `y ${ry.toFixed(2)}`);
const rampFixed = makeTileable(ramp, W, H, 'x');
const rxAfter = seamScore(rampFixed, W, H, 'x');
check('makeTileable(x) removes the ramp seam', rxAfter < 1.8, `x ${rx.toFixed(1)} -> ${rxAfter.toFixed(2)}`);
check('makeTileable(x) leaves y alone', seamScore(rampFixed, W, H, 'y') < 1.8);

// 3. the usual model failure: the texture is textured but LIT unevenly (a baked-in
// gradient / vignette), so opposite edges differ on both axes
const bad = make(W, H, (x, y) => { const [r, g, b] = periodic(x, y); const k = (0.6 + 0.8 * (x / W)) * (0.75 + 0.5 * (y / H)); return [r * k, g * k, b * k]; });
const bBefore = seamScore(bad, W, H, 'both');
const bFixed = makeTileable(bad, W, H, 'both');
const bAfter = seamScore(bFixed, W, H, 'both');
check('unevenly lit tile: seam flagged', bBefore > 2.5, `score ${bBefore.toFixed(1)}`);
check('unevenly lit tile: blending removes it', bAfter < 1.8, `${bBefore.toFixed(1)} -> ${bAfter.toFixed(2)}`);

// 4. input is never mutated
const snapshot = Uint8ClampedArray.from(ramp);
makeTileable(ramp, W, H, 'both');
check('makeTileable returns a new array', ramp.every((v, i) => v === snapshot[i]));

// 5. rim-shaped strip (4:1), x only: the dark lower face must survive the blend
const SW = 256, SH = 64;
const strip = make(SW, SH, (x, y) => { const face = y > SH / 2 ? 0.4 : 1; const c = (90 + (x / SW) * 120) * face; return [c, c, c * 0.9]; });
const stripFixed = makeTileable(strip, SW, SH, 'x');
check('rim strip: seam fixed', seamScore(stripFixed, SW, SH, 'x') < 1.8, `${seamScore(strip, SW, SH, 'x').toFixed(1)} -> ${seamScore(stripFixed, SW, SH, 'x').toFixed(2)}`);
const lumaAt = (d, w, x, y) => { const i = (y * w + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; };
check('rim strip: top stays lighter than the face', lumaAt(stripFixed, SW, SW / 2, 8) > lumaAt(stripFixed, SW, SW / 2, SH - 8) * 1.5);

// 6. palette: a warm plate gives a warm rim colour, and light > dark
const warm = make(W, H, (x, y) => { const [r] = periodic(x, y); return [r * 1.0, r * 0.35, r * 0.25]; });
const pal = samplePalette(warm, W, H, 1);
const L = (c) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
check('palette of a red plate is red', pal.avg.r > pal.avg.g * 1.8 && pal.avg.r > pal.avg.b * 1.8, JSON.stringify(pal.avg));
check('palette: light is brighter than dark', L(pal.light) > L(pal.dark) + 20, `${L(pal.light).toFixed(0)} vs ${L(pal.dark).toFixed(0)}`);
check('palette: textured plate has spread', pal.spread > 8, `spread ${pal.spread.toFixed(1)}`);

// 7. a dead-flat tile is detectable
const flat = make(W, H, () => [40, 42, 44]);
check('flat tile has ~no spread', samplePalette(flat, W, H, 1).spread < 4);

// 8. colour helpers
check('mixRgb endpoints', JSON.stringify(mixRgb({ r: 0, g: 0, b: 0 }, { r: 200, g: 100, b: 50 }, 0.5)) === JSON.stringify({ r: 100, g: 50, b: 25 }));
check('scaleRgb clamps', scaleRgb({ r: 200, g: 100, b: 10 }, 2).r === 255);
check('toHex packs', toHex({ r: 1, g: 2, b: 3 }) === 0x010203);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ tiling helpers pass');
process.exit(failures ? 1 : 0);
