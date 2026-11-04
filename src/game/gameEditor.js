import { isGeminiConfigured, generateJson } from './assetPipeline/providers/geminiImage';
import { GENERATED_SLOTS } from './assetPipeline/slotSpecs';
import { parsePromptKeywords } from './promptUtils';

/**
 * AI game editor — interprets a Creator Panel prompt against the CURRENT game config.
 *
 * Returns { intent: 'tweak' | 'restyle' | 'regenerate', changes, assetTargets?, summary, source }.
 * - 'tweak'      → `changes` is a whitelisted, clamped patch for setLiveParams; the
 *                  running game applies it live via the update-game-config event.
 *                  No asset generation, no reboot.
 * - 'restyle'    → regenerate ONLY the artwork named in `assetTargets` (friendly
 *                  element names; resolveAssetTargets maps them to pipeline slots).
 *                  Config, mode, layout and variable tweaks all survive. 'all' is a
 *                  whole-look re-theme.
 * - 'regenerate' → brand-new game concept: full pipeline (new config + new assets).
 *
 * Game-mode switching is intentionally NOT supported here — mode requests come back
 * as an empty tweak whose summary explains that, instead of nuking the running game.
 *
 * The LLM proposes, code enforces: only whitelisted fields survive, every value is
 * clamped to the same safe ranges geminiService uses. Without a Gemini key (or on any
 * API failure) a local keyword fallback applies modifier deltas to the current values.
 */

// field → { min, max, int } | { bool } | { str, maxLen }
const EDITABLE_FIELDS = {
  runSpeed: { min: 150, max: 800, label: 'runner scroll speed (px/s)' },
  jumpForce: { min: 400, max: 1000, label: 'runner jump impulse' },
  gravity: { min: 600, max: 2600, label: 'runner gravity' },
  obstacleDelay: { min: 400, max: 3000, int: true, label: 'ms between runner obstacles (lower = harder)' },
  difficulty: { min: 1, max: 10, int: true, label: 'overall difficulty 1-10' },
  actionEnemyCount: { min: 0, max: 20, int: true, label: 'platformer enemy count' },
  actionWalkSpeed: { min: 200, max: 600, label: 'platformer walk speed (px/s)' },
  actionJumpHeight: { min: 300, max: 900, label: 'platformer jump impulse' },
  actionGravity: { min: 500, max: 2200, label: 'platformer gravity' },
  actionProjectileEnabled: { bool: true, label: 'platformer ranged attack on/off' },
  worldWidth: { min: 1600, max: 12000, int: true, label: 'platformer level length (px)' },
  coinValue: { min: 0, max: 500, int: true, label: 'points per collected coin' },
  gameName: { str: true, maxLen: 60, label: 'display title' },
  shooterMoveSpeed: { min: 100, max: 500, label: 'shooter player move speed (px/s)' },
  shooterFireRate: { min: 150, max: 1500, int: true, label: 'shooter ms between shots (lower = faster)' },
  shooterProjectileSpeed: { min: 200, max: 900, label: 'shooter projectile speed' },
  shooterFireRange: { min: 150, max: 800, label: 'shooter aim-assist range (px)' },
  shooterManualAim: { bool: true, label: 'shooter manual aim (off = auto-target aim assist)' },
  shooterEnemySpeed: { min: 40, max: 400, label: 'shooter enemy chase speed' },
  shooterWaveCount: { min: 1, max: 20, int: true, label: 'shooter number of waves' },
  shooterEnemiesPerWave: { min: 1, max: 20, int: true, label: 'shooter enemies per wave' }
};

// Friendly element name → pipeline slot list. 'player' maps to the sheet slot —
// the pipeline stores its output under the 'player' key and falls back to the
// static sprite when the sheet gates reject, same as a full generation.
const ASSET_TARGET_SLOTS = {
  background: ['background_far', 'background_mid', 'background_near'],
  foreground: ['background_mid', 'background_near'],
  floor: ['floor'],
  platforms: ['platform'],
  player: ['player_sheet'],
  enemy: ['enemy'],
  obstacle: ['obstacle'],
  projectile: ['projectile'],
  collectibles: ['collectible']
};

