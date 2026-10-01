export const THEMES = {
  default: {
    key: 'default',
    label: 'Core',
    floorTexture: 'ground',
    platformTexture: 'stone_tile',
    backgroundLayers: [
      { key: 'bg_default_base', speed: 0.02, scale: 1, alpha: 1 }
    ],
    floorTileScale: 0.15,
    collectibleTexture: 'coin',
    obstacleTexture: 'crate',
    moveSpeed: 300,
    jumpForce: 600,
    gravity: 1500,
    worldWidth: 4000,
    tileWidth: 64,
    platformHeight: 32,
    spawnX: 150,
    spawnY: -250,
    enemyTexture: 'dude',
    playerType: 'dude'
  },
  lava: {
    key: 'lava',
    label: 'Lava',
    floorTexture: 'lava_ground',
    platformTexture: 'lava_tile',
    playerTint: 0xff6633,
    backgroundLayers: [
      { key: 'bg_lava_base', speed: 0.02, scale: 1, alpha: 1 },
      { key: 'bg_lava_sky', speed: 0.05, scale: 1.15, tint: 0xffb347, alpha: 1 },
      { key: 'bg_lava_mountains', speed: 0.2, scale: 1.2, tint: 0xff6b3d, alpha: 0.9 },
      { key: 'bg_lava_clouds', speed: 0.35, scale: 1.3, tint: 0xffd6a5, alpha: 0.65 }
    ],
    floorTileScale: 0.2,
    collectibleTexture: 'coin',
    obstacleTexture: 'lava_tile',
    moveSpeed: 350,
    jumpForce: 650,
    gravity: 1600,
    worldWidth: 4000,
    tileWidth: 64,
    platformHeight: 32,
    spawnX: 150,
    spawnY: -250,
    enemyTexture: 'fox',
    enemyAnim: 'yeti_walk',
    playerType: 'fox'
  },
  ice: {
    key: 'ice',
    label: 'Ice',
    floorTexture: 'winter_ground_1',
    platformTexture: 'winter_ground_1',
    playerTint: 0x66aaff,
    backgroundLayers: [
      { key: 'winter_bg_1', speed: 0.02, scale: 1.0, alpha: 1 },
      { key: 'winter_bg_2', speed: 0.1, scale: 1.0, alpha: 1 },
      { key: 'winter_bg_3', speed: 0.3, scale: 1.0, alpha: 1 }
    ],
    floorHeight: 48,
    floorTileScale: 2.0,
    collectibleTexture: 'coin',
    obstacleTexture: 'pine_snow',
    moveSpeed: 280,
    jumpForce: 550,
    gravity: 1400,
    worldWidth: 4000,
    tileWidth: 48,
    platformHeight: 24,
    spawnX: 150,
    spawnY: -200,
    enemyTexture: 'fox',
    enemyAnim: 'fox_run',
    playerType: 'yeti'
  },
  forest: {
    key: 'forest',
    label: 'Forest',
    floorTexture: 'forest_ground',
    platformTexture: 'forest_platform',
    playerTint: 0x66cc66,
    backgroundLayers: [
      { key: 'forest_bg_far', speed: 0.05, scale: 1.0, alpha: 1 },
      { key: 'forest_bg_mid', speed: 0.2, scale: 1.0, alpha: 1 }
    ],
    floorHeight: 48,
    floorTileScale: 1.0,
    collectibleTexture: 'coin',
    obstacleTexture: 'forest_ground',
    moveSpeed: 80,
    jumpForce: 200,
    gravity: 500,
    worldWidth: 960,
    tileWidth: 16,
    platformHeight: 16,
    spawnX: 48,
    spawnY: -48,
    enemyTexture: 'fox',
    enemyAnim: 'slug_walk',
    playerType: 'fox'
  },
  city: {
    key: 'city',
    label: 'City',
    floorTexture: 'city_ground',
    platformTexture: 'city_tile',
    playerTint: 0x4488cc,
    backgroundLayers: [
      { key: 'city_bg_far', speed: 0.02, scale: 1.0, alpha: 0.85 },
      { key: 'city_bg_mid', speed: 0.1, scale: 1.0, alpha: 0.9 },
      { key: 'city_bg_near', speed: 0.3, scale: 1.0, alpha: 1.0 }
    ],
    floorHeight: 48,
    floorTileScale: 2.0,
    collectibleTexture: 'coin',
    collectibleAnim: 'star_spin',
    obstacleTexture: 'city_tile',
    moveSpeed: 330,
    jumpForce: 600,
    gravity: 1600,
    worldWidth: 4000,
    tileWidth: 32,
    platformHeight: 32,
    spawnX: 150,
    spawnY: -250,
    enemyTexture: 'fox',
    enemyAnim: 'slug_walk',
    playerType: 'dude'
  },
  space: {
    key: 'space',
    label: 'Space',
    floorTexture: 'space_ground',
    platformTexture: 'space_tile',
    playerTint: 0xaa66ff,
    backgroundLayers: [
      { key: 'space_bg_stars', speed: 0.005, scale: 1.0, alpha: 1.0 },
      { key: 'space_bg_nebula', speed: 0.02, scale: 1.0, alpha: 0.8 },
      { key: 'space_bg_planet', speed: 0.08, scale: 1.0, alpha: 0.7 }
    ],
    floorHeight: 48,
    floorTileScale: 2.0,
    collectibleTexture: 'coin',
    collectibleAnim: 'star_spin',
    obstacleTexture: 'space_tile',
    moveSpeed: 280,
    jumpForce: 500,
    gravity: 800,
    worldWidth: 4000,
    tileWidth: 64,
    platformHeight: 32,
    spawnX: 150,
    spawnY: -250,
    enemyTexture: 'fox',
    enemyAnim: 'yeti_walk',
    playerType: 'fox'
  }
};

export const getTheme = (key) => {
  if (!key) return THEMES.default;
  return THEMES[key] || THEMES.default;
};

// Each built-in world's backdrop + ground ART, as browser-loadable URLs.
//
// Why this exists: themes.js describes a world as Phaser TEXTURE KEYS
// ('winter_bg_1'), and GameManagerScene.preload() is the only place those keys
// are resolved to files. Anything outside the Phaser scene — today the My Games
// card compositor — had no way to reach the real art of a world, so a static-art
// game painted a hard-coded gradient instead. Those gradients were near-black
// for any world with no themeKey (every prompt-generated game has themeKey null),
// which is why saved cards read as a blank rectangle.
//
// URLs are relative and load.setPath-relative ('assets/…'), matching preload().
// Keep in sync with the preload list in GameManagerScene.
export const THEME_ART_URLS = {
  default: { backdrop: 'assets/themes/forest/bg_far.png', ground: 'assets/ground.png' },
  lava: { backdrop: 'assets/themes/lava/bg.png', ground: 'assets/themes/lava/lava_ground.png' },
  ice: { backdrop: 'assets/themes/winter/bg-1.png', ground: 'assets/themes/winter/winter_ground_1.png' },
  forest: { backdrop: 'assets/themes/forest/bg_far.png', ground: 'assets/themes/forest/ground_tile.png' },
  city: { backdrop: 'assets/themes/city/bg_far.png', ground: 'assets/themes/city/city_tile.png' },
  space: { backdrop: 'assets/themes/space/bg_nebula.png', ground: 'assets/scifi_tileset.png' }
};
