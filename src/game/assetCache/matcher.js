// Cache-reuse matcher (added 2026-08-13): decides whether a NEW prompt can reuse
// an already-generated art set instead of paying for a fresh image run.
//
// Two matchers, one contract — both take { userPrompt, candidates } (candidates =
// idbBackend.listGames() entries, blobs stripped) and return
// { matchId, replaceSlots, reason } or null:
// - matchCachedGame: ONE gemini-flash-latest JSON call (~$0.001 — three orders of
//   magnitude below one image call). The LLM judges world/subject fit from each
//   set's source prompt, tags and entity nouns, and names the slots that clash.
// - localMatch: keyless/LLM-failure fallback — deterministic theme + user-named
//   entity comparison, whole-set only.
// Art is MODE-AGNOSTIC by design decision: a runner's set may serve a platformer
// (physics/config always come from the new prompt; only images are shared).

import { generateJson } from '../assetPipeline/providers/geminiImage.js';
import { GENERATED_SLOTS } from '../assetPipeline/slotSpecs.js';
import { extractEntities } from '../assetPipeline/promptDesigner.js';
import { parsePromptKeywords } from '../promptUtils.js';

const SLOT_VOCAB = [...GENERATED_SLOTS, 'projectile', 'collectible'];

// Reuse never crosses viewpoints: side-view art (profile, ground-anchored) is
// unusable in a top-down game and vice versa. Entries stamped before the view
// field existed are all side-view. Mode-agnosticism holds WITHIN a view only.
const sameView = (c, view) => (c.assetMeta?.view || 'side') === view;

// Prompt-generated configs carry themeKey since 2026-09-22 (geminiService
// stamps it); the parsePromptKeywords fallback covers legacy cache entries
// saved before that.
export const candidateTheme = (c) =>
  c?.config?.themeKey || parsePromptKeywords(c?.sourcePrompt || '').themeKey || null;

const STOP_WORDS = new Set([
  'the', 'and', 'with', 'for', 'from', 'into', 'that', 'this', 'have',
  'game', 'runner', 'platformer', 'quest', 'shooter', 'arena', 'play', 'make',
  'mode', 'level', 'style', 'like', 'inspired', 'action', 'adventure'
]);

export function tokenizePrompt(text) {
  if (typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(norm)
    .filter((w) => w && w.length > 2 && !STOP_WORDS.has(w));
}

export function validateSemanticMatch({ userPrompt = '', candidate, replaceSlots = [] }) {
  if (!candidate) return { valid: false, reason: 'candidate-not-found' };

  // 1. Strict Theme Conflict Barrier:
  // Both have known themes and they differ -> strict rejection.
  const promptTheme = parsePromptKeywords(userPrompt).themeKey;
  const candTheme = candidateTheme(candidate);
  if (promptTheme && candTheme && promptTheme !== candTheme) {
    return { valid: false, reason: 'world-theme-mismatch' };
  }

  // 2. Semantic Overlap Floor:
  // When either prompt or candidate is a custom/non-standard theme, require
  // semantic token overlap between the prompt and the candidate's metadata.
  if (!promptTheme || !candTheme) {
    const promptTokens = tokenizePrompt(userPrompt);
    const candidateTokens = new Set([
      ...tokenizePrompt(candidate.sourcePrompt || ''),
      ...(candidate.assetMeta?.tags || []).flatMap(tokenizePrompt),
      ...tokenizePrompt(candidate.config?.gameName || ''),
      ...Object.values(entityMap(candidate)).flatMap(tokenizePrompt)
    ]);
    const matches = promptTokens.filter((t) => candidateTokens.has(t));
    if (promptTokens.length > 0 && matches.length === 0) {
      return { valid: false, reason: 'custom-world-low-overlap' };
    }
  }

  // 3. World slot clash barrier:
  const WORLD_SLOTS = ['background_far', 'background_mid', 'background_near', 'floor'];
  const worldClashes = replaceSlots.filter((s) => WORLD_SLOTS.includes(s)).length;
  if (worldClashes >= 2) {
    return { valid: false, reason: 'world-clash' };
  }

  return { valid: true };
}

const entityMap = (c) => Object.fromEntries(
  Object.entries(c.assetMeta?.slots || {})
    .filter(([, m]) => m?.entity)
    .map(([slot, m]) => [slot, m.entity])
);

// Light noun normalization matching the taxonomy convention (lowercase,
// singularized) so "skeletons" compares equal to a stored "skeleton".
const norm = (s) => {
  if (typeof s !== 'string') return null;
  const v = s.trim().toLowerCase();
  return v.length > 3 && v.endsWith('s') && !v.endsWith('ss') ? v.slice(0, -1) : v || null;
};

const MATCH_SCHEMA = {
  type: 'OBJECT',
  properties: {
    matchId: { type: 'STRING', description: 'id of the ONE cached set that fits the new request, or empty string when none fits' },
    replaceSlots: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'slots whose depicted subject clashes with the new request and must be redrawn; empty when the set fits as-is'
    },
    reason: { type: 'STRING', description: 'short justification, max 12 words' }
  },
  required: ['matchId', 'replaceSlots', 'reason']
};

