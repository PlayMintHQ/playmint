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

// Runner obstacle pacing is likewise budgeted against the run's own physics, so
// a level can never out-run the jump — same rationale as the Action Quest
// helpers above, applied to the obstacle stream instead of the platform chain.
// Three invariants, all derived rather than hand-tuned:
//
//   1. The SPAWN INTERVAL must exceed the jump airtime plus a small ground
//      window. The player has no double jump, so an interval shorter than the
//      airtime means the next obstacle arrives while they are still airborne
//      and two obstacles never fit under one arc. That is unwinnable, not hard.
//   2. The JUMP APEX must clear the tallest obstacle with margin. The obstacle
//      stream and the jump both have to be capable; pacing alone cannot rescue
//      a jump that is too weak to get over the thing it is aimed at.
//   3. The spawn must give a full WARNING once it crosses into view. The
//      player sprite is STATIONARY in world x in this mode (the world scrolls
//      past it — only obstacles/coins move) and obstacles are born just off the
//      RIGHT SCREEN EDGE, which is a fixed world x because the camera's
//      `scrollX` stays at 0. So the warning is `(spawnX - viewportWidth) / v`
//      seconds, and it SHRINKS as the screen narrows — the fixed spawn point
//      hands a phone far less time to react to the first obstacle of a run than
//      a wide desktop does. The lead below converts the required warning time
//      into the extra distance the spawn needs, which makes the warning
//      viewport-independent instead of a phone-vs-desktop accident.
export const RUNNER_REACTION_S = 0.22; // perceive + decide before a jump input
export const RUNNER_GROUND_S = 0.18; // ground time needed to land and re-jump
export const RUNNER_JUMP_FORCE = 750;
export const RUNNER_GRAVITY = 1800;
export const RUNNER_SPEED = 350;
export const RUNNER_OBSTACLE_DELAY_MS = 1200;

/** Time a single runner jump spends in the air, in milliseconds. */
export function runnerAirtimeMs({ jumpForce, gravity } = {}) {
  const j = jumpForce || RUNNER_JUMP_FORCE;
  const g = gravity || RUNNER_GRAVITY;
  return (2 * j * 1000) / g;
}

/**
 * Shortest plausible interval between two obstacles, in milliseconds:
 * one jump's airtime plus the ground window needed to land and jump again.
 */
export function runnerMinObstacleInterval(physics = {}) {
  return runnerAirtimeMs(physics) + RUNNER_GROUND_S * 1000;
}

/**
 * Tallest obstacle the run can produce, in px. `RunnerMode` scales obstacles to
 * `targetSize` (64 static / 54 generated) by `obstacleScaleMax`, so 1.2x of the
 * larger of those is the worst case the player ever has to clear.
 */
export const RUNNER_TALLEST_OBSTACLE_PX = 64 * 1.2;

// How far above the tallest obstacle the jump apex has to reach. Matching it
// exactly is not enough: an apex level with the obstacle top gives a ZERO-length
// window where the feet clear it (the crossing would have to happen
// instantaneously at the apex), so the jump needs real headroom to be landable
// and reactable. The default jumpForce of 750 clears 1.5x at the default
// gravity, so this does not move the shipped defaults.
export const RUNNER_APEX_MARGIN = 1.5;

/**
 * Minimum jump impulse whose apex clears the tallest obstacle with margin, at a
 * given gravity. Returns 0 when the jump is already high enough.
 *
 * This is the floor that rescues combinations the UI can otherwise produce: the
 * AI editor's `jumpForce` minimum of 400 under the `heavy` tuning row's gravity
 * of 2400 gives a 36px apex against a 77px obstacle — a level that cannot be
 * completed at any speed, which no amount of pacing can make fair.
 */
export function runnerMinJumpForce(physics = {}) {
  const g = physics.gravity || RUNNER_GRAVITY;
  return Math.ceil(Math.sqrt(2 * g * RUNNER_TALLEST_OBSTACLE_PX * RUNNER_APEX_MARGIN));
}

/**
 * Seconds of on-screen warning an obstacle must be given before it can reach
 * the player.
 *
 * A jump only clears an obstacle from a window around its apex, so the player
 * never needs the whole airtime to react — only the slack between how long
 * their feet stay above the obstacle top and how long the obstacle takes to
 * cross. That slack is conservatively approximated here as
 * `airtime - REACTION_S`: the real figure is 0.30-0.48s across the tuning
 * table, and this gives ~0.61s at default physics. Floored at zero so a short,
 * floaty jump can never return a negative warning and silently disable the
 * guard.
 */
export function runnerObstacleWarningS(physics = {}) {
  return Math.max(runnerAirtimeMs(physics) / 1000 - RUNNER_REACTION_S, 0);
}

/**
 * How far past the right screen edge an obstacle must be born, in px, to be
 * given that warning at the current run speed.
 */
export function runnerMinObstacleLead({ runSpeed, jumpForce, gravity } = {}) {
  const v = runSpeed || RUNNER_SPEED;
  return v * runnerObstacleWarningS({ jumpForce, gravity });
}

export const DEFAULT_CONFIG = {
  gameType: 'runner', // 'runner', 'platformer', 'shooter', 'dodge'
  themeKey: 'ice',
  difficulty: 5,
  runSpeed: RUNNER_SPEED,
  jumpForce: RUNNER_JUMP_FORCE,
  gravity: RUNNER_GRAVITY,
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
  obstacleDelay: RUNNER_OBSTACLE_DELAY_MS,
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
