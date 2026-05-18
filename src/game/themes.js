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
    floorTexture: 'ice_tile',
    platformTexture: 'ice_tile',
    backgroundLayers: [
      { key: 'bg_ice_base', speed: 0.02, scale: 1, alpha: 1 },
      { key: 'bg_ice_sky', speed: 0.05, scale: 1.2, tint: 0xcfe9ff, alpha: 1 },
      { key: 'bg_ice_mountains', speed: 0.2, scale: 1.2, tint: 0x9bd4ff, alpha: 0.9 },
      { key: 'bg_ice_clouds', speed: 0.35, scale: 1.3, tint: 0xffffff, alpha: 0.7 }
    ],
    floorTileScale: 0.25,
    collectibleTexture: 'crate'
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