/** Map restyle target names to a deduped pipeline slot list for this config. */
export function resolveAssetTargets(targets, config) {
  const isPlatformer = config?.gameType === 'platformer';
  const isShooter = config?.gameType === 'shooter';
  // Shooter: a single rotating top-down player, and no parallax/platform art
  // exists in that mode (see generateGameAssets' effectiveSkipSlots). The
  // obstacle slot is the arena's cover prop.
  const SHOOTER_SKIPPED = ['background_mid', 'background_near', 'platform'];
  const allSlots = GENERATED_SLOTS
    .filter(s => !(isShooter && SHOOTER_SKIPPED.includes(s)))
    .map(s => (s === 'player' && !isShooter ? 'player_sheet' : s));
  if (isPlatformer || isShooter) allSlots.push('projectile');
  allSlots.push('collectible');
  const slots = new Set();
  for (const target of targets || []) {
    if (target === 'all') {
      allSlots.forEach(s => slots.add(s));
      continue;
    }
    for (const rawSlot of ASSET_TARGET_SLOTS[target] || []) {
      if (isShooter && SHOOTER_SKIPPED.includes(rawSlot)) continue;
      const slot = rawSlot === 'player_sheet' && isShooter ? 'player' : rawSlot;
      if (slot === 'projectile' && !isPlatformer && !isShooter) continue; // runners never shoot
      slots.add(slot);
    }
  }
  return [...slots];
}

const EDITOR_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: {
      type: 'STRING',
      enum: ['tweak', 'restyle', 'regenerate'],
      description: 'tweak = only numeric/boolean gameplay variables or the title change; restyle = new artwork for some or all elements of the CURRENT game; regenerate = a completely different game concept'
    },
    assetTargets: {
      type: 'ARRAY',
      items: { type: 'STRING', enum: ['background', 'foreground', 'floor', 'platforms', 'player', 'enemy', 'obstacle', 'projectile', 'collectibles', 'all'] },
      description: 'Only for intent=restyle: which elements get new artwork. Use "all" for a whole-look re-theme.'
    },
    summary: { type: 'STRING', description: 'One short line describing what changed, e.g. "runSpeed 400 → 560, enemies 5 → 10". For restyle/regenerate, say what is being redrawn and why.' },
    changes: {
      type: 'OBJECT',
      description: 'Only for intent=tweak: the fields to change with their NEW values. Omit fields that stay the same.',
      properties: {
        runSpeed: { type: 'NUMBER' },
        jumpForce: { type: 'NUMBER' },
        gravity: { type: 'NUMBER' },
        obstacleDelay: { type: 'NUMBER' },
        difficulty: { type: 'NUMBER' },
        actionEnemyCount: { type: 'NUMBER' },
        actionWalkSpeed: { type: 'NUMBER' },
        actionJumpHeight: { type: 'NUMBER' },
        actionGravity: { type: 'NUMBER' },
        actionProjectileEnabled: { type: 'BOOLEAN' },
        worldWidth: { type: 'NUMBER' },
        coinValue: { type: 'NUMBER' },
        gameName: { type: 'STRING' },
        shooterMoveSpeed: { type: 'NUMBER' },
        shooterFireRate: { type: 'NUMBER' },
        shooterProjectileSpeed: { type: 'NUMBER' },
        shooterFireRange: { type: 'NUMBER' },
        shooterManualAim: { type: 'BOOLEAN' },
        shooterEnemySpeed: { type: 'NUMBER' },
        shooterWaveCount: { type: 'NUMBER' },
        shooterEnemiesPerWave: { type: 'NUMBER' }
      }
    }
  },
  required: ['intent', 'summary']
};

function clampChanges(rawChanges) {
  const changes = {};
  if (!rawChanges || typeof rawChanges !== 'object') return changes;
  for (const [key, rule] of Object.entries(EDITABLE_FIELDS)) {
    if (!(key in rawChanges)) continue;
    const value = rawChanges[key];
    if (rule.bool) {
      changes[key] = !!value;
    } else if (rule.str) {
      const s = String(value ?? '').trim();
      if (s) changes[key] = s.slice(0, rule.maxLen);
    } else {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      const clamped = Math.min(rule.max, Math.max(rule.min, n));
      changes[key] = rule.int ? Math.round(clamped) : clamped;
    }
  }
  return changes;
}

function currentValues(config) {
  const out = {};
  for (const key of Object.keys(EDITABLE_FIELDS)) {
    if (config?.[key] !== undefined) out[key] = config[key];
  }
  out.gameType = config?.gameType || 'runner';
  return out;
}

function summarize(changes, config) {
  const parts = Object.entries(changes).map(([k, v]) => {
    const oldV = config?.[k];
    return oldV !== undefined && oldV !== v ? `${k} ${oldV} → ${v}` : `${k} = ${v}`;
  });
  return parts.join(', ');
}

