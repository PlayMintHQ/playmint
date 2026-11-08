// Shooter Arena contextual hazards (2026-11-07). Pure functions, no Phaser, so
// scripts/test-arena.mjs can prove every arena is fair over hundreds of seeds.
//
// Client (next-pass request): "In Shooter Arena the player cannot fall from the
// rooftop — reaching the edge behaves like a world boundary. Rooftop / cliff /
// space platform → falling into the void can kill the player; lava → damage/kill;
// deep water → hazardous; pits → fall zones; a safe enclosed arena → a normal solid
// boundary. This should depend on the generated environment, not be forced."
//
// The rules come from the WORLD (prompt words), never from a dice roll:
//   edge   'wall'  — enclosed arena (default): the world bounds are solid.
//          'void'  — a raised platform (rooftop, cliff, sky island…): walking off
//                    the edge is a fall.
//          'water' — an island in deep water: walking off the edge is drowning.
//   hazard 'none' | 'lava' | 'acid' (burn) | 'water' (shallow: slows) | 'pit' (fall)
// Explicit config fields (shooterEdge / shooterHazard / shooterHazardCount) win;
// games saved before this existed derive them from their sourcePrompt.

export const ARENA_EDGES = ['wall', 'void', 'water'];
export const ARENA_HAZARDS = ['none', 'lava', 'acid', 'water', 'pit'];

const EDGE_WORDS = {
  void: /\b(roof ?tops?|on (?:the|a) roof|skyscrapers?|cliffs?|cliff ?side|ledges?|floating (?:island|platform|ruins?|rocks?)|sky ?(?:island|platform|ruins?|fortress|temple|city)|above the clouds|in the sky|space ?(?:platform|walk)|asteroid|tower ?top|top of (?:a|the) tower|bridges?|mesa|mountain ?(?:top|peak|summit)|summit|edge of the world|airship deck|abyss edge)\b/,
  water: /\b(islands?|beach(?:es)?|piers?|docks?|harbou?r|raft|atoll|lagoon|sandbar|shipwreck deck)\b/
};
const HAZARD_WORDS = {
  lava: /\b(lava|magma|molten|volcan\w*|inferno|hellfire|caldera)\b/,
  acid: /\b(acid\w*|toxic|radioactive|nuclear waste|slime|sludge|chemical|biohazard)\b/,
  water: /\b(swamps?|marsh(?:es)?|bogs?|flooded|puddles?|rivers?|streams?|ponds?|wetlands?)\b/,
  pit: /\b(pits?|chasms?|sinkholes?|abyss|craters?|crevasses?|collapsed floor|holes in the floor)\b/
};
const SAFE_WORDS = /\b(safe|no hazards?|walled|enclosed|indoor|inside)\b/;

/** Arena rules from free text (a prompt). Deterministic, keyword-based. */
export function parseArenaHazards(text) {
  const t = String(text || '').toLowerCase();
  let edge = 'wall';
  if (!SAFE_WORDS.test(t)) {
    if (EDGE_WORDS.void.test(t)) edge = 'void';
    else if (EDGE_WORDS.water.test(t)) edge = 'water';
  }
  let hazard = 'none';
  for (const kind of ['lava', 'acid', 'pit', 'water']) {
    if (HAZARD_WORDS[kind].test(t)) { hazard = kind; break; }
  }
  // An island in a lava lake is a lava edge in spirit: keep it as lava pools on a
  // walled arena (a burning edge reads badly from above), and never stack water
  // pools on a water edge.
  if (edge === 'water' && hazard === 'water') hazard = 'none';
  if (/\bno (?:lava|pits?|acid|water)\b/.test(t)) hazard = 'none';
  return { edge, hazard };
}

/** The rules a running game uses: explicit config first, else its prompt. */
export function resolveArenaRules(config = {}) {
  const derived = parseArenaHazards(config.sourcePrompt || config.gameName || '');
  const edge = ARENA_EDGES.includes(config.shooterEdge) ? config.shooterEdge : derived.edge;
  const hazard = ARENA_HAZARDS.includes(config.shooterHazard) ? config.shooterHazard : derived.hazard;
  const rawCount = Number(config.shooterHazardCount);
  const count = hazard === 'none' ? 0
    : Number.isFinite(rawCount) && rawCount > 0 ? Math.min(4, Math.round(rawCount)) : 3;
  return { edge, hazard: count ? hazard : 'none', count };
}

// What touching a surface does. `lethalAfter` is the grace in ms (0 = instant).
export const SURFACE = {
  void: { kind: 'fall', lethalAfter: 0 },
  pit: { kind: 'fall', lethalAfter: 0 },
  lava: { kind: 'burn', lethalAfter: 300 },
  acid: { kind: 'burn', lethalAfter: 300 },
  deep: { kind: 'drown', lethalAfter: 700, slow: 0.5 },
  water: { kind: 'wade', lethalAfter: null, slow: 0.55 }
};
// The surface texture an arena needs drawn (null = none): pool liquid, or the
// deep water round an island.
export const arenaSurfaceKind = (rules) => (['lava', 'acid', 'water'].includes(rules?.hazard)
  ? rules.hazard : rules?.edge === 'water' ? 'deep' : null);

