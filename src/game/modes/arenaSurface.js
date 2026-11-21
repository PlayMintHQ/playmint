// Shooter Arena hazard visuals (2026-11-07). Draws what arenaHazards.js lays out:
//  - a raised platform (void edge): the arena floor stays on the platform; around
//    it, a "far below" layer — the world's own floor texture, darkened and at half
//    scale, scrolled slower than the camera (parallax = depth) — or a star field
//    for space worlds; a light ledge lip, a wall face and a drop shadow on the rim;
//  - an island (water edge): deep water around the platform with a foam lip;
//  - pits: the same far-below layer seen through holes, with a dark crust rim;
//  - liquid pools (lava / acid / shallow water): the surface texture tiled inside
//    rounded shapes, a crust rim, a slow drift and (lava/acid) a pulsing glow.
// The surface texture is the generated `dyn_hazard` when the game has one for
// this kind, else a small built-in texture painted here once.
import Phaser from 'phaser';
import { arenaViewPadFor, WALL_VIEW_PAD } from './arenaHazards';
import { tileCanvas, mixRgb, scaleRgb, toHex, paletteOfSource } from '../assetPipeline/tiling';
import { planArenaArt, paintChevronTile } from '../assetPipeline/arenaArt';

const PALETTE = {
  lava: { base: '#b3300b', light: ['#ff8a1a', '#ffc53a'], dark: '#4a1206', crust: 0x2a0d06, glow: 0xff7a1a },
  // Open flames on charred ground: dark base, patchy bright fire (light blobs read as tongues).
  fire: { base: '#1c1410', light: ['#ff5a14', '#ffd23a'], dark: '#080504', crust: 0x120b08, glow: 0xff5a14 },
  acid: { base: '#3f8f12', light: ['#9dff3a', '#d8ff9a'], dark: '#1d4a08', crust: 0x14280b, glow: 0x8dff3a },
  water: { base: '#1f6f9a', light: ['#4fb6e0', '#a8e6ff'], dark: '#0f4565', crust: 0x2b3b2a, glow: null },
  deep: { base: '#0d3550', light: ['#1f6f9a', '#4f9cc4'], dark: '#081f30', crust: null, glow: null }
};

// Seamless blotchy surface: soft blobs drawn wrapped on all edges.
function paintSurface(scene, kind) {
  const key = `pm_surface_${kind}`;
  if (scene.textures.exists(key)) return key;
  const pal = PALETTE[kind] || PALETTE.water;
  const size = 128;
  const tex = scene.textures.createCanvas(key, size, size);
  const ctx = tex.getContext();
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, size, size);
  let seed = kind.length * 977 + 13;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const blob = (x, y, r, color, alpha) => {
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = alpha;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  for (let i = 0; i < 26; i++) blob(rnd() * size, rnd() * size, 10 + rnd() * 26, pal.dark, 0.55);
  for (let i = 0; i < 34; i++) blob(rnd() * size, rnd() * size, 6 + rnd() * 18, pal.light[i % 2], 0.5);
  ctx.globalAlpha = 1;
  tex.refresh();
  return key;
}

// ── Palette: the code-drawn pieces take their colours from the generated art ─────────
const DEFAULT_PLATE = { avg: { r: 70, g: 74, b: 86 }, light: { r: 150, g: 156, b: 170 }, dark: { r: 18, g: 22, b: 32 } };
const rgbaOf = (c, a) => `rgba(${c.r},${c.g},${c.b},${a})`;

// The arena ground's colours: whatever buildArenaGround actually drew (arenaGround.js). Never the
// raw `dyn_bg_far`, which on older sets is a SCENE (skyline, sky) and would tint the edge with it.
function platePalette(scene) {
  if (scene.arenaGroundPalette) return scene.arenaGroundPalette;
  try {
    const fill = scene.arenaFloor?.fillColor;
    if (typeof fill === 'number') {
      const avg = { r: (fill >> 16) & 255, g: (fill >> 8) & 255, b: fill & 255 };
      return { avg, light: scaleRgb(avg, 1.45), dark: scaleRgb(avg, 0.4) };
    }
  } catch { /* the palette is cosmetic: fall through to the neutral one */ }
  return DEFAULT_PLATE;
}

// A cold blue-grey pulled from the world's own darks: reads as DEPTH, never as the
// page's black margin (the old hard-coded rgba(22,32,58) ignored the world entirely).
const hazeOf = (pal) => mixRgb(pal.dark, { r: 26, g: 38, b: 68 }, 0.55);

