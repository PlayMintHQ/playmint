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
    collectibleTexture: 'crate',
    obstacleTexture: 'crate',
    moveSpeed: 300,
    jumpForce: 600,
    gravity: 1500,
    worldWidth: 4000,
    tileWidth: 64,
    platformHeight: 32,
    spawnX: 150,
    spawnY: -250,
    enemyTexture: 'dude'
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
    collectibleTexture: 'crate',
    obstacleTexture: 'lava_tile',
    moveSpeed: 350,
    jumpForce: 650,
    gravity: 1600,
    worldWidth: 4000,
    tileWidth: 64,
    platformHeight: 32,
    spawnX: 150,
    spawnY: -250,
    enemyTexture: 'dude'
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
    collectibleTexture: 'pine_snow',
    obstacleTexture: 'pine_snow',
    moveSpeed: 280,
    jumpForce: 550,
    gravity: 1400,
    worldWidth: 4000,
    tileWidth: 48,
    platformHeight: 24,
    spawnX: 150,
    spawnY: -200,
    enemyTexture: 'pine_snow'
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
    collectibleTexture: 'crate',
    obstacleTexture: 'forest_ground',
    moveSpeed: 80,
    jumpForce: 200,
    gravity: 500,
    worldWidth: 960,
    tileWidth: 16,
    platformHeight: 16,
    spawnX: 48,
    spawnY: -48,
    enemyTexture: 'pine_snow'
  }
};

export const getTheme = (key) => {
  if (!key) return THEMES.default;
  return THEMES[key] || THEMES.default;
};
