import { parsePromptKeywords, generateTitle, generateProceduralLayout, generateWaveConfig, normalizeRunnerPacing } from './promptUtils';
import { generateAssetDirections } from './assetPipeline/promptDesigner';
import { isGeminiConfigured } from './assetPipeline/providers/geminiImage';
import { ACTION_WALK_SPEED_DEFAULT } from '../gameConfig';

/**
 * PlayMint Local Generation Service
 * Generates game configurations locally without any API calls
 * Uses deterministic algorithms and templates for instant generation.
 * Asset prompt design and image generation live in ./assetPipeline.
 */

/**
 * Generate game configuration locally without API calls
 * @param {string} promptText - User prompt text
 * @param {Function} onProgress - Progress callback
 * @param {Object} [options] - Optional overrides
 * @param {string} [options.mode] - Explicitly selected mode ('standard' | 'action_quest' | 'shooter_arena').
 *   When provided it ALWAYS wins over any mode the prompt text implies (client
 *   direction: the selected mode bubble is binding; the prompt defines the world).
 * @returns {Object} Game configuration object
 */
export async function generateGameConfig(promptText, onProgress = () => {}, options = {}) {
  try {
    onProgress('[SYSTEM] Initializing local game generation...', 10);

    // Parse the prompt to extract keywords and modifiers
    const parsed = parsePromptKeywords(promptText);
    onProgress('[SYSTEM] Analyzing prompt keywords and modifiers...', 20);

    // Determine game mode — an explicit selection overrides the prompt-derived one.
    const resolvedMode = options.mode || parsed.mode;
    const gameType = resolvedMode === 'action_quest' ? 'platformer'
      : resolvedMode === 'shooter_arena' ? 'shooter'
      : 'runner';

    // Theme may be null: prompts matching none of the predefined themes get their
    // art direction and title derived from the prompt text itself (no more
    // everything-defaults-to-ice).
    const theme = parsed.themeKey;
    const secondaryTheme = parsed.secondaryThemeKey || theme;

    // Generate game name
    const gameName = generateTitle(promptText, resolvedMode || 'standard', theme);
    onProgress(`[SYSTEM] Generated game: "${gameName}"...`, 30);

    // Set difficulty based on modifiers
    let difficulty = 5;
    if (parsed.modifiers.isHard || parsed.modifiers.hardcore) {
      difficulty = 8;
    } else if (parsed.modifiers.isSlow || parsed.modifiers.lessSpeed) {
      difficulty = 3;
    }

    // Set physics parameters with defaults
    let runSpeed = 400;
    let jumpForce = 700;
    let gravity = 1600;
    let obstacleDelay = 1200;
    let actionWalkSpeed = ACTION_WALK_SPEED_DEFAULT;
    let actionJumpHeight = 600;
    let actionGravity = 1400;
    let actionEnemyCount = 5;
    // Projectiles default ON for action quest (matches GAME_PRESETS) — prompt-generated
    // platformer games were shipping without their ranged attack unless the prompt
    // happened to contain a combat keyword. Runner mode ignores this flag.
    let actionProjectileEnabled = true;
    let worldWidth = 4000;

    // Shooter Arena defaults — no gravity/jump concept, so no tuning-table
    // overrides exist for these yet; difficulty scales wave/enemy count
    // (shooterWaves, from generateWaveConfig below).
    let shooterMoveSpeed = 260;
    let shooterFireRate = 500;
    let shooterProjectileSpeed = 500;
    let shooterFireRange = 400;
    let shooterEnemySpeed = 100;
    let shooterWorldWidth = 2000;
    let shooterWorldHeight = 1500;

    // Apply tuning parameters from table
    if (parsed.tuningParams.runSpeed) runSpeed = parsed.tuningParams.runSpeed;
    if (parsed.tuningParams.jumpForce) jumpForce = parsed.tuningParams.jumpForce;
    if (parsed.tuningParams.gravity) gravity = parsed.tuningParams.gravity;
    if (parsed.tuningParams.obstacleDelay) obstacleDelay = parsed.tuningParams.obstacleDelay;
    if (parsed.tuningParams.actionWalkSpeed) actionWalkSpeed = parsed.tuningParams.actionWalkSpeed;
    if (parsed.tuningParams.actionJumpHeight) actionJumpHeight = parsed.tuningParams.actionJumpHeight;
    if (parsed.tuningParams.actionGravity) actionGravity = parsed.tuningParams.actionGravity;
    if (parsed.tuningParams.actionEnemyCount) actionEnemyCount = parsed.tuningParams.actionEnemyCount;
    if (parsed.tuningParams.actionProjectileEnabled) actionProjectileEnabled = parsed.tuningParams.actionProjectileEnabled;
    if (parsed.tuningParams.worldWidth) worldWidth = parsed.tuningParams.worldWidth;

    // Apply individual modifiers
    if (parsed.modifiers.isFast || parsed.modifiers.moreSpeed) {
      runSpeed = Math.min(runSpeed * 1.3, 800);
    }
    if (parsed.modifiers.isSlow || parsed.modifiers.lessSpeed) {
      runSpeed = Math.max(runSpeed * 0.7, 200);
    }
    if (parsed.modifiers.highJump) {
      jumpForce = Math.min(jumpForce * 1.3, 1000);
      actionJumpHeight = Math.min(actionJumpHeight * 1.3, 900);
    }
    if (parsed.modifiers.isLowGravity) {
      gravity = Math.max(gravity * 0.6, 800);
      actionGravity = Math.max(actionGravity * 0.6, 600);
      jumpForce = Math.min(jumpForce * 1.1, 900);
    }
    if (parsed.modifiers.hardcore) {
      difficulty = 10;
      runSpeed = Math.min(runSpeed * 1.5, 800);
      obstacleDelay = Math.max(obstacleDelay * 0.6, 600);
      actionEnemyCount = Math.min(actionEnemyCount * 2, 15);
    }

    // The runner obstacle interval is an interval in milliseconds and has to
    // stay above one jump's airtime or the level is unwinnable (no double
    // jump, and two obstacles never fit under one arc). Both the tuning table
    // and the modifier multipliers above can push a runSpeed as high as 800,
    // so this is re-checked against the FINAL physics — a difficulty keyword
    // shortens the interval, it never buys an impossible one.
    obstacleDelay = normalizeRunnerPacing({ obstacleDelay, jumpForce, gravity }).obstacleDelay;

    // Wave/enemy-count scaling for Shooter Arena — analogous to the procedural
    // layout generators below, but shooter waves are computed at runtime by
    // ShooterMode, so this just seeds the starting counts.
    const shooterWaves = generateWaveConfig(difficulty);

    onProgress('[SYSTEM] Configured physics and gameplay parameters...', 40);

    // Generate procedural layout for platformer mode. The generator measures
    // its gaps against the physics the level will actually run with, so a
    // speed/gravity keyword can't leave an uncrossable chain behind.
    let layoutArray = [];
    if (gameType === 'platformer') {
      layoutArray = generateProceduralLayout(promptText, 'action_quest', worldWidth, difficulty, {
        walkSpeed: actionWalkSpeed,
        jumpHeight: actionJumpHeight,
        gravity: actionGravity
      });
      onProgress('[SYSTEM] Generated procedural level layout...', 50);
    } else if (gameType === 'shooter') {
      // Waves are generated at runtime in ShooterMode — no precomputed layout.
      layoutArray = null;
    } else {
      // For runner mode, create a simple layout
      layoutArray = [
        { x: 400, y: 900, scaleX: 1.5, hasEnemy: false },
        { x: 800, y: 850, scaleX: 1.2, hasEnemy: false },
        { x: 1200, y: 900, scaleX: 1.8, hasEnemy: difficulty > 3 },
        { x: 1600, y: 820, scaleX: 1.3, hasEnemy: false },
        { x: 2000, y: 880, scaleX: 1.5, hasEnemy: difficulty > 5 },
        { x: 2400, y: 850, scaleX: 1.4, hasEnemy: false },
        { x: 2800, y: 900, scaleX: 1.6, hasEnemy: difficulty > 7 },
        { x: 3200, y: 840, scaleX: 1.5, hasEnemy: false },
        { x: 3600, y: 850, scaleX: 3.0, hasEnemy: false }
      ];
    }

    onProgress('[SYSTEM] Creating asset design templates...', 60);

    // Create asset design directions based on theme
    const assetDesignDirections = generateAssetDirections(theme, secondaryTheme, promptText, gameType);

    onProgress('[SYSTEM] Compiling asset generation prompts...', 70);

    // Compile the final configuration
    const config = {
      gameType,
      gameName,
      difficulty,
      // The matched theme rides the config so every downstream consumer (static
      // theme fallback, localDesign accents, cache matcher candidateTheme) sees
      // the prompt's world instead of defaulting to 'ice'. May be null for
      // prompts matching no predefined theme — those stay prompt-derived.
      themeKey: theme,
      secondaryThemeKey: secondaryTheme,
      runSpeed,
      jumpForce,
      gravity,
      obstacleDelay,
      actionWalkSpeed,
      actionJumpHeight,
      actionGravity,
      actionEnemyCount,
      actionProjectileEnabled,
      shooterMoveSpeed,
      shooterFireRate,
      shooterProjectileSpeed,
      shooterFireRange,
      shooterEnemySpeed,
      shooterWaveCount: shooterWaves.waveCount,
      shooterEnemiesPerWave: shooterWaves.enemiesPerWave,
      // AUTO aim is the default (client direction 2026-09-27): the player turns
      // to the nearest enemy in range and fires on the cooldown, so the only
      // input is "move". `true` restores the manual twin-stick/mouse scheme.
      shooterManualAim: false,
      worldWidth: gameType === 'shooter' ? shooterWorldWidth : worldWidth,
      worldHeight: gameType === 'shooter' ? shooterWorldHeight : 1500,
      layoutArray,
      assetDesignDirections,
      // The originating prompt rides the config from here on: the asset cache
      // keys on it, and share links carry it (it was previously transient).
      sourcePrompt: promptText || ''
    };
    // Plain boolean flag: truthy routes every Phaser consumer to dyn_* textures
    // (raw Pollinations fallback URLs are gone — Gemini is the only generator).
    // Keyless runs get null so the game boots straight onto static theme art;
    // failure paths also null it via toStaticThemeConfig.
    config.dynamicAssetUrls = isGeminiConfigured() ? true : null;

    onProgress('[SYSTEM] Local generation complete!', 90);

    console.log('[Local Generation] Final config:', config);

    return {
      success: true,
      config,
      logs: [`Generated locally: ${gameName} (${theme || 'custom'} theme, difficulty ${difficulty})`]
    };

  } catch (error) {
    console.error('[Local Generation Error]:', error);
    throw error;
  }
}