// What lies far below a rooftop / sky platform / pit, when the game has no generated
// `surround` art: the world's own ground, small, seamless and hazed.
function paintFarBelow(scene, starry, pal) {
  const key = starry ? 'pm_far_stars' : 'pm_far_ground';
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const size = 256;
  const tex = scene.textures.createCanvas(key, size, size);
  const ctx = tex.getContext();
  if (starry) {
    ctx.fillStyle = '#04050b';
    ctx.fillRect(0, 0, size, size);
    let seed = 4242;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = `rgba(${200 + rnd() * 55},${200 + rnd() * 55},255,${0.25 + rnd() * 0.7})`;
      const r = rnd() < 0.08 ? 1.6 : 0.8;
      ctx.beginPath(); ctx.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    const floorKey = scene.textures.exists('dyn_floor') ? 'dyn_floor' : null;
    const plateKey = !floorKey && scene.textures.exists('dyn_bg_far') ? 'dyn_bg_far' : null;
    if (floorKey) {
      // Older sets carry a ground tile: repeat it small.
      const src = scene.textures.get(floorKey).getSourceImage();
      const cell = 64;
      for (let y = 0; y < size; y += cell) for (let x = 0; x < size; x += cell) ctx.drawImage(src, x, y, cell, cell);
    } else if (plateKey) {
      // Sets drawn since the Arena Kit have no `floor` tile: a centre crop of the
      // ground plate, then made seamless so the parallax repeat has no hard lines.
      const img = scene.textures.get(plateKey).getSourceImage();
      const side = Math.min(img.width, img.height) * 0.6;
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      try { tileCanvas(tex.getCanvas(), 'both'); } catch { /* cosmetic */ }
    } else {
      ctx.fillStyle = rgbaOf(scaleRgb(pal.avg, 0.7), 1);
      ctx.fillRect(0, 0, size, size);
    }
    ctx.fillStyle = rgbaOf(hazeOf(pal), 0.62);
    ctx.fillRect(0, 0, size, size);
  }
  tex.refresh();
  return key;
}


const hexToRgb = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; };

/**
 * The arena's Readability Contract plan (assetPipeline/arenaArt.js): role colours for the ground, the
 * cover slabs, the edge band, the lethal pools and the receding drop, all measured against what the
 * ground ACTUALLY looks like. Cached on the scene (the cover slabs read it too); `key` invalidates it
 * when a live edit changes the edge or the hazard.
 */
export function getArenaArtPlan(scene, arena, { hazardKind = null, useSurround = false, starry = false } = {}) {
  const key = `${arena.edge}|${hazardKind || arena.hazard || ''}|${useSurround ? 's' : '-'}`;
  if (scene.arenaArt && scene.arenaArt.key === key) return scene.arenaArt;
  const pal = platePalette(scene);
  let coverBase = null;
  try {
    if (scene.textures.exists('dyn_obstacle')) coverBase = paletteOfSource(scene.textures.get('dyn_obstacle').getSourceImage())?.avg || null;
  } catch { /* the hue hint is optional */ }
  let outsideAvg = null;
  try {
    if (useSurround && scene.textures.exists('dyn_surround')) outsideAvg = paletteOfSource(scene.textures.get('dyn_surround').getSourceImage())?.avg || null;
    else outsideAvg = starry ? { r: 6, g: 8, b: 16 } : mixRgb(scaleRgb(pal.avg, 0.7), hazeOf(pal), 0.62);
  } catch { /* defaults */ }
  const lethalKind = hazardKind || (arena.hazard && arena.hazard !== 'none' ? arena.hazard : null);
  const lethal = lethalKind && PALETTE[lethalKind] ? hexToRgb(PALETTE[lethalKind].light[0]) : null;
  const plan = planArenaArt({ ground: pal.avg, coverBase, edgeKind: arena.edge, lethal, outsideAvg });
  plan.key = key;
  scene.arenaArt = plan;
  return plan;
}

// The hazard-stripe tile along a void edge: one 16px texture, rebuilt when the plan changes.
function chevronTexture(scene, plan) {
  const key = 'pm_edge_chevron';
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, 16, 16);
  tex.getContext().putImageData(new ImageData(paintChevronTile(16, 16, plan.edge.stripe, plan.edge.dark), 16, 16), 0, 0);
  tex.refresh();
  return key;
}

