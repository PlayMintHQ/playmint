// $0 tests for the arena art orchestrator (src/game/assetPipeline/arenaArt.js): pure maths, no DOM.
import {
  CONTRACT, relLum, contrastRatio, saturationOf, withLuminance, capSaturation, calmGround, localContrast,
  meanColor, tonemapCover, planArenaArt, readabilityReport, paintCoverSlab, paintChevronTile, proceduralCoverMaterial
} from '../src/game/assetPipeline/arenaArt.js';

let failed = 0;
const ok = (cond, msg) => { if (cond) console.log('✓', msg); else { console.error('✗', msg); failed++; } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// deterministic rng
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// ── colour maths ───────────────────────────────────────────────────────────────────
ok(near(contrastRatio({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 }), 21, 0.01), 'contrast white/black = 21');
ok(near(contrastRatio({ r: 119, g: 119, b: 119 }, { r: 255, g: 255, b: 255 }), 4.48, 0.05), 'contrast #777/white ≈ 4.48 (WCAG reference)');
ok(near(relLum({ r: 128, g: 128, b: 128 }), 0.2159, 0.002), 'relLum mid grey ≈ 0.216');
const c0 = { r: 90, g: 60, b: 200 };
for (const target of [0.05, 0.2, 0.5, 0.8]) {
  ok(near(relLum(withLuminance(c0, target)), target, 0.01), `withLuminance reaches ${target}`);
}
ok(near(saturationOf(capSaturation({ r: 255, g: 40, b: 10 }, 0.4)), 0.4, 0.01), 'capSaturation lands on the cap');
ok(JSON.stringify(capSaturation({ r: 100, g: 90, b: 95 }, 0.4)) === JSON.stringify({ r: 100, g: 90, b: 95 }), 'capSaturation leaves calm colours alone');

// ── the calm pass: a busy synthetic ground ──────────────────────────────────────────
function busyGround(w, h) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    let v = 90 + 25 * Math.sin(x / 40) * Math.cos(y / 55);                 // broad shape
    if ((x % 70 < 4) || (y % 90 < 4)) v -= 55;                              // "pipes"
    if (x > 120 && x < 190 && y > 100 && y < 160 && (x % 8 < 3)) v += 70;   // a "grate"
    v += (rnd() - 0.5) * 36;                                                // grain
    d[i] = v + 12; d[i + 1] = v + 4; d[i + 2] = v + 30; d[i + 3] = 255;
  }
  return d;
}
const W = 240, H = 180;
const busy = busyGround(W, H);
const sigBefore = localContrast(busy, W, H);
const calm = calmGround(busy, W, H, { radius: 10 });
const sigAfter = localContrast(calm, W, H);
ok(sigAfter <= sigBefore * 0.6, `calmGround cuts local contrast by ≥40 % (${sigBefore.toFixed(3)} → ${sigAfter.toFixed(3)})`);
const mb = meanColor(busy, W, H), mc = meanColor(calm, W, H);
ok(near(mb.r, mc.r, 24) && near(mb.g, mc.g, 24) && near(mb.b, mc.b, 24), `calmGround keeps the mean colour (${mb.r},${mb.g},${mb.b} → ${mc.r},${mc.g},${mc.b})`);
let maxS = 0, maxL = 0;
for (let i = 0; i < calm.length; i += 4) { maxS = Math.max(maxS, saturationOf({ r: calm[i], g: calm[i + 1], b: calm[i + 2] })); maxL = Math.max(maxL, relLum({ r: calm[i], g: calm[i + 1], b: calm[i + 2] })); }
ok(maxS <= CONTRACT.groundMaxSat + 0.03, `calmGround caps saturation (max ${maxS.toFixed(2)})`);
ok(maxL <= CONTRACT.groundYMax * 1.6, `calmGround tames highlights (max relLum ${maxL.toFixed(2)})`);
ok(calm.length === busy.length && calm[3] === 255, 'calmGround keeps size and opacity');
const again = calmGround(busy, W, H, { radius: 10 });
ok(calm.every((v, i) => v === again[i]), 'calmGround is deterministic');

