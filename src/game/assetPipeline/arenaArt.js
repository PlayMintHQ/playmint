// Shooter Arena ART ORCHESTRATOR (2026-11-21): a readable arena by construction.
//
// Why: the generated ground was busy (pipes, grates, conduits painted flat, none of it collides),
// the generated cover crates had the wrong perspective, and the generated rim / surround competed
// with the playfield. Image models cannot be trusted with geometry or perspective, so:
//   CODE owns every shape (cover slabs, edge lip, outlines, shadows) and normalises tone;
//   the AI only supplies flat MATERIALS and the characters.
//
// This module is pure pixel / colour maths (no Phaser, no DOM), node-testable like tiling.js. The
// scene wrappers (arenaGround.js, arenaSurface.js, ShooterMode.buildCover) call it.
//
// THE READABILITY CONTRACT (WCAG relative luminance + contrast ratio, CR):
//   ground  walkable: calm. Local detail pulled down, saturation capped, luminance capped.
//   cover   solid:    top face lighter than the ground, CR >= COVER_CR; outline, bevel, shadow.
//   edge    the end:  the strongest element, CR >= EDGE_CR; light lip + hazard chevrons.
//   lethal  hurts:    the only saturated surface, CR >= LETHAL_CR against the ground.
//   outside the drop: darker than the ground by >= OUTSIDE_DY so it recedes.
// Rule: ground < cover < edge in contrast.
import { mixRgb, scaleRgb } from './tiling.js';

export const CONTRACT = {
  groundMaxSat: 0.42,   // HSV saturation cap for the ground
  groundYMax: 0.2,      // relative luminance cap for the ground (about sRGB 124)
  groundSigmaMax: 0.07, // local contrast (std-dev of luma minus its blur, 0..1) after the calm pass
  COVER_CR: 2.3,        // cover top vs ground (contract floor 2.2, 0.1 of margin)
  EDGE_CR: 3.2,         // edge lip vs ground (contract floor 3.0)
  LETHAL_CR: 2.0,       // lethal surface vs ground
  OUTSIDE_DY: 0.12      // the drop is at least this much darker than the ground (relative luminance)
};

// ── colour maths ─────────────────────────────────────────────────────────────────────
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const relLum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export function contrastRatio(a, b) {
  const la = relLum(a), lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export function saturationOf({ r, g, b }) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

/** The same colour moved (towards white or black) until its relative luminance is `targetL`. */
export function withLuminance(color, targetL) {
  const l = relLum(color);
  if (Math.abs(l - targetL) < 0.002) return { ...color };
  const toward = targetL > l ? WHITE : BLACK;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const lm = relLum(mixRgb(color, toward, mid));
    if ((targetL > l) ? lm < targetL : lm > targetL) lo = mid; else hi = mid;
  }
  return mixRgb(color, toward, (lo + hi) / 2);
}

/** Pull a colour's HSV saturation down to `maxSat`, keeping its value (max channel). */
export function capSaturation(color, maxSat) {
  const mx = Math.max(color.r, color.g, color.b), mn = Math.min(color.r, color.g, color.b);
  if (mx === 0 || (mx - mn) / mx <= maxSat) return { ...color };
  const mn2 = mx * (1 - maxSat);
  const k = (mx - mn2) / (mx - mn);
  return { r: clamp255(mn2 + (color.r - mn) * k), g: clamp255(mn2 + (color.g - mn) * k), b: clamp255(mn2 + (color.b - mn) * k) };
}

// ── the calm pass ────────────────────────────────────────────────────────────────────
// Box blur over one Float32 channel, `passes` times (2 passes ~ a gaussian). Clamp-to-edge.
// Returns a NEW array; `src` is untouched.
function blurChannel(src, w, h, radius, passes = 2) {
  const norm = 1 / (radius * 2 + 1);
  let a = Float32Array.from(src);
  const b = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) { // horizontal a -> b
      const row = y * w;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += a[row + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x++) {
        b[row + x] = sum * norm;
        sum += a[row + Math.min(w - 1, x + radius + 1)] - a[row + Math.max(0, x - radius)];
      }
    }
    for (let x = 0; x < w; x++) { // vertical b -> a
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += b[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = sum * norm;
        sum += b[Math.min(h - 1, y + radius + 1) * w + x] - b[Math.max(0, y - radius) * w + x];
      }
    }
  }
  return a;
}