const expand = (r, by) => ({ x: r.x - by, y: r.y - by, width: r.width + by * 2, height: r.height + by * 2 });

// Canvas 2D rounded-rect path (ctx.roundRect is not available on every browser we ship to).
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * @returns {{ update(time:number, camera):void, destroy():void, warn(level:number):void }}
 */
export function drawArenaSurface(scene, arena, { width, height, starry = false, hazardKind = null, useSurround = false } = {}) {
  const pal = platePalette(scene);
  const plan = getArenaArtPlan(scene, arena, { hazardKind, useSurround, starry });
  const objects = [];
  const tweens = [];
  const drifting = [];
  const glowTextures = [];
  const add = (o) => { objects.push(o); return o; };
  const p = arena.platform;
  const masked = (shapeFn) => {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    shapeFn(g);
    objects.push(g);
    return g.createGeometryMask();
  };
  const surfaceKey = (kind) => (hazardKind === kind && scene.textures.exists('dyn_hazard') ? 'dyn_hazard' : paintSurface(scene, kind));

  // Only a void/water edge has a drop to show; the camera looks this far past the world.
  const PAD = arenaViewPadFor(arena.edge);
  // The four bands around the platform, out to the view margin (+60 to hide mask seams).
  const ringRects = () => [
    { x: -PAD - 60, y: -PAD - 60, width: width + PAD * 2 + 120, height: p.y + PAD + 60 },
    { x: -PAD - 60, y: p.y + p.height, width: width + PAD * 2 + 120, height: height - p.y - p.height + PAD + 60 },
    { x: -PAD - 60, y: p.y, width: p.x + PAD + 60, height: p.height },
    { x: p.x + p.width, y: p.y, width: width - p.x - p.width + PAD + 60, height: p.height }
  ];
  const pits = arena.pools.filter((pool) => pool.kind === 'pit');
  const liquids = arena.pools.filter((pool) => pool.kind !== 'pit');
  let below = null;

  // ── What surrounds the platform, and what is under the pits ─────────────────
  if (arena.edge === 'void' || pits.length) {
    // Crust rims of the pits sit under the hole layer, so only a ring shows.
    if (pits.length) {
      const crust = add(scene.add.graphics().setDepth(-0.97));
      crust.fillStyle(0x0b0c10, 0.95);
      for (const pit of pits) for (const r of pit.rects) { const e = expand(r, 7); crust.fillRoundedRect(e.x, e.y, e.width, e.height, 18); }
    }
    // Drawn out to the camera's look-past margin so the drop fills the screen
    // wherever the platform ends (the camera may look ARENA_VIEW_PAD past the world).
    // The generated `surround` tile (the world's own street / valley / clouds seen from
    // far above) when the game has one, else the palette-aware built-in.
    const surroundKey = useSurround && scene.textures.exists('dyn_surround') ? 'dyn_surround' : null;
    below = add(scene.add.tileSprite(-PAD, -PAD, width + PAD * 2, height + PAD * 2, surroundKey || paintFarBelow(scene, starry, pal)).setOrigin(0, 0).setDepth(-0.95));
    const dropMask = masked((g) => {
      if (arena.edge === 'void') ringRects().forEach((r) => g.fillRect(r.x, r.y, r.width, r.height));
      for (const pit of pits) for (const r of pit.rects) g.fillRoundedRect(r.x, r.y, r.width, r.height, 14);
    });
    below.setMask(dropMask);
    if (surroundKey) {
      // Depth haze over the generated art (the built-in tile has it baked in).
      const haze = add(scene.add.graphics().setDepth(-0.94));
      haze.fillStyle(toHex(hazeOf(pal)), 0.3);
      haze.fillRect(-PAD, -PAD, width + PAD * 2, height + PAD * 2);
      haze.setMask(dropMask);
    }
    // The drop must RECEDE (contract: darker + calmer than the ground): a black veil over it, sized by
    // the plan so the drop is at least OUTSIDE_DY darker than the ground whatever the art looks like.
    const veil = add(scene.add.graphics().setDepth(-0.935));
    veil.fillStyle(0x000000, plan.outsideAlpha);
    veil.fillRect(-PAD, -PAD, width + PAD * 2, height + PAD * 2);
    veil.setMask(dropMask);
  }
  if (arena.edge === 'water') {
    const water = add(scene.add.tileSprite(-PAD, -PAD, width + PAD * 2, height + PAD * 2, surfaceKey('deep')).setOrigin(0, 0).setDepth(-0.95));
    water.setMask(masked((g) => ringRects().forEach((r) => g.fillRect(r.x, r.y, r.width, r.height))));
    drifting.push({ sprite: water, vx: 9, vy: 4 });
  }

  // ── The platform edge: THE END, the strongest element in the arena ───────────────
  // Drawn entirely by code from the plan (the generated rim strip is no longer used: it came out
  // off-style and spiky). A void edge is a dark face dropping away outside a band of amber hazard
  // chevrons, finished with a light lip; a water edge is a bright foam line. Both sit ON the platform
  // edge the rules use, so what you see is where you fall.
  let rimWarn = null;
  if (arena.edge !== 'wall') {
    if (arena.edge === 'void') {
      const shadow = add(scene.add.graphics().setDepth(-0.91));
      for (let i = 0; i < 6; i++) { shadow.lineStyle(5, 0x000000, 0.16 - i * 0.025); const e = expand(p, 3 + i * 5); shadow.strokeRect(e.x, e.y, e.width, e.height); }
      const BAND = 16, FACE = 14;
      const face = add(scene.add.graphics().setDepth(-0.9));
      face.fillStyle(toHex(plan.edge.face), 0.97);
      face.fillRect(p.x - FACE, p.y - FACE, p.width + FACE * 2, FACE);               // north face
      face.fillRect(p.x - FACE, p.y + p.height, p.width + FACE * 2, FACE);           // south face
      face.fillRect(p.x - FACE, p.y, FACE, p.height);                                // west face
      face.fillRect(p.x + p.width, p.y, FACE, p.height);                             // east face
      const chevron = chevronTexture(scene, plan);
      const band = (x, y, w, h) => add(scene.add.tileSprite(x, y, w, h, chevron).setOrigin(0, 0).setDepth(-0.895));
      band(p.x, p.y, p.width, BAND);                                                 // inside the edge, all four sides
      band(p.x, p.y + p.height - BAND, p.width, BAND);
      band(p.x, p.y + BAND, BAND, p.height - BAND * 2);
      band(p.x + p.width - BAND, p.y + BAND, BAND, p.height - BAND * 2);
      const lip = add(scene.add.graphics().setDepth(-0.894));
      lip.lineStyle(2, toHex(plan.edge.dark), 1);                                    // dark keyline on the very edge
      lip.strokeRect(p.x, p.y, p.width, p.height);
      lip.lineStyle(3, toHex(plan.edge.lip), 1);                                     // light lip on the inner side of the band
      lip.strokeRect(p.x + BAND, p.y + BAND, p.width - BAND * 2, p.height - BAND * 2);
    } else {
      const foam = add(scene.add.graphics().setDepth(-0.9));
      foam.lineStyle(7, toHex(plan.edge.stripe), 0.9); // foam
      foam.strokeRect(p.x - 2, p.y - 2, p.width + 4, p.height + 4);
    }
    rimWarn = add(scene.add.graphics().setDepth(-0.89));
  } else {
    // A walled arena's boundary: the wall sits just OUTSIDE the world (the playfield,
    // physics bounds and spawns are untouched; the camera may look WALL_VIEW_PAD past
    // the edge to see it), with a lit top, a dark inner face and a soft shadow cast
    // inward onto the floor. Coloured from the ground plate so it belongs to the world.
    const T = WALL_VIEW_PAD;
    const base = scaleRgb(pal.dark, 0.55);
    const top = mixRgb(mixRgb(pal.avg, pal.light, 0.6), { r: 255, g: 255, b: 255 }, 0.18); // brighter than the floor: the wall must read
    const wall = add(scene.add.graphics().setDepth(-0.9));
    wall.fillStyle(toHex(base), 1);
    wall.fillRect(-T, -T, width + T * 2, T);              // north
    wall.fillRect(-T, height, width + T * 2, T);          // south
    wall.fillRect(-T, 0, T, height);                      // west
    wall.fillRect(width, 0, T, height);                   // east
    wall.fillStyle(toHex(top), 0.95);                     // the lit top: the outer 80%; the inner 20% stays a dark face
    wall.fillRect(-T, -T, width + T * 2, T * 0.8);
    wall.fillRect(-T, height + T * 0.2, width + T * 2, T * 0.8);
    wall.fillRect(-T, 0, T * 0.8, height);
    wall.fillRect(width + T * 0.2, 0, T * 0.8, height);
    wall.lineStyle(4, toHex(mixRgb(top, { r: 255, g: 255, b: 255 }, 0.5)), 0.85); // inner lip
    wall.strokeRect(0, 0, width, height);
    // inward shadow
    const SH = 38;
    const shade = add(scene.add.graphics().setDepth(-0.88));
    shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.38, 0.38, 0, 0);
    shade.fillRect(0, 0, width, SH);
    shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.38, 0.38);
    shade.fillRect(0, height - SH, width, SH);
    shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.38, 0, 0.38, 0);
    shade.fillRect(0, 0, SH, height);
    shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.38, 0, 0.38);
    shade.fillRect(width - SH, 0, SH, height);
  }

  // ── Liquid pools ─────────────────────────────────────────────────────────────
  for (const pool of liquids) {
    const pal = PALETTE[pool.kind] || PALETTE.water;
    const crust = add(scene.add.graphics().setDepth(-0.93));
    crust.fillStyle(pal.crust ?? 0x1a1a1a, 0.95);
    for (const r of pool.rects) { const e = expand(r, 7); crust.fillRoundedRect(e.x, e.y, e.width, e.height, 20); }
    const b = pool.bounds;
    const surf = add(scene.add.tileSprite(b.x, b.y, b.width, b.height, surfaceKey(pool.kind)).setOrigin(0, 0).setDepth(-0.92));
    surf.setMask(masked((g) => { for (const r of pool.rects) g.fillRoundedRect(r.x, r.y, r.width, r.height, 14); }));
    drifting.push({ sprite: surf, vx: pool.kind === 'water' ? 7 : 4, vy: pool.kind === 'water' ? 3 : 2 });
    if (pal.glow) {
      // ONE pre-rendered glow image per pool. The old version filled each rounded
      // rect separately with additive blending, so wherever two rects of an
      // organic pool overlapped the glow was drawn twice and showed as a brighter
      // square. Painting the union into a canvas first makes overlaps a non-event
      // (and the canvas shadow gives the glow a soft falloff).
      const G = 40;
      const key = `pm_glow_${pool.kind}_${glowTextures.length}_${Math.round(b.x)}_${Math.round(b.y)}`;
      if (scene.textures.exists(key)) scene.textures.remove(key);
      const tex = scene.textures.createCanvas(key, Math.ceil(b.width + G * 2), Math.ceil(b.height + G * 2));
      const ctx = tex.getContext();
      const css = `#${pal.glow.toString(16).padStart(6, '0')}`;
      ctx.fillStyle = css;
      ctx.shadowColor = css;
      ctx.shadowBlur = 22;
      for (const r of pool.rects) {
        const e = expand(r, 10);
        roundRectPath(ctx, e.x - b.x + G, e.y - b.y + G, e.width, e.height, 22);
        ctx.fill();
      }
      tex.refresh();
      glowTextures.push(key);
      const glow = add(scene.add.image(b.x - G, b.y - G, key).setOrigin(0, 0).setDepth(-0.91).setBlendMode(Phaser.BlendModes.ADD));
      glow.setAlpha(0.1);
      tweens.push(scene.tweens.add({ targets: glow, alpha: 0.26, duration: 900 + Math.random() * 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
    }
  }

  return {
    update(time, camera) {
      // Far below scrolls slower than the camera: depth.
      if (below && camera) {
        below.tilePositionX = camera.scrollX * 0.4;
        below.tilePositionY = camera.scrollY * 0.4;
      }
      const t = time / 1000;
      for (const d of drifting) {
        d.sprite.tilePositionX = t * d.vx;
        d.sprite.tilePositionY = t * d.vy;
      }
    },
    // 0..1: how close the player is to a deadly edge (pulses the rim red).
    warn(level) {
      if (!rimWarn) return;
      rimWarn.clear();
      if (level <= 0) return;
      const pulse = 0.55 + 0.45 * Math.sin(scene.time.now / 90);
      rimWarn.lineStyle(5, 0xff3b3b, Math.min(0.85, level * pulse));
      rimWarn.strokeRect(p.x + 2, p.y + 2, p.width - 4, p.height - 4);
    },
    destroy() {
      for (const tw of tweens) tw.remove();
      for (const o of objects) {
        try { if (o.clearMask) o.clearMask(true); } catch { /* already gone */ }
        try { o.destroy(); } catch { /* already gone */ }
      }
      for (const key of glowTextures) { try { scene.textures.remove(key); } catch { /* already gone */ } }
    }
  };
}
