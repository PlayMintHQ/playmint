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
    collectibleTexture: 'crate'
  },
  lava: {
    key: 'lava',
    label: 'Lava',
    floorTexture: 'lava_ground',
    platformTexture: 'lava_tile',
    backgroundLayers: [
      { key: 'bg_lava_base', speed: 0.02, scale: 1, alpha: 1 },
      { key: 'bg_lava_sky', speed: 0.05, scale: 1.15, tint: 0xffb347, alpha: 1 },
      { key: 'bg_lava_mountains', speed: 0.2, scale: 1.2, tint: 0xff6b3d, alpha: 0.9 },
      { key: 'bg_lava_clouds', speed: 0.35, scale: 1.3, tint: 0xffd6a5, alpha: 0.65 }
    ],
    floorTileScale: 0.2,
    collectibleTexture: 'crate'
  },
  ice: {
    key: 'ice',
    label: 'Ice',
    floorTexture: 'winter_ground_1',
    platformTexture: 'winter_ground_1',
    backgroundLayers: [
      { key: 'winter_bg_1', speed: 0.02, scale: 1.0, alpha: 1 },
      { key: 'winter_bg_2', speed: 0.1, scale: 1.0, alpha: 1 },
      { key: 'winter_bg_3', speed: 0.3, scale: 1.0, alpha: 1 }
    ],
    floorHeight: 48,
    floorTileScale: 2.0,
    collectibleTexture: 'pine_snow',
    obstacleTexture: 'pine_snow'
  },
  forest: {
    key: 'forest',
    label: 'Forest',
    floorTexture: 'forest_ground',
    platformTexture: 'forest_platform',
    backgroundLayers: [
      { key: 'forest_bg_far', speed: 0.05, scale: 1.0, alpha: 1 },
      { key: 'forest_bg_mid', speed: 0.2, scale: 1.0, alpha: 1 }
    ],
    floorHeight: 48,
    floorTileScale: 1.0,
    collectibleTexture: 'crate'
  }
};

export const getTheme = (key) => {
  if (!key) return THEMES.default;
  return THEMES[key] || THEMES.default;
};