const lumaOf = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/** Local contrast: std-dev of (luma - blurred luma). The measure the contract caps. */
export function localContrast(rgba, w, h, radius = 8) {
  const l = new Float32Array(w * h);
  for (let i = 0, p = 0; p < l.length; i += 4, p++) l[p] = lumaOf(rgba[i], rgba[i + 1], rgba[i + 2]);
  const low = blurChannel(l, w, h, radius, 2);
  let s = 0;
  for (let p = 0; p < l.length; p++) { const d = l[p] - low[p]; s += d * d; }
  return Math.sqrt(s / l.length);
}

/**
 * Make a ground picture CALM: the broad shape and colour survive, the detail that reads as
 * "objects" (grates, pipes, conduits, crates painted flat) is pulled towards the local average.
 * out = mean + (low - mean) * kLow + (orig - low) * kDetail, then saturation and luminance caps.
 * Pure and deterministic. Returns a new Uint8ClampedArray (alpha forced opaque).
 */
export function calmGround(rgba, w, h, { radius = 30, kLow = 0.5, kDetail = 0.2,
  maxSat = CONTRACT.groundMaxSat, yMax = CONTRACT.groundYMax } = {}) {
  const n = w * h;
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0, p = 0; p < n; i += 4, p++) { ch[0][p] = rgba[i]; ch[1][p] = rgba[i + 1]; ch[2][p] = rgba[i + 2]; }
  const low = ch.map((c) => blurChannel(c, w, h, radius, 2));
  const mean = ch.map((c) => { let s = 0; for (let p = 0; p < n; p++) s += c[p]; return s / n; });
  const out = new Uint8ClampedArray(n * 4);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    let r = mean[0] + (low[0][p] - mean[0]) * kLow + (ch[0][p] - low[0][p]) * kDetail;
    let g = mean[1] + (low[1][p] - mean[1]) * kLow + (ch[1][p] - low[1][p]) * kDetail;
    let b = mean[2] + (low[2][p] - mean[2]) * kLow + (ch[2][p] - low[2][p]) * kDetail;
    r = clamp255(r); g = clamp255(g); b = clamp255(b);
    // saturation cap
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    if (s > maxSat) {
      const y = 0.299 * r + 0.587 * g + 0.114 * b, f = maxSat / s;
      r = y + (r - y) * f; g = y + (g - y) * f; b = y + (b - y) * f;
    }
    // luminance soft knee: above yMax, compress what is left (keeps dark detail, tames highlights)
    const l = relLum({ r, g, b });
    if (l > yMax) {
      const target = yMax + (l - yMax) * 0.25;
      const f = (target / l) ** (1 / 2.4);
      r *= f; g *= f; b *= f;
    }
    out[i] = clamp255(r); out[i + 1] = clamp255(g); out[i + 2] = clamp255(b); out[i + 3] = 255;
  }
  return out;
}

/** Mean colour of an RGBA buffer (opaque pixels only). */
export function meanColor(rgba, w, h, step = 2) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3] < 16) continue;
      r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++;
    }
  }
  return n ? { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) } : { r: 90, g: 94, b: 104 };
}

/**
 * Remap a cover MATERIAL tile so its mean relative luminance is `targetL`, with its detail damped
 * (a top face is flat: the slab painter adds the bevel, the material only supplies the grain).
 */
export function tonemapCover(rgba, w, h, targetL, { kDetail = 0.6, maxSat = 0.4 } = {}) {
  const n = w * h;
  const mean = meanColor(rgba, w, h, 1);
  const base = withLuminance(capSaturation(mean, maxSat), targetL);
  const out = new Uint8ClampedArray(n * 4);
  for (let p = 0, i = 0; p < n * 4; p += 4, i += 4) {
    out[i] = clamp255(base.r + (rgba[p] - mean.r) * kDetail);
    out[i + 1] = clamp255(base.g + (rgba[p + 1] - mean.g) * kDetail);
    out[i + 2] = clamp255(base.b + (rgba[p + 2] - mean.b) * kDetail);
    out[i + 3] = 255;
  }
  return out;
}

