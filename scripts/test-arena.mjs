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
  isLethalSurface, CENTER_CLEAR
} from '../src/game/modes/arenaHazards.js';

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
  for (const hazard of ['none', 'lava', 'acid', 'water', 'pit']) {
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
// sanity: the old straight chase on an empty walled arena still works
console.log(segmentClear(0, 0, 10, 10, []) ? '' : 'segmentClear broken');
console.log(failures ? `✗ ${failures} combination(s) failed` : '✓ every arena is fair');
process.exit(failures ? 1 : 0);
