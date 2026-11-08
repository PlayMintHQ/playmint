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

const PALETTE = {
  lava: { base: '#b3300b', light: ['#ff8a1a', '#ffc53a'], dark: '#4a1206', crust: 0x2a0d06, glow: 0xff7a1a },
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

// What lies far below a rooftop / sky platform / pit.
function paintFarBelow(scene, starry) {
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
    // The world's own ground, small and dark: the street / valley far below.
    const floorKey = scene.textures.exists('dyn_floor') ? 'dyn_floor' : null;
    const src = floorKey ? scene.textures.get(floorKey).getSourceImage() : null;
    if (src) {
      const cell = 64;
      for (let y = 0; y < size; y += cell) for (let x = 0; x < size; x += cell) ctx.drawImage(src, x, y, cell, cell);
    } else {
      ctx.fillStyle = '#2a2f3a';
      ctx.fillRect(0, 0, size, size);
    }
    ctx.fillStyle = 'rgba(4,7,14,0.72)';
    ctx.fillRect(0, 0, size, size);
  }
  tex.refresh();
  return key;
}

const expand = (r, by) => ({ x: r.x - by, y: r.y - by, width: r.width + by * 2, height: r.height + by * 2 });

/**
 * @returns {{ update(time:number, camera):void, destroy():void, warn(level:number):void }}
 */
export function drawArenaSurface(scene, arena, { width, height, starry = false, hazardKind = null } = {}) {
  const objects = [];
  const tweens = [];
  const drifting = [];
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
    below = add(scene.add.tileSprite(0, 0, width, height, paintFarBelow(scene, starry)).setOrigin(0, 0).setDepth(-0.95));
    below.setMask(masked((g) => {
      if (arena.edge === 'void') {
        g.fillRect(-60, -60, width + 120, p.y + 60);
        g.fillRect(-60, p.y + p.height, width + 120, height - p.y - p.height + 60);
        g.fillRect(-60, p.y, p.x + 60, p.height);
        g.fillRect(p.x + p.width, p.y, width - p.x - p.width + 60, p.height);
      }
      for (const pit of pits) for (const r of pit.rects) g.fillRoundedRect(r.x, r.y, r.width, r.height, 14);
    }));
  }
  if (arena.edge === 'water') {
    const water = add(scene.add.tileSprite(0, 0, width, height, surfaceKey('deep')).setOrigin(0, 0).setDepth(-0.95));
    water.setMask(masked((g) => {
      g.fillRect(-60, -60, width + 120, p.y + 60);
      g.fillRect(-60, p.y + p.height, width + 120, height - p.y - p.height + 60);
      g.fillRect(-60, p.y, p.x + 60, p.height);
      g.fillRect(p.x + p.width, p.y, width - p.x - p.width + 60, p.height);
    }));
    drifting.push({ sprite: water, vx: 9, vy: 4 });
  }

  // ── The platform rim ─────────────────────────────────────────────────────────
  let rimWarn = null;
  if (arena.edge !== 'wall') {
    const rim = add(scene.add.graphics().setDepth(-0.9));
    if (arena.edge === 'void') {
      for (let i = 0; i < 6; i++) { rim.lineStyle(5, 0x000000, 0.16 - i * 0.025); const e = expand(p, 3 + i * 5); rim.strokeRect(e.x, e.y, e.width, e.height); }
      rim.fillStyle(0x161a22, 0.96); // wall face below the near edge
      rim.fillRect(p.x, p.y + p.height, p.width, 20);
      rim.lineStyle(3, 0xffffff, 0.32); // ledge lip
      rim.strokeRect(p.x + 1, p.y + 1, p.width - 2, p.height - 2);
    } else {
      rim.lineStyle(6, 0xd8f4ff, 0.45); // foam
      rim.strokeRect(p.x - 2, p.y - 2, p.width + 4, p.height + 4);
    }
    rimWarn = add(scene.add.graphics().setDepth(-0.89));
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
      const glow = add(scene.add.graphics().setDepth(-0.91).setBlendMode(Phaser.BlendModes.ADD));
      glow.fillStyle(pal.glow, 1);
      for (const r of pool.rects) { const e = expand(r, 10); glow.fillRoundedRect(e.x, e.y, e.width, e.height, 22); }
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
    }
  };
}