// ── the plan: role colours that satisfy the contract ─────────────────────────────────
const AMBER = { r: 242, g: 183, b: 5 };    // the universal "danger edge" hue
const NEAR_BLACK = { r: 20, g: 22, b: 28 };

/**
 * Role colours for an arena. `ground` is what was actually drawn (palette `avg`), `coverBase` an optional
 * hint for the cover's hue (average of the old crate art, or a theme colour). Always returns colours
 * that meet the contract; `adjustments` records what had to be moved (empty when nothing did).
 */
export function planArenaArt({ ground, coverBase = null, edgeKind = 'void', lethal = null, outsideAvg = null } = {}) {
  const adjustments = [];
  const g = ground || { r: 70, g: 74, b: 86 };
  const Lg = relLum(g);
  const hue = capSaturation(coverBase || mixRgb(g, WHITE, 0.2), 0.35);

  // cover: lighter than the ground by the contract, hue borrowed from the world
  let coverL = (CONTRACT.COVER_CR) * (Lg + 0.05) - 0.05;
  if (coverL > 0.82) { coverL = 0.82; adjustments.push('cover capped at 0.82 luminance'); }
  const top = withLuminance(hue, coverL);
  const cover = { top, light: mixRgb(top, WHITE, 0.38), dark: mixRgb(top, BLACK, 0.45), outline: mixRgb(top, BLACK, 0.82) };

  // edge: stronger than the cover. A void edge gets amber hazard chevrons on a near-black band.
  let edgeL = (CONTRACT.EDGE_CR) * (Lg + 0.05) - 0.05;
  if (edgeL > 0.9) edgeL = 0.9;
  let lip = withLuminance(mixRgb(top, WHITE, 0.55), Math.max(edgeL, coverL + 0.12));
  let stripe = edgeKind === 'water' ? mixRgb({ r: 216, g: 244, b: 255 }, WHITE, 0.2) : AMBER;
  if (contrastRatio(stripe, g) < CONTRACT.EDGE_CR) { stripe = withLuminance(stripe, edgeL); adjustments.push('edge stripe lightened'); }
  const edge = { lip, stripe, dark: NEAR_BLACK, face: mixRgb(g, BLACK, 0.7) };

  // outside: how dark the black overlay over the drop must be so it recedes
  let outsideAlpha = 0.42;
  if (outsideAvg) {
    const Ls = relLum(outsideAvg);
    const want = Math.max(0, Lg - Math.min(CONTRACT.OUTSIDE_DY, Lg * 0.8));
    if (Ls > want) {
      const f = Ls > 0 ? want / Ls : 1;
      outsideAlpha = Math.min(0.9, Math.max(0.3, 1 - f ** (1 / 2.2)));
    } else outsideAlpha = 0.3;
  }

  const plan = { ground: g, cover, edge, outsideAlpha, lethal: lethal || null, adjustments };
  plan.report = readabilityReport(plan, outsideAvg);
  return plan;
}

/** Measures every contract pair of a plan. Pure; `ok` is the AND of all pairs. */
export function readabilityReport(plan, outsideAvg = null) {
  const g = plan.ground;
  const pairs = [];
  const cr = (name, color, need) => { const v = contrastRatio(color, g); pairs.push({ name, cr: +v.toFixed(2), need, ok: v >= need }); };
  cr('cover', plan.cover.top, CONTRACT.COVER_CR - 0.1);
  cr('edge-lip', plan.edge.lip, CONTRACT.EDGE_CR - 0.2);
  cr('edge-stripe', plan.edge.stripe, CONTRACT.EDGE_CR - 0.2);
  if (plan.lethal) cr('lethal', plan.lethal, CONTRACT.LETHAL_CR);
  if (outsideAvg) {
    const after = scaleRgb(outsideAvg, 1 - plan.outsideAlpha);
    const dy = relLum(g) - relLum(after);
    const need = Math.min(CONTRACT.OUTSIDE_DY, relLum(g) * 0.8); // a drop cannot be darker than black
    pairs.push({ name: 'outside', dY: +dy.toFixed(3), need: +need.toFixed(3), ok: dy >= need - 0.02 });
  }
  const coverStronger = contrastRatio(plan.edge.lip, g) >= contrastRatio(plan.cover.top, g);
  pairs.push({ name: 'edge-stronger-than-cover', ok: coverStronger });
  return { ok: pairs.every((p) => p.ok), pairs };
}

