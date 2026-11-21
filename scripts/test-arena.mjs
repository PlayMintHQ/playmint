#!/usr/bin/env node
// Shooter Arena fairness harness (2026-11-07). Node 18+, no dependencies, $0.
//
// For every arena rule combination (edge × hazard) and many seeds it lays out the
// arena exactly like ShooterMode (pools, then cover around them) and checks:
//   1. the player's start is solid ground, far from every hazard;
//   2. no cover block sits in or against a pool;
//   3. the walkable area is one connected region (no cut-off pockets);
//   4. every enemy arrival point reaches the player through the flow field,
//      without ever stepping onto a lethal surface (simulated chase, 30s cap).
//
// Usage: node scripts/test-arena.mjs [seeds=100] [spawnsPerArena=12]

import { buildNavGrid, computeFlowField, steerPoint, segmentClear } from '../src/game/modes/arenaNav.js';
import {
  layoutArenaHazards, layoutArenaCover, COVER_BLOCK_PX, navBlockRects, surfaceAt, spawnRimPoints,
  isLethalSurface, CENTER_CLEAR, arenaViewport, arenaVisibleRect, ARENA_VIEW_PAD, EDGE_INSET,
  arenaKitPlan, cleanSubject, normalizeArenaSpec, WALL_VIEW_PAD, arenaViewPadFor
} from '../src/game/modes/arenaHazards.js';
import { chooseGroundSource } from '../src/game/modes/arenaGround.js';
import { groundVerdict, runGroundLadder } from '../src/game/assetPipeline/groundGate.js';
import fs from 'node:fs';

const SEEDS = Number(process.argv[2]) || 100;
const SPAWNS = Number(process.argv[3]) || 12;
const W = 2000, H = 1500;
const BODY = 25;            // enemy half size (50px tall art)
const INFLATE = 28, PAD = 25;

const mulberry = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const hitsAny = (x, y, rects) => rects.some((r) =>
  x + BODY > r.x && x - BODY < r.x + r.width && y + BODY > r.y && y - BODY < r.y + r.height);

const results = [];
let failures = 0;
for (const edge of ['wall', 'void', 'water']) {
  for (const hazard of ['none', 'lava', 'fire', 'acid', 'water', 'pit']) {
    let chases = 0, reached = 0, slowest = 0, lethalSteps = 0, badStart = 0, coverInPool = 0, pocketed = 0, poolsMade = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const rnd = mulberry(seed * 7919 + edge.length * 31 + hazard.length);
      const layout = layoutArenaHazards({ width: W, height: H, edge, hazard, count: hazard === 'none' ? 0 : 3, rnd });
      poolsMade += layout.pools.length;
      const poolRects = layout.pools.flatMap((p) => p.rects);
      const blocks = layoutArenaCover({ width: W, height: H, rnd, bounds: edge === 'wall' ? null : layout.platform, avoid: poolRects });
      const cover = blocks.map((b) => ({ x: b.x - COVER_BLOCK_PX / 2, y: b.y - COVER_BLOCK_PX / 2, width: COVER_BLOCK_PX, height: COVER_BLOCK_PX }));
      const walkBlock = [...cover, ...navBlockRects(layout, W, H)];
      const px = W / 2, py = H / 2;

      // 1. start
      if (surfaceAt(layout, px, py, 0) || layout.pools.some((p) => {
        const b = p.bounds; const dx = Math.max(b.x - px, 0, px - (b.x + b.width)); const dy = Math.max(b.y - py, 0, py - (b.y + b.height));
        return Math.hypot(dx, dy) < CENTER_CLEAR - 1;
      })) badStart++;
      // 2. cover vs pools
      if (cover.some((c) => poolRects.some((r) => c.x < r.x + r.width && c.x + c.width > r.x && c.y < r.y + r.height && c.y + c.height > r.y))) coverInPool++;

      const grid = buildNavGrid({ width: W, height: H, rects: walkBlock, inflate: INFLATE, cell: 16 });
      const dist = computeFlowField(grid, px, py);
      // 3. connectivity: free cells inside the platform that the field cannot reach
      let free = 0, unreached = 0;
      for (let i = 0; i < grid.blocked.length; i++) {
        if (grid.blocked[i]) continue;
        free++;
        if (!Number.isFinite(dist[i])) unreached++;
      }
      if (unreached / Math.max(1, free) > 0.03) pocketed++;

      // 4. chases
      const spawns = spawnRimPoints(layout, SPAWNS, { width: W, height: H, rnd, clearOf: cover });
      for (const s of spawns) {
        chases++;
        let x = s.x, y = s.y, t = 0, wp = null, wpAt = -1, ok = false;
        const dt = 1 / 30, speed = 100;
        while (t < 30) {
          if (Math.hypot(px - x, py - y) < 45) { ok = true; break; }
          if (!wp || t - wpAt > 0.2) { wp = steerPoint(grid, dist, walkBlock, x, y, px, py, { pad: PAD }); wpAt = t; }
          const a = Math.atan2(wp.y - y, wp.x - x);
          const nx = x + Math.cos(a) * speed * dt, ny = y + Math.sin(a) * speed * dt;
          // Arcade-like slide against cover (hazards are not solid: the enemy must AVOID them)
          if (!hitsAny(nx, y, cover)) x = nx;
          if (!hitsAny(x, ny, cover)) y = ny;
          if (isLethalSurface(surfaceAt(layout, x, y, 8))) lethalSteps++;
          t += dt;
        }
        if (ok) { reached++; slowest = Math.max(slowest, t); }
      }
    }
    const row = { edge, hazard, pools: (poolsMade / SEEDS).toFixed(1), reached: `${reached}/${chases}`, slowestS: slowest.toFixed(1), lethalSteps, badStart, coverInPool, pocketed };
    results.push(row);
    if (reached < chases || lethalSteps || badStart || coverInPool || pocketed) failures++;
  }
}
console.table(results);