// What the current game LOOKS like, for the editor model. Without it the model
// only saw numbers and could not tell "add dragons" (one element) from "make it a
// different world" (everything) — it chose ['all'] and the ice world was redrawn
// (client report 2026-11-04).
function worldContext(config) {
  const design = config?.assetMeta?.design;
  const parts = [];
  if (config?.gameName) parts.push(`title "${config.gameName}"`);
  if (config?.sourcePrompt) parts.push(`created from the prompt "${String(config.sourcePrompt).slice(0, 300)}"`);
  if (config?.themeKey) parts.push(`built-in theme "${config.themeKey}"`);
  if (design?.styleGuide?.styleSummary) parts.push(`art style "${design.styleGuide.styleSummary}"`);
  if (design?.subjects?.background_far) parts.push(`scenery "${String(design.subjects.background_far).slice(0, 160)}"`);
  if (design?.subjects?.player) parts.push(`player "${String(design.subjects.player).slice(0, 120)}"`);
  if (design?.subjects?.enemy) parts.push(`enemy "${String(design.subjects.enemy).slice(0, 120)}"`);
  return parts.length ? parts.join('; ') : 'unknown (treat the current world as something to KEEP)';
}

// Instruction shapes that are ALWAYS a targeted change, never a new world.
const ADDITIVE_RE = /^\s*(?:please\s+)?(?:add|give|put|include|insert|replace|swap|change|make\s+the|turn\s+the|redraw|recolou?r|new)\b/i;
// Lighting / time-of-day / weather / mood: the WORLD's backdrop, not its cast.
const ATMOSPHERE_RE = /\b(night|night-?time|midnight|day|day-?time|sunset|sunrise|dawn|dusk|evening|twilight|rain|rainy|storm|stormy|snowy|snowing|fog|foggy|misty|spooky|darker|brighter|dark|bright)\b/i;
// The user explicitly names a DIFFERENT world/setting — the only case for 'all'.
const NEW_WORLD_RE = /\b(?:world|level|setting|theme|universe|planet|city|town|land|kingdom|biome)\b|\b(?:turn|transform|convert|change)\s+(?:it|this|the\s+(?:game|world|level))\s+(?:in)?to\b|\bset\s+(?:it|this)\s+in\b/i;
// Counts and amounts are settings, not art ("more enemies", "10 enemies"), and so
// are physics/difficulty words ("make the player faster", "jump higher").
const AMOUNT_RE = /\b(more|fewer|less|double|triple|half|\d+|faster|slower|quicker|speed|speedier|higher|lower|jump|jumps|gravity|harder|easier|difficult|difficulty|tougher|stronger|weaker)\b/i;

/** Named art elements in the instruction → editor target names (no 'all'). */
export function namedTargets(text) {
  const targets = [];
  if (/\b(foreground|props?|decorations?|decor)\b/.test(text)) targets.push('foreground');
  if (/\b(background|backdrop|sky|scenery|skyline)\b/.test(text)) targets.push('background');
  if (/\b(floor|ground|terrain)\b/.test(text)) targets.push('floor');
  if (/\bplatforms?\b/.test(text)) targets.push('platforms');
  if (/\b(player|hero|character|protagonist|ninja|knight|me)\b/.test(text)) targets.push('player');
  if (/\b(enem(?:y|ies)|monsters?|boss|villains?|foes?|creatures?|dragons?|robots?|zombies?|skeletons?|ghosts?|aliens?)\b/.test(text)) targets.push('enemy');
  if (/\b(obstacles?|hazards?|traps?|spikes?|cover|crates?|barriers?|walls?)\b/.test(text)) targets.push('obstacle');
  if (/\b(projectiles?|bullets?|bolts?|shots?|arrows?|fireballs?)\b/.test(text)) targets.push('projectile');
  if (/\b(coins?|collectibles?|pickups?|gems?|treasure|rewards?)\b/.test(text)) targets.push('collectibles');
  return targets;
}

/**
 * Scope guard (code enforces, the LLM proposes): an instruction that names
 * specific elements, or only asks for a different time of day, can never become
 * a whole-world redraw or a brand-new game. Returns a corrected result or null.
 */
