/**
 * PlayMint AI Generation Matrix
 * Prompt Parsing and Parameter Generation Utilities
 */

import { ACTION_PLATFORM_TILE_W, actionJumpReach, actionJumpRise, runnerMinJumpForce, runnerMinObstacleInterval } from '../gameConfig';

// Automated mechanics tuning table mapping keywords to gameplay variables
//
// `obstacleDelay` is an interval in MILLISECONDS and every runner row's value
// is kept at or above `runnerMinObstacleInterval` for that row's own jump
// physics — the player has no double jump, so an interval shorter than one
// airtime means the next obstacle arrives while they are still airborne, and
// two obstacles never fit under a single jump arc. That is unwinnable, not
// hard. Difficulty within a row comes from runSpeed (more pixels per second
// covered, same warning time) and from how close the interval sits to the
// physical floor, not from crossing below it. `RunnerMode` enforces the same
// floor at runtime; these values are kept plausible so a generated level is
// playable from its config alone.
export const MECHANICS_TUNING_TABLE = {
  // Speed Modifiers
  fast: { runSpeed: 550, actionWalkSpeed: 420, obstacleDelay: 1050, label: 'Turbo Speed' },
  speed: { runSpeed: 500, actionWalkSpeed: 380, obstacleDelay: 1050, label: 'Fast Pace' },
  zoom: { runSpeed: 600, actionWalkSpeed: 450, obstacleDelay: 1100, label: 'Zoom Speed' },
  slow: { runSpeed: 240, actionWalkSpeed: 180, obstacleDelay: 1800, label: 'Slow Motion' },
  easy: { runSpeed: 260, actionWalkSpeed: 200, obstacleDelay: 1600, label: 'Relaxed/Easy' },
  chill: { runSpeed: 250, actionWalkSpeed: 190, obstacleDelay: 1700, label: 'Chill Mode' },

  // Gravity & Jump Modifiers
  jump: { jumpForce: 850, actionJumpHeight: 700, gravity: 1600, actionGravity: 1300, label: 'High Leap' },
  float: { jumpForce: 650, actionJumpHeight: 800, gravity: 1000, actionGravity: 800, label: 'Floaty Jump' },
  moon: { jumpForce: 600, actionJumpHeight: 850, gravity: 800, actionGravity: 600, label: 'Moon Gravity' },
  space: { jumpForce: 650, actionJumpHeight: 750, gravity: 900, actionGravity: 700, label: 'Space Physics' },
  heavy: { jumpForce: 950, actionJumpHeight: 500, gravity: 2400, actionGravity: 2100, label: 'Heavy Gravity' },

  // Threat & Combat Modifiers
  fight: { actionEnemyCount: 8, obstacleDelay: 1050, actionProjectileEnabled: true, label: 'Combat Action' },
  combat: { actionEnemyCount: 9, obstacleDelay: 1050, actionProjectileEnabled: true, label: 'Deep Combat' },
  enemies: { actionEnemyCount: 7, label: 'Enemy Swarm' },
  shoot: { actionProjectileEnabled: true, actionEnemyCount: 6, label: 'Ranged Combat' },
  hard: { actionEnemyCount: 8, runSpeed: 480, gravity: 2000, obstacleDelay: 1000, label: 'Hard Challenge' },
  hardcore: { actionEnemyCount: 12, runSpeed: 600, gravity: 2200, obstacleDelay: 900, actionProjectileEnabled: true, label: 'Hardcore Survival' },
  peaceful: { actionEnemyCount: 0, obstacleDelay: 2500, label: 'Zen / Peaceful' },

  // World Bounding Modifiers
  short: { worldWidth: 1600, label: 'Mini Level' },
  long: { worldWidth: 5000, label: 'Expanded Level' },
  huge: { worldWidth: 8000, label: 'Mega Level' }
};

/**
 * Raise a runner config to the tightest level its own physics can actually
 * clear. Called after the tuning-table merge, because a later matched row can
 * overwrite the earlier row's jumpForce/gravity (e.g. "fast and moon") and
 * change both floors — the per-row table values cannot be validated in
 * isolation. Mutates and returns the config.
 *
 * Two floors, both physical:
 *  - `obstacleDelay` (ms) may not fall below one jump's airtime plus a landing
 *    window, or the next obstacle arrives while the player is still airborne
 *    and two obstacles never fit under a single arc.
 *  - `jumpForce` may not fall so low that the apex is under the tallest
 *    obstacle, which is an outright uncompletable level.
 */