const buildMatchPrompt = (userPrompt, payload, userTheme = null) => (
  `A player asked for a new 2D game: "${userPrompt}"${userTheme ? ` (detected world theme: "${userTheme}")` : ''}.\n\n` +
  `Previously generated art sets (id, sourcePrompt, name, theme, tags, entities per slot):\n` +
  `${JSON.stringify(payload)}\n\n` +
  `Decide whether ONE of these sets visually fits the new request well enough to reuse its images.\n` +
  `Rules:\n` +
  `- Art is game-mode agnostic: a runner set may serve a platformer and vice versa.\n` +
  `- Judge world/theme/setting and depicted subjects (sourcePrompt, tags, entities). ` +
  `Reuse must never put the player in the wrong world — a lava prompt must not get an ice set.\n` +
  `- replaceSlots: ONLY slots whose SUBJECT clashes with the new request (e.g. the player asked ` +
  `for skeleton enemies but the set's enemy is a wolf). Allowed names: ${SLOT_VOCAB.join(', ')}.\n` +
  `- Palette or style nuance alone is NOT a clash.\n` +
  `- Redrawing a few slots costs ~10x less than generating a whole new set: when a set's WORLD ` +
  `(setting, backdrop, mood) fits, return that match with its clashing subject slots listed — ` +
  `never reject it merely because several gameplay subjects differ.\n` +
  `- Nothing fits → matchId is an empty string. That means: no set's WORLD fits (a set whose ` +
  `backgrounds/floor would need redrawing is a wrong world, not a partial match).`
);

export async function matchCachedGame({ userPrompt, candidates, view = 'side' }) {
  candidates = candidates.filter((c) => sameView(c, view));
  if (!candidates.length) return null;
  const userTheme = parsePromptKeywords(userPrompt || '').themeKey;
  const payload = candidates.map((c) => ({
    id: c.id,
    sourcePrompt: c.sourcePrompt || '',
    gameName: c.config?.gameName ?? null,
    themeKey: candidateTheme(c),
    gameType: c.config?.gameType ?? null,
    tags: c.assetMeta?.tags ?? [],
    entities: entityMap(c)
  }));
  const result = await generateJson({
    prompt: buildMatchPrompt(userPrompt, payload, userTheme),
    responseSchema: MATCH_SCHEMA,
    timeoutMs: 12000,
    label: 'cache-match'
  });
  const matchId = typeof result?.matchId === 'string' ? result.matchId.trim() : '';
  if (!matchId || !candidates.some((c) => c.id === matchId)) return null;
  const replaceSlots = [...new Set(
    (Array.isArray(result.replaceSlots) ? result.replaceSlots : []).filter((s) => SLOT_VOCAB.includes(s))
  )];
  return { matchId, replaceSlots, reason: typeof result.reason === 'string' ? result.reason : '' };
}

// Deterministic fallback: theme must match, and every entity the user NAMED must
// already be what the candidate depicts. Whole-set only (never proposes redraws —
// redrawing costs money and this path exists to stay free). Candidates arrive
// most-recently-used first, so the first hit is the freshest.
export function localMatch({ userPrompt, candidates, view = 'side' }) {
  candidates = candidates.filter((c) => sameView(c, view));
  const themeKey = parsePromptKeywords(userPrompt).themeKey;
  if (!themeKey) return null;
  const wanted = extractEntities(userPrompt);
  const wantedPairs = [
    ['enemy', wanted.enemy],
    ['obstacle', wanted.hazard],
    ['collectible', wanted.collectible]
  ].filter(([, noun]) => noun);
  for (const c of candidates) {
    if (candidateTheme(c) !== themeKey) continue;
    const entities = entityMap(c);
    if (wantedPairs.every(([slot, noun]) => norm(entities[slot]) === norm(noun))) {
      return { matchId: c.id, replaceSlots: [], reason: 'theme match (offline)' };
    }
  }
  return null;
}