export function enforceScope(result, instruction) {
  const text = instruction.toLowerCase();
  const named = namedTargets(text);
  const newWorld = NEW_WORLD_RE.test(text);
  const wantsAll = result.intent === 'regenerate' || (result.assetTargets || []).includes('all');
  if (!wantsAll || newWorld) return null;
  if (named.length && (ADDITIVE_RE.test(text) || !AMOUNT_RE.test(text))) {
    return { intent: 'restyle', assetTargets: named, changes: result.changes || {}, summary: `Redrawing only the ${named.join(', ')} — the rest of the game is kept`, source: result.source };
  }
  if (ATMOSPHERE_RE.test(text)) {
    return { intent: 'restyle', assetTargets: ['background', 'floor'], changes: result.changes || {}, summary: 'Redrawing the scenery for the new atmosphere — characters and props are kept', source: result.source };
  }
  return null;
}

async function geminiInterpret(config, instruction) {
  const fieldDocs = Object.entries(EDITABLE_FIELDS)
    .map(([k, r]) => `- ${k}: ${r.label}${r.bool ? ' (boolean)' : r.str ? '' : ` (range ${r.min}-${r.max})`}`)
    .join('\n');

  const prompt = [
    'You are the live editor for a 2d browser game. The player typed an instruction to change the CURRENT game.',
    'Decide the intent: "tweak" (only the variables below change), "restyle" (artwork of SOME elements of the',
    'CURRENT game is redrawn, everything else is kept exactly as it is), or "regenerate" (a completely different game).',
    '',
    `Current game type: ${config?.gameType || 'runner'} (runner fields only matter for runner, action* fields only for platformer, shooter* fields only for the shooter arena).`,
    `Current world: ${worldContext(config)}.`,
    `Current values: ${JSON.stringify(currentValues(config))}`,
    '',
    'Editable variables:',
    fieldDocs,
    '',
    'Rules — the default is the SMALLEST change that satisfies the instruction:',
    '- Relative requests ("faster", "double the enemies", "more coins") are tweaks computed FROM the current values.',
    '- Renaming the game is a tweak (gameName).',
    '- Adding, replacing or changing a specific element ("add dragon enemies", "replace the enemies with robots", "give the hero a red cape", "make the coins gems") is "restyle" with assetTargets listing ONLY that element. The world, background, floor, player and every other element are KEPT.',
    '- Lighting, time of day, weather or mood ("make it night", "at sunset", "make it rainy", "spookier") is "restyle" with assetTargets ["background", "floor"] only.',
    '- Use assetTargets ["all"] ONLY when the player explicitly asks for a different world, setting or theme ("turn this into a lava world", "African city level", "set it in Japan"); if that suggests a new title, also set gameName in changes.',
    '- "regenerate" is ONLY for an explicitly different game concept with new rules. Never for additions or art changes.',
    '- The game mode CANNOT be changed here. For mode-switch requests ("make this a runner", "turn it into a platformer", "turn it into a shooter arena") return "tweak" with NO changes and a summary explaining the mode can only be chosen when starting a new game.',
    '- For tweak, put ONLY the changed fields in `changes` with their new absolute values.',
    '',
    `Player instruction: "${instruction}"`
  ].join('\n');

  const result = await generateJson({ prompt, responseSchema: EDITOR_RESPONSE_SCHEMA, label: 'editor' });
  if (result.intent === 'regenerate') {
    const scoped = enforceScope({ intent: 'regenerate', changes: {}, source: 'gemini' }, instruction);
    if (scoped) return scoped;
    return { intent: 'regenerate', changes: {}, summary: result.summary || '', source: 'gemini' };
  }
  if (result.intent === 'restyle') {
    let targets = (result.assetTargets || []).filter(t => t === 'all' || ASSET_TARGET_SLOTS[t]);
    if (!targets.length) targets = namedTargets(instruction.toLowerCase());
    if (!targets.length) {
      // Never a silent whole-world redraw because the model returned no target.
      return {
        intent: 'tweak',
        changes: {},
        summary: 'Which part should change? Name it — for example the background, the player, the enemies, the floor or the coins.',
        source: 'gemini'
      };
    }
    const out = {
      intent: 'restyle',
      assetTargets: targets,
      changes: clampChanges(result.changes),
      summary: result.summary || 'Updating artwork',
      source: 'gemini'
    };
    return enforceScope(out, instruction) || out;
  }
  const changes = clampChanges(result.changes);
  return {
    intent: 'tweak',
    changes,
    summary: summarize(changes, config) || result.summary || 'No changes recognized',
    source: 'gemini'
  };
}

