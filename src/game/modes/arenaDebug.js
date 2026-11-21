// Dev-only arena harness (Vite DEV builds only; ShooterMode installs it behind
// `import.meta.env.DEV`). It exists so the Arena Kit's geometry can be verified in the
// browser at $0: rim rotation, corner posts, edge alignment, rule changes.
//
//   __PM_ARENA_DEBUG.injectKit()            paint synthetic dyn_surround / dyn_rim and redraw
//   __PM_ARENA_DEBUG.clearKit()             remove them (back to the code-drawn fallback)
//   __PM_ARENA_DEBUG.setRules('void','fire')  change edge / hazard live (like the Creator Panel)
//   __PM_ARENA_DEBUG.teleport(x, y)         put the player somewhere (grace on, enemies cleared)
//   __PM_ARENA_DEBUG.corner('tl'|'tr'|'bl'|'br'|'t'|'b'|'l'|'r')  stand at a platform corner/side
//   __PM_ARENA_DEBUG.sweep()                where the fall rule flips vs the platform edge (+ which ground is drawn)
//
// The synthetic art is deliberately ASYMMETRIC (the rim's outer face is dark and its lip
// bright; the surround has a bright grid) so a wrong rotation or a misplaced edge line is
// obvious in a screenshot.

import { surfaceAt } from './arenaHazards';

function paintSurround(scene) {
  const key = 'dyn_surround';
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, 256, 256);
  const ctx = tex.getContext();
  ctx.fillStyle = '#243247';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#3d5675'; // "streets" on a 64px grid: periodic, so it tiles
  ctx.lineWidth = 6;
  for (let i = 0; i < 256; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  ctx.fillStyle = '#e6c66a'; // lit windows
  for (let y = 12; y < 256; y += 64) for (let x = 14; x < 256; x += 64) ctx.fillRect(x, y, 10, 10);
  tex.refresh();
}

function paintRim(scene) {
  const key = 'dyn_rim';
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, 256, 64);
  const ctx = tex.getContext();
  // top half: the walkable lip (light, with brick ticks every 32px: periodic, so it tiles)
  ctx.fillStyle = '#b9b2a3';
  ctx.fillRect(0, 0, 256, 32);
  ctx.fillStyle = '#8c8575';
  for (let x = 0; x < 256; x += 32) ctx.fillRect(x, 0, 3, 32);
  // the edge line at 50%
  ctx.fillStyle = '#f4efe2';
  ctx.fillRect(0, 29, 256, 3);
  // bottom half: the outer face falling away into shadow
  const g = ctx.createLinearGradient(0, 32, 0, 64);
  g.addColorStop(0, '#5a5448');
  g.addColorStop(1, '#14120f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 32, 256, 32);
  tex.refresh();
}

export function installArenaDebug(mode) {
  const scene = mode.scene;
  const api = {
    mode,
    injectKit() {
      paintSurround(scene);
      paintRim(scene);
      const meta = scene.gameConfig.assetMeta || (scene.gameConfig.assetMeta = {});
      meta.slots = { ...(meta.slots || {}), surround: { kind: 'void' }, rim: { kind: mode.arena.edge } };
      mode.rebuildArena();
      return 'kit injected';
    },
    clearKit() {
      for (const k of ['dyn_surround', 'dyn_rim']) if (scene.textures.exists(k)) scene.textures.remove(k);
      const slots = scene.gameConfig.assetMeta?.slots;
      if (slots) { delete slots.surround; delete slots.rim; }
      mode.rebuildArena();
      return 'kit cleared';
    },
    setRules(edge, hazard = 'none') {
      scene.gameConfig = { ...scene.gameConfig, shooterEdge: edge, shooterHazard: hazard };
      mode.onConfigUpdate(scene.gameConfig);
      return `${edge}/${hazard}`;
    },
    teleport(x, y) {
      // Calm inspection: no hazard deaths, no new waves, no enemy contact damage.
      mode.hazardGraceUntil = Infinity;
      mode.spawnWave = () => {};
      mode.handlePlayerEnemyCollision = () => {};
      mode.enemies?.clear(true, true);
      scene.player.setPosition(x, y);
      scene.cameras.main.centerOn(x, y);
      return `${Math.round(x)},${Math.round(y)}`;
    },
    corner(where) {
      const p = mode.arena.platform;
      const m = 14; // just inside the edge
      const xs = { l: p.x + m, r: p.x + p.width - m, c: p.x + p.width / 2 };
      const ys = { t: p.y + m, b: p.y + p.height - m, c: p.y + p.height / 2 };
      const spot = { tl: [xs.l, ys.t], tr: [xs.r, ys.t], bl: [xs.l, ys.b], br: [xs.r, ys.b], t: [xs.c, ys.t], b: [xs.c, ys.b], l: [xs.l, ys.c], r: [xs.r, ys.c] }[where];
      return spot ? api.teleport(spot[0], spot[1]) : 'unknown corner';
    },
    // Where does the rule flip from ground to void, per side? ShooterMode fires 6px past the platform
    // edge (surfaceAt shrink 6); the painted rim is centred on that same edge, so the fall must
    // happen at the rim line +6px, and NOTHING inside the platform may read as void.
    sweep() {
      const a = mode.arena, p = a.platform;
      const flip = (axis, fixed, edge, dir) => {
        for (let d = -20; d <= 20; d++) {
          const t = edge + dir * d;
          const x = axis === 'x' ? t : fixed, y = axis === 'x' ? fixed : t;
          if (surfaceAt(a, x, y, 6) === 'void' || surfaceAt(a, x, y, 6) === 'deep') return d;
        }
        return null;
      };
      const mx = p.x + p.width / 2, my = p.y + p.height / 2;
      const sides = {
        left: flip('x', my, p.x, -1), right: flip('x', my, p.x + p.width, 1),
        top: flip('y', mx, p.y, -1), bottom: flip('y', mx, p.y + p.height, 1)
      };
      let interiorVoid = 0;
      for (let x = p.x + 8; x < p.x + p.width - 8; x += 40) for (let y = p.y + 8; y < p.y + p.height - 8; y += 40) if (surfaceAt(a, x, y, 6) === 'void' || surfaceAt(a, x, y, 6) === 'deep') interiorVoid++;
      const ok = a.edge === 'wall' || (Object.values(sides).every((d) => d != null && d >= 5 && d <= 8) && interiorVoid === 0);
      return { edge: a.edge, flipPxPastEdge: sides, interiorVoid, ok, groundSource: scene.arenaGroundSource };
    },
    // Wait for the camera to settle (it follows with a lerp), then report what is on screen.
    view() {
      const cam = scene.cameras.main;
      return { zoom: cam.zoom, scrollX: Math.round(cam.scrollX), scrollY: Math.round(cam.scrollY), worldView: cam.worldView && { x: Math.round(cam.worldView.x), y: Math.round(cam.worldView.y), w: Math.round(cam.worldView.width), h: Math.round(cam.worldView.height) } };
    }
  };
  window.__PM_ARENA_DEBUG = api;
  return () => { if (window.__PM_ARENA_DEBUG === api) delete window.__PM_ARENA_DEBUG; };
}