// ── cover material tone mapping ─────────────────────────────────────────────────────
for (const [name, rgb] of [['dark', { r: 30, g: 30, b: 36 }], ['light', { r: 235, g: 235, b: 230 }], ['saturated', { r: 220, g: 30, b: 160 }]]) {
  const tile = new Uint8ClampedArray(32 * 32 * 4);
  for (let p = 0; p < 32 * 32; p++) { const j = (rnd() - 0.5) * 30; tile[p * 4] = rgb.r + j; tile[p * 4 + 1] = rgb.g + j; tile[p * 4 + 2] = rgb.b + j; tile[p * 4 + 3] = 255; }
  const out = tonemapCover(tile, 32, 32, 0.3);
  ok(near(relLum(meanColor(out, 32, 32, 1)), 0.3, 0.04), `tonemapCover (${name}) lands on the target luminance`);
  ok(saturationOf(meanColor(out, 32, 32, 1)) <= 0.45, `tonemapCover (${name}) caps saturation`);
}

// ── the plan meets the contract for any ground ──────────────────────────────────────
let planFails = 0;
for (let i = 0; i < 200; i++) {
  // grounds in the domain calmGround produces (relLum <= ~0.24): scale a random colour down into it
  let ground = { r: rnd() * 255 | 0, g: rnd() * 255 | 0, b: rnd() * 255 | 0 };
  const lg = relLum(ground);
  if (lg > 0.24) { const f = (0.24 / lg) ** (1 / 2.4); ground = { r: ground.r * f | 0, g: ground.g * f | 0, b: ground.b * f | 0 }; }
  const hint = rnd() < 0.5 ? null : { r: rnd() * 255 | 0, g: rnd() * 255 | 0, b: rnd() * 255 | 0 };
  const outsideAvg = { r: rnd() * 255 | 0, g: rnd() * 255 | 0, b: rnd() * 255 | 0 };
  const plan = planArenaArt({ ground, coverBase: hint, edgeKind: rnd() < 0.7 ? 'void' : 'water', outsideAvg });
  if (!plan.report.ok) { planFails++; if (planFails < 4) console.error('   plan failed for ground', ground, JSON.stringify(plan.report.pairs.filter((p) => !p.ok))); }
}
ok(planFails === 0, `planArenaArt meets every contract pair on 200 random grounds (${planFails} failures)`);
const dark = planArenaArt({ ground: { r: 18, g: 20, b: 26 } });
const lightish = planArenaArt({ ground: { r: 140, g: 140, b: 140 } });
ok(contrastRatio(dark.cover.top, dark.ground) >= 2.2 && contrastRatio(lightish.cover.top, lightish.ground) >= 2.2, 'cover CR ≥ 2.2 on dark and light grounds');
ok(contrastRatio(dark.edge.lip, dark.ground) >= 3.0 && contrastRatio(lightish.edge.lip, lightish.ground) >= 3.0, 'edge CR ≥ 3.0 on dark and light grounds');
ok(readabilityReport(dark).pairs.some((p) => p.name === 'edge-stronger-than-cover' && p.ok), 'edge is stronger than cover');

// ── painters ────────────────────────────────────────────────────────────────────────
const plan = planArenaArt({ ground: { r: 60, g: 64, b: 72 } });
const slab = paintCoverSlab(44, plan.cover);
ok(slab.length === 44 * 44 * 4, 'slab buffer is size×size RGBA (picture == collider size)');
ok(slab[3] === 0 && slab[((22 * 44) + 22) * 4 + 3] === 255, 'slab corners are transparent, centre opaque');
const o = slab[(22 * 44 + 0) * 4], c = slab[(22 * 44 + 22) * 4];
ok(o < c, 'slab has a dark outline around a lighter top');
const mat = proceduralCoverMaterial(16, plan.cover);
const slab2 = paintCoverSlab(44, plan.cover, mat);
ok(slab2.length === slab.length, 'slab with a material tile has the same shape');
const chev = paintChevronTile(16, 12, plan.edge.stripe, plan.edge.dark);
ok(chev.length === 16 * 12 * 4 && chev[3] === 255, 'chevron tile is w×h opaque RGBA');

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\n✓ arena art orchestrator checks passed');
