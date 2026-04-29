export const DEFAULT_CONFIG = {
  gameType: 'runner', // 'runner', 'platformer', 'dodge'
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
  scoreTimerDelay: 100,
  
  // Action Quest (Platformer) specific defaults
  actionJumpHeight: 600,
  actionGravity: 1500,
  actionEnemyCount: 5,
  actionProjectileEnabled: false
};

export const GAME_PRESETS = {
  standard: {
    name: 'Runner',
    gameType: 'runner',
    runSpeed: 350,
    jumpForce: 750,
    gravity: 1800,
    obstacleDelay: 1200,
  },
  action_quest: {
    name: 'Action Quest',
    gameType: 'platformer',
    actionJumpHeight: 600,
    actionGravity: 1500,
    actionEnemyCount: 3,
    actionProjectileEnabled: false
  }
};