// 5. The edge is on screen: whatever the window shape, a player standing at ANY point of
// a void/water platform's edge sees a drop of at least MIN_DROP beyond it, and the player
// themself is on screen. (Pure camera math shared with MultiCameraManager.)
const MIN_DROP = 200;
const VIEWPORTS = [[390, 844], [844, 390], [360, 640], [1024, 768], [1280, 720], [1920, 1080], [3440, 1440], [5120, 1440]];
const viewRows = [];
let viewFailures = 0;
for (const [vw, vh] of VIEWPORTS) {
  const vp = arenaViewport({ viewW: vw, viewH: vh, worldW: W, worldH: H, edge: 'void' });
  const left = EDGE_INSET, right = W - EDGE_INSET, top = EDGE_INSET, bottom = H - EDGE_INSET;
  let worst = Infinity, playerOff = 0;
  // The player at every corner and edge midpoint (the extremes of each edge).
  for (const px of [left, W / 2, right]) {
    for (const py of [top, H / 2, bottom]) {
      const r = arenaVisibleRect(vp, px, py);
      if (px - 30 < r.x || px + 30 > r.x + r.width || py - 30 < r.y || py + 30 > r.y + r.height) playerOff++;
      // drop visible beyond whichever edge the player is on
      if (px === left) worst = Math.min(worst, left - r.x);
      if (px === right) worst = Math.min(worst, r.x + r.width - right);
      if (py === top) worst = Math.min(worst, top - r.y);
      if (py === bottom) worst = Math.min(worst, r.y + r.height - bottom);
    }
  }
  const ok = worst >= MIN_DROP && !playerOff;
  if (!ok) viewFailures++;
  viewRows.push({ view: `${vw}x${vh}`, zoom: vp.zoom.toFixed(2), sees: `${Math.round(vp.visW)}x${Math.round(vp.visH)}`, minDropPx: Math.round(worst), playerOffScreen: playerOff, ok: ok ? 'yes' : 'NO' });
}
console.table(viewRows);
if (viewFailures) failures += viewFailures;