// Subjects for the pipeline's `hazard` slot (the world's style guide is added).
export const HAZARD_SUBJECTS = {
  lava: 'a churning surface of glowing molten lava with dark cooling crust plates and bright orange-yellow cracks',
  acid: 'a bubbling surface of luminous green toxic acid with pale foam swirls',
  water: 'shallow rippling water with soft light caustics',
  deep: 'deep dark rippling water with gentle wave crests'
};

export const isLethalSurface = (s) => !!s && SURFACE[s]?.lethalAfter != null;

export const EDGE_INSET = 150;     // platform inset from the world bounds (void/water edge)
export const CENTER_CLEAR = 230;   // no hazard this close to the player's start
const POOL_GAP = 90;               // walkable gap between two pools

const rectsOverlap = (a, b, pad = 0) =>
  a.x - pad < b.x + b.width && a.x + a.width + pad > b.x && a.y - pad < b.y + b.height && a.y + a.height + pad > b.y;

const boundsOf = (rects) => {
  const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.width)), y1 = Math.max(...rects.map((r) => r.y + r.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};

/**
 * Lay out the arena surface. Returns
 *   { edge, hazard, platform: {x,y,width,height}, pools: [{ kind, rects, bounds }] }
 * `platform` is the walkable area (the whole world for a walled arena).
 * `avoid` rects (existing cover, the player's spot) keep an 80px walkable gap.
 */
export function layoutArenaHazards({ width, height, edge = 'wall', hazard = 'none', count = 0, rnd = Math.random, avoid = [] }) {
  const inset = edge === 'wall' ? 0 : EDGE_INSET;
  const platform = { x: inset, y: inset, width: width - inset * 2, height: height - inset * 2 };
  const cx = width / 2, cy = height / 2;
  // Enemies arrive on a ring just inside the platform (see spawnRimPoints).
  const ring = Math.min(platform.width, platform.height) / 2 - 50;
  const pools = [];
  if (hazard !== 'none' && count > 0) {
    let guard = 0;
    while (pools.length < count && guard++ < 400) {
      const a = rnd() * Math.PI * 2;
      const r = CENTER_CLEAR + 120 + rnd() * Math.max(10, ring - 150 - (CENTER_CLEAR + 120));
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      // 2-3 overlapping rounded blocks read as one organic pool from above.
      const rects = [];
      const parts = 2 + Math.floor(rnd() * 2);
      const baseW = 120 + rnd() * 90, baseH = 90 + rnd() * 70;
      for (let k = 0; k < parts; k++) {
        const w = baseW * (0.6 + rnd() * 0.5), h = baseH * (0.6 + rnd() * 0.5);
        const ox = (rnd() - 0.5) * baseW * 0.7, oy = (rnd() - 0.5) * baseH * 0.7;
        rects.push({ x: Math.round(px + ox - w / 2), y: Math.round(py + oy - h / 2), width: Math.round(w), height: Math.round(h) });
      }
      const bounds = boundsOf(rects);
      // Clear of the start, inside the platform with room to walk round, off the
      // enemies' arrival ring, and apart from other pools.
      const corners = [[bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y], [bounds.x, bounds.y + bounds.height], [bounds.x + bounds.width, bounds.y + bounds.height]];
      const nearX = Math.max(bounds.x - cx, 0, cx - (bounds.x + bounds.width));
      const nearY = Math.max(bounds.y - cy, 0, cy - (bounds.y + bounds.height));
      if (Math.hypot(nearX, nearY) < CENTER_CLEAR) continue;
      if (corners.some(([x, y]) => Math.hypot(x - cx, y - cy) > ring - 40)) continue;
      if (bounds.x < platform.x + 90 || bounds.y < platform.y + 90 ||
          bounds.x + bounds.width > platform.x + platform.width - 90 ||
          bounds.y + bounds.height > platform.y + platform.height - 90) continue;
      if (pools.some((p) => rectsOverlap(p.bounds, bounds, POOL_GAP))) continue;
      // Existing cover / the player's spot on a live rule change.
      if (avoid.some((r) => rectsOverlap(r, bounds, 80))) continue;
      pools.push({ kind: hazard, rects, bounds });
    }
  }
  return { edge, hazard, platform, pools };
}

const inRect = (r, x, y, shrink = 0) =>
  x > r.x + shrink && x < r.x + r.width - shrink && y > r.y + shrink && y < r.y + r.height - shrink;

/**
 * The surface under (x, y): 'void' | 'deep' | a pool kind | null (solid ground).
 * `shrink` makes the test forgiving (the visible edge is reached a little before
 * the rule fires).
 */
export function surfaceAt(layout, x, y, shrink = 0) {
  if (!layout) return null;
  if (layout.edge !== 'wall' && !inRect(layout.platform, x, y, -shrink)) {
    return layout.edge === 'water' ? 'deep' : 'void';
  }
  for (const pool of layout.pools) {
    if (!inRect(pool.bounds, x, y, shrink)) continue;
    if (pool.rects.some((r) => inRect(r, x, y, shrink))) return pool.kind;
  }
  return null;
}

/** Rects enemies must path around: every lethal pool, plus the void/water band. */
export function navBlockRects(layout, width, height) {
  if (!layout) return [];
  const out = [];
  for (const pool of layout.pools) if (isLethalSurface(pool.kind)) out.push(...pool.rects);
  if (layout.edge !== 'wall') {
    const p = layout.platform;
    out.push(
      { x: -40, y: -40, width: width + 80, height: p.y + 40 },
      { x: -40, y: p.y + p.height, width: width + 80, height: height - p.y - p.height + 40 },
      { x: -40, y: p.y, width: p.x + 40, height: p.height },
      { x: p.x + p.width, y: p.y, width: width - p.x - p.width + 40, height: p.height }
    );
  }
  return out;
}

/** Shallow water slows; everything else is either lethal or plain ground. */
export function slowFactorAt(layout, x, y) {
  const s = surfaceAt(layout, x, y, 4);
  return s ? (SURFACE[s]?.slow || 1) : 1;
}

/**
 * Enemy arrival points: on a ring just inside the platform, never on a hazard.
 * Falls back to the plain ring for walled arenas (the old behaviour).
 */
export function spawnRimPoints(layout, count, { width, height, rnd = Math.random, clearOf = [] } = {}) {
  const cx = width / 2, cy = height / 2;
  const p = layout?.platform || { x: 0, y: 0, width, height };
  const radius = Math.min(p.width, p.height) / 2 - (layout && layout.edge !== 'wall' ? 60 : 40);
  const pts = [];
  let guard = 0;
  while (pts.length < count && guard++ < count * 40) {
    const a = rnd() * Math.PI * 2;
    const x = Math.min(p.x + p.width - 30, Math.max(p.x + 30, cx + Math.cos(a) * radius));
    const y = Math.min(p.y + p.height - 30, Math.max(p.y + 30, cy + Math.sin(a) * radius));
    if (layout && surfaceAt(layout, x, y, -40)) continue;
    if (clearOf.some((r) => inRect(r, x, y, -40))) continue;
    pts.push({ x, y });
  }
  while (pts.length < count) pts.push({ x: cx + radius * 0.7, y: cy }); // never block a wave
  return pts;
}

// Cover layout (pure, no Phaser — unit-checkable): world-space block centres.
export const COVER_BLOCK_PX = 88;
// `bounds` is the walkable platform (a rooftop is smaller than the world) and
// `avoid` the hazard pools — cover never sits in a pool and keeps a walkable gap.
export function layoutArenaCover({ width, height, rnd = Math.random, bounds = null, avoid = [] }) {
  const cx = width / 2, cy = height / 2;
  const area = bounds || { x: 0, y: 0, width, height };
  const spawnRing = Math.min(area.width, area.height) / 2 - (bounds ? 60 : 40); // spawn radius
  const minR = 170;                                     // the player's start area
  const maxR = spawnRing - 110;                          // enemies spawn on the ring
  const MIN_GAP = 80;                                    // edge gap between pieces > player width
  if (maxR <= minR) return [];
  const blocks = [];
  const pieces = 6 + Math.floor(rnd() * 4);
  let placed = 0;
  let guard = 0;
  while (placed < pieces && guard++ < 600) {
    const a = rnd() * Math.PI * 2;
    const r = minR + rnd() * (maxR - minR);
    const ax = cx + Math.cos(a) * r;
    const ay = cy + Math.sin(a) * r;
    // Every third piece is a short wall of 2-3 blocks.
    const len = placed % 3 === 0 ? 2 + Math.floor(rnd() * 2) : 1;
    const horizontal = rnd() < 0.5;
    const group = [];
    for (let k = 0; k < len; k++) {
      const off = (k - (len - 1) / 2) * COVER_BLOCK_PX;
      group.push({ x: Math.round(horizontal ? ax + off : ax), y: Math.round(horizontal ? ay : ay + off) });
    }
    const inBand = group.every((b) => {
      const d = Math.hypot(b.x - cx, b.y - cy);
      return d >= minR && d <= maxR &&
        b.x >= area.x + COVER_BLOCK_PX && b.y >= area.y + COVER_BLOCK_PX &&
        b.x <= area.x + area.width - COVER_BLOCK_PX && b.y <= area.y + area.height - COVER_BLOCK_PX;
    });
    if (!inBand) continue;
    const half = COVER_BLOCK_PX / 2;
    const inPool = group.some((b) => avoid.some((r) =>
      b.x + half + MIN_GAP > r.x && b.x - half - MIN_GAP < r.x + r.width &&
      b.y + half + MIN_GAP > r.y && b.y - half - MIN_GAP < r.y + r.height));
    if (inPool) continue;
    const clear = group.every((b) => blocks.every((o) =>
      Math.max(Math.abs(b.x - o.x), Math.abs(b.y - o.y)) - COVER_BLOCK_PX >= MIN_GAP));
    if (!clear) continue;
    blocks.push(...group);
    placed++;
  }
  return blocks;
}