// ── painters (pure RGBA) ─────────────────────────────────────────────────────────────
function setPx(d, w, x, y, c, a = 255) {
  const i = (y * w + x) * 4;
  d[i] = c.r; d[i + 1] = c.g; d[i + 2] = c.b; d[i + 3] = a;
}

/**
 * A top-down COVER SLAB, `size` px square, drawn from straight above: material top, 1px dark outline,
 * 2px bevel (light top-left, dark bottom-right), an inset panel line and corner rivets. Rounded corners
 * are transparent. `material` is an optional RGBA tile {data,w,h} (already tone-mapped) for the grain.
 */
export function paintCoverSlab(size, cover, material = null, seed = 7) {
  const d = new Uint8ClampedArray(size * size * 4);
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const R = 3; // corner radius in px
  const inside = (x, y) => {
    const cx = x < R ? R - x - 0.5 : x >= size - R ? x - (size - R) + 0.5 : 0;
    const cy = y < R ? R - y - 0.5 : y >= size - R ? y - (size - R) + 0.5 : 0;
    return cx * cx + cy * cy <= R * R + 0.5;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inside(x, y)) continue;
      let c = cover.top;
      if (material) {
        const i = (((y * material.h / size) | 0) * material.w + ((x * material.w / size) | 0)) * 4;
        c = { r: material.data[i], g: material.data[i + 1], b: material.data[i + 2] };
      } else {
        const j = (rnd() - 0.5) * 10; // faint grain
        c = { r: clamp255(c.r + j), g: clamp255(c.g + j), b: clamp255(c.b + j) };
      }
      const edgeD = Math.min(x, y, size - 1 - x, size - 1 - y);
      if (edgeD === 0) c = cover.outline;
      else if (edgeD <= 2) c = (x <= 2 || y <= 2) && (x + y < size) ? cover.light : cover.dark;
      setPx(d, size, x, y, c);
    }
  }
  // inset panel line + rivets: "a solid block with a flat top"
  const inset = 6;
  for (let i = inset; i < size - inset; i++) {
    for (const [x, y] of [[i, inset], [i, size - 1 - inset], [inset, i], [size - 1 - inset, i]]) setPx(d, size, x, y, cover.dark);
  }
  for (const [x, y] of [[inset + 2, inset + 2], [size - 3 - inset, inset + 2], [inset + 2, size - 3 - inset], [size - 3 - inset, size - 3 - inset]]) {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) setPx(d, size, x + dx, y + dy, cover.light);
  }
  return d;
}

/** Diagonal hazard-stripe tile (w x h px), `stripe` on `dark`: the chevron band along a void edge. */
export function paintChevronTile(w, h, stripe, dark) {
  const d = new Uint8ClampedArray(w * h * 4);
  const period = w;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = (((x + y) % period) + period) % period;
      setPx(d, w, x, y, t < period / 2 ? stripe : dark);
    }
  }
  return d;
}

/** Procedural cover material (no image needed): the plan's top colour with faint grain. Same shape as a tile. */
export function proceduralCoverMaterial(size, cover, seed = 11) {
  const d = new Uint8ClampedArray(size * size * 4);
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let p = 0; p < size * size; p++) {
    const j = (rnd() - 0.5) * 12;
    d[p * 4] = clamp255(cover.top.r + j); d[p * 4 + 1] = clamp255(cover.top.g + j); d[p * 4 + 2] = clamp255(cover.top.b + j); d[p * 4 + 3] = 255;
  }
  return { data: d, w: size, h: size };
}
