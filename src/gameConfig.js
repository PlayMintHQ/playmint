export const DEFAULT_CONFIG = {
  runSpeed: 350,
  jumpForce: 750,
  gravity: 1800,
  obstacleDelay: 1200,
  speedIncrement: 0.05,
  playerScale: 1.5,
  obstacleScaleMin: 0.8,
  obstacleScaleMax: 1.2,
  floorHeight: 100,
  floorTileScale: 0.15,
  scoreTimerDelay: 100
};

export const GAME_PRESETS = {
  standard: {
    name: 'Standard',
    runSpeed: 350,
    jumpForce: 750,
    gravity: 1800,
    obstacleDelay: 1200,
    speedIncrement: 0.05
  },
  fast: {
    name: 'Fast & Furious',
    runSpeed: 600,
    jumpForce: 850,
    gravity: 2500,
    obstacleDelay: 800,
    speedIncrement: 0.1
  },
  moon: {
    name: 'Moon Jump',
    runSpeed: 300,
    jumpForce: 500,
    gravity: 700,
    obstacleDelay: 1500,
    speedIncrement: 0.02
  }
};