// 6. Arena Kit planning (pure): which generated pieces an arena needs, and that designer
// text is held to plain scenery before it reaches an image prompt.
const checks = [];
const expect = (name, ok) => { checks.push({ check: name, ok: ok ? 'yes' : 'NO' }); if (!ok) failures++; };
const planOf = (edge, hazard, o = {}) => arenaKitPlan({ edge, hazard }, o);
expect('void rooftop needs surround + rim', !!planOf('void', 'none', { themeKey: 'city' }).surround && !!planOf('void', 'none', { themeKey: 'city' }).rim);
expect('water island needs a rim, no surround', !planOf('water', 'none').surround && !!planOf('water', 'none').rim);
expect('walled arena needs neither', !planOf('wall', 'none').surround && !planOf('wall', 'none').rim);
expect('walled arena with pits needs the drop (surround) only', !!planOf('wall', 'pit').surround && !planOf('wall', 'pit').rim);
expect('star-field worlds keep the code stars (no surround)', !planOf('void', 'none', { starry: true }).surround && !!planOf('void', 'none', { starry: true }).rim);
expect('designer subjects win over defaults', planOf('void', 'none', { spec: { surround: 'a neon street grid far below', rim: 'rusted parapet' } }).surround === 'a neon street grid far below');
expect('cleanSubject rejects people / text / frames', !cleanSubject('people walking in a street') && !cleanSubject('a stone frame with text') && !cleanSubject('x'));
expect('cleanSubject caps at 14 words', cleanSubject('a b c d e f g h i j k l m n o p q').split(' ').length === 14);
expect('normalizeArenaSpec keeps clean subjects, drops dirty ones', (() => {
  const n = normalizeArenaSpec({ edge: 'void', hazard: 'fire', surround: 'a rain slicked street grid', rim: 'a hero statue' }, 'Burning Roof');
  return n.surround === 'a rain slicked street grid' && n.rim === null && n.src === 'burning roof';
})());
expect('a verdict never stacks water pools on a water edge', normalizeArenaSpec({ edge: 'water', hazard: 'water' }, 'x').hazard === 'none');
expect('a walled arena still has a wall pad (its wall is drawn outside the world)', WALL_VIEW_PAD > 0 && arenaViewPadFor('wall') === WALL_VIEW_PAD && arenaViewPadFor('void') === ARENA_VIEW_PAD);
const wallVp = arenaViewport({ viewW: 1280, viewH: 720, worldW: W, worldH: H, edge: 'wall' });
expect('wall arena: the wall is reachable on screen at the world edge', arenaVisibleRect(wallVp, 20, 20).x <= -WALL_VIEW_PAD + 1);
// 7. The ground can never be a scene: which source each situation gets (pure table), and that no
// source file reads the raw legacy plate (`dyn_bg_far`) except the allow-listed ones.
const gs = (o) => chooseGroundSource({ dynamic: true, hasPlate: false, role: undefined, hasFloorTile: false, ...o });
expect('gate-approved plate (role ground) is drawn', gs({ hasPlate: true, role: 'ground' }) === 'plate');
expect('a legacy plate (no role) is NEVER drawn, even with no floor tile', gs({ hasPlate: true }) !== 'plate' && gs({ hasPlate: true }) === 'procedural');
expect('a legacy plate with a floor tile gets the baked floor', gs({ hasPlate: true, hasFloorTile: true }) === 'floor');
expect('a plate with a different role is not drawn', gs({ hasPlate: true, role: 'scene' }) !== 'plate');
expect('no art at all: procedural', gs({}) === 'procedural');
expect('static boots (no dynamic art) are handled separately', chooseGroundSource({ dynamic: false, hasPlate: true, role: 'ground', hasFloorTile: true }) === 'static');
expect('kill switch restores the old behaviour (plate whatever its role)', chooseGroundSource({ dynamic: true, hasPlate: true, role: undefined, hasFloorTile: true, killSwitch: true }) === 'plate');
const READERS_OK = new Set(['src/game/modes/arenaGround.js', 'src/game/modes/arenaSurface.js', 'src/game/GameManagerScene.js', 'src/game/savedGames/thumbnail.js']);
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
const readers = walk('src').filter((f) => /\.(js|jsx)$/.test(f) && /dyn_bg_far/.test(fs.readFileSync(f, 'utf8'))).filter((f) => !f.includes('assetPipeline/'));
expect('only allow-listed files read dyn_bg_far', readers.every((f) => READERS_OK.has(f)), readers.join(', '));
const sceneSrc = fs.readFileSync('src/game/GameManagerScene.js', 'utf8');
expect('the scene never draws dyn_bg_far itself (only through arenaGround)', !/add\.image\([^)]*['"]dyn_bg_far['"]/.test(sceneSrc));
// 8. The ground gate: acceptance rule + the fail-closed ladder with injected reviews (no network).
const PURE = { inventory: 'cracked concrete everywhere', groundMaterial: 'cracked concrete with hazard stripes', defects: [], pureGround: true };
const SCENE = { inventory: 'a skyline along the top', groundMaterial: 'rooftop with city', defects: ['skyline', 'frame_border'], pureGround: false };
expect('verdict: pure ground passes', groundVerdict(PURE).ok);
expect('verdict: a missing review FAILS (fail-closed)', !groundVerdict(null).ok && !groundVerdict(undefined).ok);
expect('verdict: pureGround true but a defect listed fails', !groundVerdict({ ...PURE, defects: ['wall'] }).ok);
expect('verdict: pureGround true but a scenery material label fails', !groundVerdict({ ...PURE, groundMaterial: 'night skyline of neon towers' }).ok);
expect('verdict: malformed review fails', !groundVerdict({ pureGround: true }).ok && !groundVerdict({ pureGround: 'yes', defects: [] }).ok);
expect('verdict: puddles, grates and hazard stripes are fine', groundVerdict({ ...PURE, groundMaterial: 'wet asphalt with puddles and grates' }).ok);
const mk = (over) => {
  const calls = [];
  return {
    calls,
    deps: {
      reviewPicture: async () => { calls.push('reviewPicture'); return PURE; },
      makeFloor: async () => { calls.push('makeFloor'); return { floor: true }; },
      reviewFloor: async () => { calls.push('reviewFloor'); return PURE; },
      bakeFloor: async () => { calls.push('bakeFloor'); return 'BAKED'; },
      makeProcedural: async () => { calls.push('procedural'); return 'PROC'; },
      ...over(calls)
    }
  };
};
{
  const t = mk(() => ({})); const r = await runGroundLadder(t.deps);
  expect('ladder: pure picture ships, no floor call', r.source === 'picture' && t.calls.join() === 'reviewPicture');
}
{
  const t = mk((c) => ({ reviewPicture: async () => { c.push('reviewPicture'); return SCENE; } })); const r = await runGroundLadder(t.deps);
  expect('ladder: scene picture -> floor texture -> bake', r.source === 'floor-bake' && r.result === 'BAKED' && t.calls.join() === 'reviewPicture,makeFloor,reviewFloor,bakeFloor');
}
{
  const t = mk((c) => ({ reviewPicture: async () => { c.push('reviewPicture'); return SCENE; }, reviewFloor: async () => { c.push('reviewFloor'); return SCENE; } })); const r = await runGroundLadder(t.deps);
  expect('ladder: floor rejected too -> procedural', r.source === 'procedural' && r.result === 'PROC' && !t.calls.includes('bakeFloor'));
}
{
  const t = mk((c) => ({ reviewPicture: async () => { c.push('reviewPicture'); return null; } })); const r = await runGroundLadder(t.deps);
  expect('ladder: NO review -> procedural WITHOUT spending a floor call (fail-closed)', r.source === 'procedural' && !t.calls.includes('makeFloor'));
}
{
  const t = mk((c) => ({ reviewPicture: async () => { c.push('reviewPicture'); return SCENE; }, makeFloor: async () => { c.push('makeFloor'); throw new Error('quota'); } })); const r = await runGroundLadder(t.deps);
  expect('ladder: floor call throws -> procedural, never rejects', r.source === 'procedural' && /quota/.test(r.issue));
}
{
  const t = mk((c) => ({ reviewPicture: async () => { c.push('reviewPicture'); return SCENE; }, makeFloor: async () => { c.push('makeFloor'); return null; } })); const r = await runGroundLadder(t.deps);
  expect('ladder: floor unavailable (null) -> procedural', r.source === 'procedural');
}
{
  const t = mk((c) => ({ reviewPicture: async () => { c.push('reviewPicture'); return SCENE; }, makeFloor: async () => { throw Object.assign(new Error('x'), { cancelled: true }); } }));
  let threw = false; try { await runGroundLadder(t.deps); } catch (e) { threw = !!e.cancelled; }
  expect('ladder: a cancelled run propagates', threw);
}
{
  const t = mk((c) => ({ reviewPicture: async () => { c.push('reviewPicture'); return SCENE; }, bakeFloor: async () => { throw new Error('bake'); } })); const r = await runGroundLadder(t.deps);
  expect('ladder: a failure while baking also falls to procedural', r.source === 'procedural' && /bake/.test(r.issue));
}
console.table(checks);
// sanity: the old straight chase on an empty walled arena still works
console.log(segmentClear(0, 0, 10, 10, []) ? '' : 'segmentClear broken');
console.log(failures ? `✗ ${failures} combination(s) failed` : '✓ every arena is fair');
process.exit(failures ? 1 : 0);