export function normalizeRunnerPacing(config) {
  if (!config) return config;
  const gravity = config.gravity;
  const minJump = runnerMinJumpForce({ gravity });
  // CEIL, never round: a rounded value can land *below* the floor it was meant
  // to enforce (a floor of 1513.3ms rounded to 1513ms is still an unplayable
  // interval, and an impulse rounded down can leave the apex under the
  // obstacle), which reintroduces exactly the bug the floor exists to prevent.
  if (config.jumpForce != null && config.jumpForce < minJump) {
    config.jumpForce = minJump;
  }
  if (config.obstacleDelay != null) {
    const floor = runnerMinObstacleInterval({ jumpForce: config.jumpForce, gravity });
    if (config.obstacleDelay < floor) config.obstacleDelay = Math.ceil(floor);
  }
  return config;
}

/**
 * Creates a structural metadata object to detail what assets are requested
 * from the generative AI asset layer (Month 1 structural code hooks)
 */
export function createAssetGenerationRequest(promptText, themeKey) {
  const cleanPrompt = promptText.trim();
  return {
    requestId: `gen-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    prompt: cleanPrompt,
    theme: themeKey,
    stylePreset: "retro-pixel-art-8bit",
    dimensions: {
      tileWidth: 64,
      tileHeight: 64
    },
    assetManifest: [
      {
        assetId: "player_texture",
        category: "character_spritesheet",
        spec: { frames: 12, frameWidth: 32, frameHeight: 48 },
        prompt: `Pixel art character sheet of a hero matching the theme "${cleanPrompt}". Front and profile running anims, retro colors.`
      },
      {
        assetId: "enemy_texture",
        category: "enemy_spritesheet",
        spec: { frames: 8, frameWidth: 32, frameHeight: 32 },
        prompt: `Pixel art character spritesheet for a dangerous patrolling monster or creature fitting the theme "${cleanPrompt}".`
      },
      {
        assetId: "platform_texture",
        category: "tile_sprite",
        spec: { width: 64, height: 32 },
        prompt: `Pixel art tiling block for platforms and ground segments. Textures should match a "${cleanPrompt}" environment.`
      },
      {
        assetId: "sky_layer",
        category: "parallax_bg_sky",
        spec: { scrollSpeedRatio: 0.02, scaleY: 1.0 },
        prompt: `Beautiful pixel art sky and horizon panoramic view themed for "${cleanPrompt}". Seamlessly loopable landscape.`
      },
      {
        assetId: "foreground_layer",
        category: "parallax_bg_mountains",
        spec: { scrollSpeedRatio: 0.15, scaleY: 1.15 },
        prompt: `Pixel art parallax overlay detailing silhouettes and midground structures for "${cleanPrompt}". Seamlessly loopable.`
      }
    ]
  };
}

/**
 * Generates procedural layout array configurations based on prompt keywords and difficulty.
 *
 * The chain is PLATFORMER-only (the runner's layout is hardcoded in
 * geminiService) and it is measured against the physics that will actually run:
 * `physics` carries the same actionWalkSpeed/actionJumpHeight/actionGravity the
 * config will carry, and every gap is a fraction of the resulting jump REACH.
 * Fixed pixel spacing used to be tuned against a 300px walk speed, which meant
 * any "slow"-keyword level (walk 180-200) shipped gaps its own jump could not
 * clear — the level became literally impossible to finish.
 *
 * @param {string} promptText
 * @param {string} mode
 * @param {number} worldWidth  Total world width; the chain spans EDGE_MARGIN in from both ends.
 * @param {number} difficulty
 * @param {{walkSpeed?: number, jumpHeight?: number, gravity?: number}} [physics]
 */
export function generateProceduralLayout(promptText, mode, worldWidth = 4000, difficulty = 5, physics = {}) {
  const lower = promptText.toLowerCase();
  const floorY = 1000; // Match LOGICAL_FLOOR_Y

  // Setup layout variables based on prompt modifiers
  let verticality = 'normal'; // normal | vertical (tower) | flat
  if (lower.match(/(tower|high|vertical|climb|mountain)/)) {
    verticality = 'vertical';
  } else if (lower.match(/(flat|straight|ground|plain)/)) {
    verticality = 'flat';
  }

  let platformDensity = 'normal'; // sparse | normal | packed
  if (lower.match(/(cluttered|packed|spooky|trap|bridge)/)) {
    platformDensity = 'packed';
  } else if (lower.match(/(sparse|empty|wide|easy)/)) {
    platformDensity = 'sparse';
  }

  const platforms = [];
  // Keeps generated levels clear of the two bottom corners that are FIXED screen
  // regions — the camera clamps at world x=0 on the opening screen and at
  // worldWidth-viewportWidth on the closing one, which is exactly where the
  // mobile touch controls sit. Comfortably wider than any button cluster; the
  // mobile ground-line gutter (MultiCameraManager) is the actual guarantee.
  const EDGE_MARGIN = 400;
  const startX = EDGE_MARGIN;

  // Reach and apex of one running jump at THIS run's physics. Every horizontal
  // gap is a fraction of `reach` (never a fixed pixel count) and every vertical
  // step a fraction of `rise`, so the chain stays completable when a prompt
  // keyword rewrites walk speed, jump or gravity.
  const reach = Math.max(140, actionJumpReach(physics));
  const rise = Math.max(40, actionJumpRise(physics));

  // Density keywords only pick a window INSIDE the reach budget.
  const densityGap = {
    packed: [0.34, 0.55],
    normal: [0.5, 0.7],
    sparse: [0.62, 0.82]
  };
  const [gapMin, gapMax] = densityGap[platformDensity];
  const gapWindow = (lo = gapMin, hi = gapMax) => reach * (lo + Math.random() * (hi - lo));

  // Platform width per density. Width comes from the platformer grid
  // (ACTION_PLATFORM_TILE_W), never from the runner theme's tile size.
  let defaultWidthScale = 1.5;
  if (platformDensity === 'packed') defaultWidthScale = 1.0;
  else if (platformDensity === 'sparse') defaultWidthScale = 2.0;

  // The finish anchor is a wide landing pad carrying the win zone (it rides the
  // LAST platform, wherever that lands — nothing needs it at the right margin).
  // `padLeftMax` is the furthest left edge it may have and still sit inside the
  // world, so the final hop is a real budgeted gap instead of a snapped tail.
  const finishScaleX = 3.0;
  const finishWidth = finishScaleX * ACTION_PLATFORM_TILE_W;
  const padLeftMax = worldWidth - 40 - finishWidth;

  let prevRight = null; // right edge of the previous platform; null before the first
  let lastY = floorY - 80;
  let index = 0;

  for (;;) {
    let scaleX = defaultWidthScale + (Math.random() * 0.8 - 0.4);
    if (scaleX < 0.8) scaleX = 0.8;
    const width = scaleX * ACTION_PLATFORM_TILE_W;
    const left = prevRight === null ? startX : prevRight + gapWindow();
    // Stop while the chain could still fit THIS platform AND the finish pad
    // after it, each separated by a budgeted gap. Snapping the pad to a fixed
    // margin instead is what used to leave an uncrossable final jump.
    if (prevRight !== null && left + gapWindow(gapMin, gapMax) + finishWidth > padLeftMax) break;

    let targetY = floorY - 80;
    if (verticality === 'vertical') {
      // Steeper steps, still a fraction of the apex so a rising hop can be
      // landed on instead of clipping into the next pad's side.
      const yOffset = Math.round((Math.random() * 2 - 1) * rise * 0.5);
      targetY = Math.max(floorY - 260, Math.min(lastY + yOffset, floorY - 40));
    } else if (verticality === 'flat') {
      targetY = floorY - 50; // flat levels have lower uniform platforms
    } else {
      const yOffset = Math.round((Math.random() * 2 - 1) * rise * 0.4);
      targetY = Math.max(floorY - 180, Math.min(lastY + yOffset, floorY - 50));
    }

    // Determine enemy spawns based on difficulty
    const hasEnemy = (index % 2 === 1) && (difficulty > 2) && (Math.random() * 10 < difficulty);

    platforms.push({
      x: Math.round(left + width / 2),
      y: Math.round(targetY),
      scaleX: parseFloat(scaleX.toFixed(2)),
      hasEnemy: hasEnemy
    });

    lastY = targetY;
    prevRight = left + width;
    index++;
  }

  // Always append the final Win Zone anchor platform at the end of the map.
  // One more budgeted hop from the last chain platform, then clamped so the pad
  // stays inside the world — the clamp can only SHORTEN that hop, never stretch
  // it, so the level stays finishable at any world width.
  const padClimb = Math.min(60, rise * 0.5);
  const padY = Math.round(Math.max(floorY - 260, Math.min(lastY - padClimb, floorY - 120)));
  const padLeft = Math.max(Math.min(prevRight + gapWindow(gapMin, gapMax), padLeftMax), prevRight);
  platforms.push({
    x: Math.round(padLeft + finishWidth / 2),
    y: padY,
    scaleX: finishScaleX,
    hasEnemy: false
  });

  return platforms;
}

/**
 * Generates starting wave/enemy-count scaling for Shooter Arena, scaled by
 * difficulty. Unlike generateProceduralLayout (a side-scroll platform-chain
 * generator, not applicable here), a shooter arena has no level geometry to
 * precompute — waves are spawned at runtime by ShooterMode. This only seeds
 * the starting counts it reads from config.
 */
export function generateWaveConfig(difficulty = 5) {
  const waveCount = Math.max(3, Math.round(3 + difficulty / 2));
  const enemiesPerWave = Math.max(2, Math.round(3 + difficulty / 3));
  return { waveCount, enemiesPerWave };
}

/**
 * Parses user prompts and builds a customized configuration
 */
export function parsePromptKeywords(text) {
  const lower = text.toLowerCase().trim();

  let mode = null;
  let themeKey = null;
  const modifiers = {
    isFast: false,
    isSlow: false,
    isHard: false,
    isLowGravity: false,
    highJump: false,
    lessSpeed: false,
    moreSpeed: false,
    hardcore: false,
  };
  let keywordsMatched = 0;

  // 1. Parse Mode Intent
  // Shooter Arena requires explicit multi-word phrases, checked BEFORE the
  // action_quest pattern — a bare "shoot" ("a platformer where you shoot
  // arrows") still routes to Action Quest.
  if (lower.match(/(shooter arena|arena shooter|top[- ]?down shooter|twin[- ]?stick|bullet hell)/)) {
    mode = 'shooter_arena';
    keywordsMatched++;
  } else if (lower.match(/(action|quest|fight|platformer|enemies|shoot|kill|combat)/)) {
    mode = 'action_quest';
    keywordsMatched++;
  } else if (lower.match(/(run|dash|runner|dodge|sprint)/)) {
    mode = 'standard';
    keywordsMatched++;
  }

  // 2. Parse Theme Intent
  const themeDefs = [
    { key: 'lava', regex: /(lava|volcano|molten|inferno|ash)/ },
    { key: 'ice', regex: /(ice|snow|frost|glacier|winter)/ },
    { key: 'forest', regex: /(forest|jungle|wood|trees|verdant)/ },
    { key: 'city', regex: /(city|urban|town|building|skyscraper|street|sidewalk|neon)/ },
    { key: 'space', regex: /(space|cosmic|galaxy|nebula|planet|asteroid|star|solar|alien)/ }
  ];

  const matchedThemes = [];
  themeDefs.forEach(t => {
    const match = lower.match(t.regex);
    if (match) {
      matchedThemes.push({ key: t.key, index: match.index });
    }
  });

  matchedThemes.sort((a, b) => a.index - b.index);

  themeKey = null;
  let secondaryThemeKey = null;

  if (matchedThemes.length > 0) {
    themeKey = matchedThemes[0].key;
    keywordsMatched++;
  }
  if (matchedThemes.length > 1) {
    secondaryThemeKey = matchedThemes[1].key;
    keywordsMatched++;
  }

  // 3. Match explicit mechanics modifier keywords
  if (lower.match(/(high(er)? jump|big jump|jump higher|super jump|leap)/)) {
    modifiers.highJump = true;
    keywordsMatched++;
  }
  if (lower.match(/(less speed|slow(er)?|chill|relaxed|easy)/)) {
    modifiers.lessSpeed = true;
    modifiers.isSlow = true;
    keywordsMatched++;
  }
  if (lower.match(/(more speed|fast(er)?|speed up|quick|zoom|turbo|rapid)/)) {
    modifiers.moreSpeed = true;
    modifiers.isFast = true;
    keywordsMatched++;
  }
  if (lower.match(/(hardcore|insane|extreme|impossible|chaos|death)/)) {
    modifiers.hardcore = true;
    modifiers.isHard = true;
    keywordsMatched++;
  }
  if (lower.match(/(moon|float|space|fly|low gravity|zero gravity|weightless)/)) {
    modifiers.isLowGravity = true;
    keywordsMatched++;
  }

  // 4. Map tuning configurations dynamically using the Tuning Table
  const tuningParams = {};
  const activeLabels = [];
  Object.keys(MECHANICS_TUNING_TABLE).forEach(kw => {
    if (lower.includes(kw)) {
      Object.assign(tuningParams, MECHANICS_TUNING_TABLE[kw]);
      if (MECHANICS_TUNING_TABLE[kw].label) {
        activeLabels.push(MECHANICS_TUNING_TABLE[kw].label);
      }
      keywordsMatched++;
    }
  });
  normalizeRunnerPacing(tuningParams);

  // Calculate difficulty index
  let difficulty = 5;
  if (modifiers.isHard || modifiers.hardcore) difficulty = 8;
  if (modifiers.isSlow || modifiers.lessSpeed) difficulty = 3;

  // Resolve world width from parameters
  const worldWidth = tuningParams.worldWidth || 4000;

  // 5. Generate Procedural Level Layout Array (Foundational Layout Array)
  const resolvedMode = mode || 'standard';
  const layoutArray = resolvedMode === 'action_quest'
    ? generateProceduralLayout(lower, resolvedMode, worldWidth, difficulty, {
        walkSpeed: tuningParams.actionWalkSpeed,
        jumpHeight: tuningParams.actionJumpHeight,
        gravity: tuningParams.actionGravity
      })
    : null;

  // 6. Generate AI Asset Generation Request Template (Code Hook API)
  const resolvedTheme = themeKey || 'ice';
  const assetRequest = createAssetGenerationRequest(text, resolvedTheme);

  return {
    mode,
    themeKey,
    secondaryThemeKey,
    modifiers,
    tuningParams,
    activeLabels: Array.from(new Set(activeLabels)),
    layoutArray,
    assetRequest,
    keywordsMatched
  };
}

/**
 * Generates custom title dynamically based on prompt theme and mode
 */
export function generateTitle(text, mode, themeKey) {
  const trimmed = text.trim();
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
  if (trimmed.length > 4 && trimmed.length < 36) {
    return trimmed.split(/\s+/).map(cap).join(' ');
  }

  // Long prompts: title from the prompt's own distinctive words, not a canned
  // theme table (a "clockwork castle" game should never be called "Hoarfrost Path")
  const STOP_WORDS = new Set([
    'a', 'an', 'the', 'with', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for',
    'game', 'mode', 'style', 'themed', 'theme', 'some', 'lots', 'many', 'where',
    'runner', 'platformer', 'quest', 'action', 'run', 'make', 'create', 'please'
  ]);
  const words = trimmed.split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));
  const modeWordsList = mode === 'action_quest'
    ? ['Quest', 'Raid', 'Path', 'Saga']
    : mode === 'shooter_arena'
      ? ['Strike', 'Siege', 'Assault', 'Onslaught']
      : ['Run', 'Sprint', 'Rush', 'Dash'];
  if (words.length >= 2) {
    return `${cap(words[0])} ${cap(words[1])} ${modeWordsList[Math.floor(Math.random() * modeWordsList.length)]}`;
  }

  const themeWords = {
    lava: ['Ashfall', 'Molten', 'Cinder', 'Inferno', 'Ember', 'Scorch'],
    ice: ['Glacier', 'Frost', 'Arctic', 'Snowfall', 'Permafrost', 'Hoarfrost'],
    forest: ['Verdant', 'Wildwood', 'Grove', 'Emerald', 'Fern', 'Canopy'],
    city: ['Urban', 'Metro', 'Concrete', 'Skyline', 'Asphalt', 'Neon'],
    space: ['Stellar', 'Cosmic', 'Astral', 'Orbit', 'Nebula', 'Void'],
    default: ['Prime', 'Core', 'Nova', 'Omega', 'Apex', 'Flux'],
  };
  const modeWords =
    mode === 'action_quest'
      ? ['Quest', 'Runes', 'Raid', 'Path', 'Chronicle', 'Saga']
      : mode === 'shooter_arena'
        ? ['Strike', 'Siege', 'Assault', 'Onslaught', 'Salvo', 'Breach']
        : ['Run', 'Sprint', 'Rush', 'Dash', 'Circuit', 'Marathon'];

  const list = themeWords[themeKey] || themeWords.default;
  return `${list[Math.floor(Math.random() * list.length)]} ${modeWords[Math.floor(Math.random() * modeWords.length)]}`;
}
