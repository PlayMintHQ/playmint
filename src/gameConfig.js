// Action Quest's OWN geometry + movement scale. The platformer must NOT inherit
// the runner theme's tile size: forest's 16px ground tile produced 17-30px
// platforms (scaleX 1.1-1.9 × 16) with 300px+ gaps, i.e. an unfinishable level
// dressed as a jungle. The platformer's action* physics is authored for ~64px
// blocks, so the grid is fixed and the level generator is measured against it.
export const ACTION_PLATFORM_TILE_W = 64;
export const ACTION_PLATFORM_TILE_H = 32;

// Platformer walk speed. The tuning table's fast/speed rows (420/380) and a
// 336px jump reach at the default jump/gravity — enough to clear the generated
// level's widest gap with margin. Replaces the old chain that fell through to
// the runner theme's moveSpeed (forest 80 — a jump that moved 64px).
export const ACTION_WALK_SPEED_DEFAULT = 420;

/**
 * Horizontal distance one full running jump covers, in px. The level generator
 * budgets every gap against this, so the level can never out-run the physics.
 */
export function actionJumpReach({ walkSpeed, jumpHeight, gravity } = {}) {
  const v = walkSpeed || ACTION_WALK_SPEED_DEFAULT;
  const j = jumpHeight || 600;
  const g = gravity || 1500;
  return v * (2 * j / g);
}

/** Apex height of one jump, in px. Caps how much a generated step may climb. */
export function actionJumpRise({ jumpHeight, gravity } = {}) {
  const j = jumpHeight || 600;
  const g = gravity || 1500;
  return (j * j) / (2 * g);
}

export const DEFAULT_CONFIG = {
  gameType: 'runner', // 'runner', 'platformer', 'shooter', 'dodge'
  themeKey: 'ice',
  difficulty: 5,
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
  coinValue: 25, // score awarded per collected coin (both modes)

  // Action Quest (Platformer) specific defaults
  actionWalkSpeed: ACTION_WALK_SPEED_DEFAULT,
  actionJumpHeight: 600,
  actionGravity: 1500,
  actionEnemyCount: 5,
  actionProjectileEnabled: false,

  // Shooter Arena specific defaults. worldWidth/worldHeight are also read by
  // MultiCameraManager.configureFixedArena for the top-down camera bounds.
  shooterMoveSpeed: 260,
  shooterFireRate: 500,
  shooterProjectileSpeed: 500,
  shooterFireRange: 400,
  shooterEnemySpeed: 100,
  shooterWaveCount: 5,
  shooterEnemiesPerWave: 4,
  // false = AUTO aim: the player turns to the nearest enemy in range and fires
  // on the cooldown, so the only input is "move" (client direction 2026-09-27).
  // true restores the manual twin-stick / mouse / trigger scheme.
  shooterManualAim: false,
  worldWidth: 2000,
  worldHeight: 1500
};

export const GAME_PRESETS = {
  standard: {
    name: 'Runner',
    gameType: 'runner',
    themeKey: 'ice',
    difficulty: 5,
    runSpeed: 350,
    jumpForce: 750,
    gravity: 1800,
    obstacleDelay: 1200,
  },
  action_quest: {
    name: 'Action Quest',
    gameType: 'platformer',
    themeKey: 'ice',
    difficulty: 5,
    actionWalkSpeed: ACTION_WALK_SPEED_DEFAULT,
    actionJumpHeight: 600,
    actionGravity: 1500,
    actionEnemyCount: 3,
    actionProjectileEnabled: true, // Enable by default for action quest now
    // The preset has no procedural layoutArray, so buildLevel1's hand-placed
    // chain (last block centred at 3400) is the level — worldWidth MUST cover
    // it or the physics clamp strands the player short of the win zone.
    worldWidth: 4000
  },
  shooter_arena: {
    name: 'Shooter Arena',
    gameType: 'shooter',
    themeKey: 'ice',
    difficulty: 5,
    shooterMoveSpeed: 260,
    shooterFireRate: 500,
    shooterProjectileSpeed: 500,
    shooterFireRange: 400,
    shooterEnemySpeed: 100,
    shooterWaveCount: 5,
    shooterEnemiesPerWave: 4,
    shooterManualAim: false,
    worldWidth: 2000,
    worldHeight: 1500
  }
};
