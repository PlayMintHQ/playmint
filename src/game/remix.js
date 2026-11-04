// Remix = an EDIT applied over the parent's art (2026-11-04).
//
// The first remix implementation was a brand-new game built from whatever text
// was in the prompt box. For a promptless parent (every Quick Start game, e.g.
// "Snowfall Chronicle") that box is EMPTY, so "add dragon enemies" became the
// entire prompt and the ice world disappeared. A remix now:
//   1. restores the parent's art set (local cache, else the server copy),
//   2. reads the typed text as an INSTRUCTION against that game (the same editor
//      the Quick Edit box uses, with the same scope rules),
//   3. redraws only the targeted slots over the parent's art,
//   4. persists the result as a NEW cache entry — the parent is never modified.
// When the parent's art cannot be found (it was never uploaded, a static-art
// game), the caller generates normally from remixPromptFallback().

import { getGameById, saveDerivedGame, makePromptKey, THEME_LABELS } from './assetCache';
import { regenerateAssetSlots } from './assetPipeline';
import { interpretEditPrompt, resolveAssetTargets } from './gameEditor';
import { mergeRedrawnArt, mergeDesign, remixInstruction } from './editMerge';

const cancelled = () => Object.assign(new Error('generation cancelled'), { cancelled: true });

// What the parent world IS, in words, for prompts. A Quick Start parent has no
// prompt of its own; its built-in theme is the world.
export function parentWorldText(remixBase) {
  const cfg = remixBase?.config || {};
  const prompt = String(cfg.sourcePrompt || '').trim();
  if (prompt) return prompt;
  const theme = THEME_LABELS[cfg.themeKey];
  return theme ? `${theme.toLowerCase()} world` : '';
}

// Prompt for the fallback path (no parent art to edit): the parent's world plus
// the instruction, never the instruction alone.
export function remixPromptFallback(remixBase, typedText) {
  const world = parentWorldText(remixBase);
  const instruction = remixInstruction(remixBase?.config?.sourcePrompt || '', typedText);
  if (!world) return String(typedText || '').trim();
  if (!instruction) return world;
  return `${world}, ${instruction}`;
}

/**
 * @returns {Promise<null | {config, preloadedImages, assetMeta, summary}
 *   | {regenerate: true, prompt}>}
 *   null → no parent art available (caller generates from remixPromptFallback).
 */
export async function remixOverParent({ remixBase, typedText, onProgress, cancelToken }) {
  if (!remixBase?.artId) return null;
  const parentPrompt = String(remixBase.config?.sourcePrompt || '').trim();
  const instruction = remixInstruction(parentPrompt, typedText);
  onProgress?.(`[REMIX] Loading the artwork of "${remixBase.title || 'the original game'}"...`, 20);
  const parent = await getGameById(remixBase.artId);
  if (cancelToken?.cancelled) throw cancelled();
  if (!parent) {
    onProgress?.('[REMIX] The original artwork is not available here — generating from its description instead.', null);
    return null;
  }
  const worldText = parentWorldText(remixBase);
  // Lineage/ownership of the PARENT never carries over (belt and braces: the
  // remix base is already stripped in handleRemix, the cache entry on read).
  const { savedGameId: _s, rowId: _r, ownerId: _o, visibility: _v, isPublicGame: _p,
    autoSaveExempt: _e, createdInSession: _c, saveRunId: _run, assetMetaLite: _lite, ...remixCfg } = remixBase.config || {};
  const baseConfig = {
    ...(parent.config || {}),
    ...remixCfg,
    gameId: remixBase.artId,
    sourcePrompt: parentPrompt,
    dynamicAssetUrls: true,
    preloadedImages: parent.preloadedImages,
    assetMeta: parent.assetMeta
  };
  const newTitle = (changes) => changes?.gameName || `${remixBase.title || baseConfig.gameName || 'PlayMint Game'} Remix`.slice(0, 80);
  const { preloadedImages: _pi, assetMeta: _am, ...cleanBase } = baseConfig;
  // Even an unchanged copy gets its OWN art id: saved rows are looked up by
  // art_id, so a remix sharing the parent's id would UPDATE the parent's row
  // when its owner saves the remix.
  const derive = (configPatch, prompt) => saveDerivedGame({
    config: { ...cleanBase, ...configPatch },
    preloadedImages: parent.preloadedImages,
    assetMeta: parent.assetMeta,
    promptKey: null,
    sourcePrompt: prompt
  });

  // Nothing typed beyond the parent's own prompt → the same game as a new copy.
  if (!instruction) {
    onProgress?.('[REMIX] No changes requested — copying the original game.', 90);
    return {
      config: derive({ gameName: newTitle(null) }, parentPrompt),
      preloadedImages: parent.preloadedImages,
      assetMeta: parent.assetMeta,
      summary: 'Copied the original game'
    };
  }

  onProgress?.(`[REMIX] Change requested: "${instruction}"`, 30);
  const edit = await interpretEditPrompt(baseConfig, instruction);
  if (cancelToken?.cancelled) throw cancelled();
  onProgress?.(`[EDITOR] ${edit.summary || edit.intent}`, 40);

  if (edit.intent === 'regenerate') {
    return { regenerate: true, prompt: worldText ? `${worldText}, ${instruction}` : instruction };
  }
  if (edit.intent === 'tweak') {
    return {
      config: derive({ ...edit.changes, gameName: newTitle(edit.changes) }, parentPrompt),
      preloadedImages: parent.preloadedImages,
      assetMeta: parent.assetMeta,
      summary: edit.summary
    };
  }

  const slots = resolveAssetTargets(edit.assetTargets, baseConfig);
  if (!slots.length) {
    return { regenerate: true, prompt: worldText ? `${worldText}, ${instruction}` : instruction };
  }
  onProgress?.(`[REMIX] Keeping the original world — redrawing only: ${slots.join(', ')}`, 45);
  const regen = await regenerateAssetSlots({ config: baseConfig, instruction, slots, onProgress, cancelToken });
  if (cancelToken?.cancelled) throw cancelled();
  const { mergedImages, mergedSlots, redrawnSlots } = mergeRedrawnArt({
    baseImages: parent.preloadedImages,
    baseSlots: parent.assetMeta?.slots,
    newImages: regen.preloadedImages,
    newMeta: regen.meta
  });
  const assetMeta = {
    ...(parent.assetMeta || {}),
    slots: mergedSlots,
    design: mergeDesign(parent.assetMeta?.design, regen.design, redrawnSlots),
    cost: regen.cost || { estUsd: 0, imageCalls: 0, visionCalls: 0, calls: [] },
    run: {
      tier: 'remix',
      matchedGameId: remixBase.artId,
      generatedSlots: redrawnSlots,
      reusedSlots: Object.keys(mergedImages).filter((s) => !redrawnSlots.includes(s)),
      estUsd: regen.cost?.estUsd || 0
    }
  };
  const derivedPrompt = worldText ? `${worldText}, ${instruction}` : instruction;
  const config = saveDerivedGame({
    config: { ...cleanBase, ...edit.changes, gameName: newTitle(edit.changes) },
    preloadedImages: mergedImages,
    assetMeta,
    promptKey: makePromptKey(derivedPrompt, baseConfig.gameType),
    sourcePrompt: derivedPrompt
  });
  return { config, preloadedImages: mergedImages, assetMeta, summary: edit.summary };
}