/** Keyless/failed-API fallback: apply keyword-modifier deltas to the CURRENT values. */
function localInterpret(config, instruction) {
  const text = instruction.toLowerCase();

  // Mode switching is intentionally unsupported from the edit prompt — refuse
  // politely instead of falling through to a full regeneration. Tight match:
  // "make the player run faster" must NOT trip this ("runner"/"platformer" only),
  // and asking for the mode the game already is in is a no-op, not a switch.
  const modeMatch = text.match(/\b(?:switch|change|turn|convert|make|swap)\b[^.!?]*\b(runner|platformer|action\s*quest|shooter(?:\s*arena)?)\b/);
  if (modeMatch) {
    const MODE_NAME_TO_GAME_TYPE = { runner: 'runner', platformer: 'platformer', 'action quest': 'platformer' };
    const requested = MODE_NAME_TO_GAME_TYPE[modeMatch[1].replace(/\s+/g, ' ')] || 'shooter';
    if (requested !== (config?.gameType || 'runner')) {
      return {
        intent: 'tweak',
        changes: {},
        summary: "The game mode can't be changed from the edit prompt — start a new game to switch modes.",
        source: 'local'
      };
    }
  }

  // Art first when the instruction NAMES a new kind of element ("add dragon
  // enemies", "replace the coins with gems"): the keyword tuning table maps
  // "enemies" to an enemy COUNT, which used to win and silently drop the art ask.
  const named = namedTargets(text);
  if (named.length && ADDITIVE_RE.test(text) && !AMOUNT_RE.test(text)) {
    return { intent: 'restyle', assetTargets: named, changes: {}, summary: `Redrawing only the ${named.join(', ')} — the rest of the game is kept`, source: 'local' };
  }

  const parsed = parsePromptKeywords(instruction);
  const changes = {};
  const m = parsed.modifiers;
  const cur = (k, dflt) => (Number.isFinite(config?.[k]) ? config[k] : dflt);

  if (m.isFast || m.moreSpeed) changes.runSpeed = cur('runSpeed', 400) * 1.3;
  if (m.isSlow || m.lessSpeed) changes.runSpeed = cur('runSpeed', 400) * 0.7;
  if (m.highJump) {
    changes.jumpForce = cur('jumpForce', 700) * 1.3;
    changes.actionJumpHeight = cur('actionJumpHeight', 600) * 1.3;
  }
  if (m.isLowGravity) {
    changes.gravity = cur('gravity', 1600) * 0.6;
    changes.actionGravity = cur('actionGravity', 1400) * 0.6;
  }
  if (m.hardcore) {
    changes.difficulty = 10;
    changes.runSpeed = cur('runSpeed', 400) * 1.5;
    changes.obstacleDelay = cur('obstacleDelay', 1200) * 0.6;
    changes.actionEnemyCount = cur('actionEnemyCount', 5) * 2;
  }
  Object.assign(changes, parsed.tuningParams);

  const clamped = clampChanges(changes);
  if (Object.keys(clamped).length) {
    return { intent: 'tweak', changes: clamped, summary: summarize(clamped, config), source: 'local' };
  }

  // No variable change recognized — look for named art elements ("change the
  // foreground", "new enemy") so only those slots get redrawn.
  if (named.length) {
    return { intent: 'restyle', assetTargets: named, changes: {}, summary: `Redrawing ${named.join(', ')}`, source: 'local' };
  }

  // A theme word means the user wants a different look — re-skin the current game
  // rather than rebuilding it from scratch.
  if (parsed.themeKey || NEW_WORLD_RE.test(text)) {
    return { intent: 'restyle', assetTargets: ['all'], changes: {}, summary: 'Restyling all artwork', source: 'local' };
  }

  // Time of day / weather / mood: the scenery only.
  if (ATMOSPHERE_RE.test(text)) {
    return { intent: 'restyle', assetTargets: ['background', 'floor'], changes: {}, summary: 'Redrawing the scenery', source: 'local' };
  }

  // Nothing recognizable — treat as a brand-new game prompt.
  return { intent: 'regenerate', changes: {}, summary: '', source: 'local' };
}

export async function interpretEditPrompt(config, instruction) {
  if (isGeminiConfigured()) {
    try {
      return await geminiInterpret(config, instruction);
    } catch (err) {
      console.warn('[gameEditor] Gemini interpretation failed, using local fallback:', err?.message || err);
    }
  }
  return localInterpret(config, instruction);
}
