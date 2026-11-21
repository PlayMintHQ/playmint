// Shooter Arena GROUND (2026-11-21): the ground is a MATERIAL, never a scene.
//
// Why: the generated `background_far` "ground plate" turned out to be a whole scene (a rooftop
// slab with its own parapet and a skyline around it, floating islands in clouds, a lava slab with
// volcanoes), so the player could walk over painted walls onto painted "abyss". The walkable
// region is defined by CODE (arenaHazards.js); the art must never contradict it. A picture is
// therefore only drawn as ground when the pipeline's ground gate stamped it
// `assetMeta.slots.background_far.role === 'ground'`. Everything else (every older set, a failed
// gate) is replaced by a ground that cannot contain geometry: the set's seamless floor tile baked
// stochastically, or a procedural ground in the world's palette.
import { tileCanvas, bakeStochastic, proceduralGround, hashSeed, samplePalette, paletteOfCenter } from '../assetPipeline/tiling.js';
import { calmGround, localContrast } from '../assetPipeline/arenaArt.js';

/** Which ground a game gets. Pure (node-tested); the scene wrapper below does the drawing. */
export function chooseGroundSource({ dynamic, hasPlate, role, hasFloorTile, killSwitch = false }) {
  if (!dynamic) return 'static';
  if (killSwitch) return hasPlate ? 'plate' : (hasFloorTile ? 'floor' : 'procedural'); // pre-2026-11-21 behaviour
  if (hasPlate && role === 'ground') return 'plate';
  if (hasFloorTile) return 'floor';
  return 'procedural';
}

export const groundKillSwitch = () => {
  try { return localStorage.getItem('PM_ARENA_GROUND') === '0'; } catch { return false; }
};

const DEFAULT_PALETTE = { avg: { r: 64, g: 68, b: 78 }, light: { r: 120, g: 126, b: 140 }, dark: { r: 24, g: 26, b: 34 } };
const BAKE_SCALE = 2; // bake at half resolution and draw at 2x: crisp under the pixel-art filter, 4x cheaper

function hexToPalette(hex) {
  const avg = { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 };
  const k = (f) => ({ r: Math.min(255, avg.r * f), g: Math.min(255, avg.g * f), b: Math.min(255, avg.b * f) });
  return { avg, light: k(1.45), dark: k(0.4) };
}

function putCanvasTexture(scene, key, rgba, w, h) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  tex.getContext().putImageData(new ImageData(rgba, w, h), 0, 0);
  tex.refresh();
  return key;
}

/**
 * Draw the arena ground at depth -1 and return `{ source, palette }`.
 * Sets `scene.arenaFloor` (arenaSurface reads it) and `scene.arenaGroundPalette`.
 */
export function buildArenaGround(scene, width, height) {
  const cfg = scene.gameConfig || {};
  const slots = cfg.assetMeta?.slots || {};
  const hasPlate = scene.textures.exists('dyn_bg_far');
  const hasFloorTile = scene.textures.exists('dyn_floor');
  const source = chooseGroundSource({
    dynamic: !!cfg.dynamicAssetUrls,
    hasPlate,
    role: slots.background_far?.role,
    hasFloorTile,
    killSwitch: groundKillSwitch()
  });
  const seed = hashSeed(`${cfg.layoutSeed || cfg.gameId || cfg.gameName || 'arena'}|ground`);
  const bw = Math.ceil(width / BAKE_SCALE), bh = Math.ceil(height / BAKE_SCALE);
  let palette = DEFAULT_PALETTE;
  let image = null;
  let calmSigma = null;

  try {
    if (source === 'plate') {
      // A gate-approved ground picture (role 'ground'), cover-cropped to the arena and baked through
      // the CALM pass (arenaArt.js): the picture's broad shape and colour stay, the detail that reads
      // as objects (pipes, grates, conduits: none of it collides) is pulled down.
      const src = scene.textures.get('dyn_bg_far').getSourceImage();
      const tw = src?.width || 2048, th = src?.height || 1536;
      const cover = Math.max(bw / tw, bh / th);
      const cw = bw / cover, ch = bh / cover;
      const c = document.createElement('canvas');
      c.width = bw; c.height = bh;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(src, (tw - cw) / 2, (th - ch) / 2, cw, ch, 0, 0, bw, bh);
      const rgba = calmGround(ctx.getImageData(0, 0, bw, bh).data, bw, bh);
      putCanvasTexture(scene, 'pm_arena_ground', rgba, bw, bh);
      image = scene.add.image(0, 0, 'pm_arena_ground').setOrigin(0, 0).setScale(BAKE_SCALE).setDepth(-1);
      palette = samplePalette(rgba, bw, bh, 4);
      calmSigma = localContrast(rgba, bw, bh);
    } else if (source === 'floor') {
      const src = scene.textures.get('dyn_floor').getSourceImage();
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(src, 0, 0);
      try { tileCanvas(c, 'both'); } catch { /* seam fix is cosmetic */ }
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const rgba = calmGround(bakeStochastic({ data, w: c.width, h: c.height }, bw, bh, seed), bw, bh);
      putCanvasTexture(scene, 'pm_arena_ground', rgba, bw, bh);
      image = scene.add.image(0, 0, 'pm_arena_ground').setOrigin(0, 0).setScale(BAKE_SCALE).setDepth(-1);
      palette = samplePalette(rgba, bw, bh, 4);
      calmSigma = localContrast(rgba, bw, bh);
    }
  } catch (err) {
    console.warn('[ArenaGround] source failed, falling back to the procedural ground:', err?.message);
    image = null;
  }

  if (!image) {
    // Procedural: the world's palette from the CENTRE of a legacy plate (its skyline lives at the
    // edges), else the theme floor's average, else a neutral grey. No image, so it cannot lie.
    try {
      if (hasPlate) palette = paletteOfCenter(scene.textures.get('dyn_bg_far').getSourceImage()) || palette;
      else {
        const themeFloor = scene.secondaryTheme?.floorTexture || scene.activeTheme?.floorTexture || 'ground';
        if (scene.textures.exists(themeFloor)) palette = hexToPalette(scene.sampleFloorAverage(themeFloor));
      }
    } catch { /* neutral palette */ }
    const rgba = proceduralGround(bw, bh, palette, seed);
    putCanvasTexture(scene, 'pm_arena_ground', rgba, bw, bh);
    image = scene.add.image(0, 0, 'pm_arena_ground').setOrigin(0, 0).setScale(BAKE_SCALE).setDepth(-1);
  }

  scene.arenaFloor = image;
  scene.arenaGroundPalette = palette;
  scene.arenaGroundSource = source;
  scene.arenaGroundSigma = calmSigma; // local contrast after the calm pass (contract: <= CONTRACT.groundSigmaMax)
  console.info(`[ArenaGround] source=${source}${slots.background_far?.role ? ' (role ground)' : ''}`);
  return { source, palette };
}
