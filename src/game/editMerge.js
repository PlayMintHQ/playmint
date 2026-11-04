// Merging a partial redraw (Quick Edit restyle, remix over the parent's art) onto
// the art a game already has. ONE implementation for every edit path, because the
// paths drifted apart before (2026-11-04: a dropped coin kept the OLD world's coin
// after "African city level"; a fresh-generation fix never reached restyles).
//
// Rules:
//  - A slot that was redrawn successfully replaces the old art.
//  - A slot whose redraw was DROPPED (failed its quality gates) normally keeps the
//    old art — a failed night-time sky keeps the day sky rather than a hole.
//  - EXCEPT where the old art would contradict the edit:
//      · collectible: an old-world coin in a new world reads as a broken asset, so
//        the built-in coin (static coin.svg, the scene's fallback) is used instead;
//      · background_mid / background_near when the far background was redrawn in
//        the same edit: old-world silhouettes in front of a new sky. The scene
//        simply renders fewer parallax layers.
//  - A slot reported as succeeded without an image is an invariant violation —
//    never registered (a texture key with no backing image).

const WORLD_LAYERS = ['background_mid', 'background_near'];

export function mergeRedrawnArt({ baseImages, baseSlots, newImages, newMeta }) {
  const mergedImages = { ...(baseImages || {}) };
  const mergedSlots = { ...(baseSlots || {}) };
  const redrawnSlots = [];
  const keptOld = [];
  const removedOld = [];
  const farRedrawn = !!(newMeta?.background_far && !newMeta.background_far.dropped && newImages?.background_far);

  for (const [slot, m] of Object.entries(newMeta || {})) {
    if (m?.dropped) {
      const contradicts = slot === 'collectible' || (farRedrawn && WORLD_LAYERS.includes(slot));
      if (contradicts) {
        if (mergedImages[slot]) removedOld.push(slot);
        delete mergedImages[slot];
        mergedSlots[slot] = { ...m, source: 'generated' };
        continue;
      }
      if (mergedImages[slot]) { keptOld.push(slot); continue; }
      mergedSlots[slot] = m;
      continue;
    }
    const img = newImages?.[slot];
    if (!img) {
      mergedSlots[slot] = { ...m, dropped: true, reason: 'missing image after redraw (internal)', source: 'generated' };
      continue;
    }
    mergedImages[slot] = img;
    mergedSlots[slot] = { ...m, source: 'generated' };
    redrawnSlots.push(slot);
  }
  return { mergedImages, mergedSlots, redrawnSlots, keptOld, removedOld };
}

// The edit instruction a remix applies. The remix screen pre-fills the parent's
// prompt; a user who APPENDS to it ("ice quest add dragon enemies") means the
// appended part, a user who replaces it means the whole text.
export function remixInstruction(parentPrompt, typed) {
  const text = String(typed || '').trim();
  const base = String(parentPrompt || '').trim();
  if (!base) return text;
  if (text.toLowerCase() === base.toLowerCase()) return '';
  if (text.toLowerCase().startsWith(base.toLowerCase())) {
    return text.slice(base.length).replace(/^[\s,.;:+-]+/, '').trim();
  }
  return text;
}

// The stored art direction after an edit: redrawn slots take the edit's subject
// text, everything else keeps the original. A whole-look restyle replaces the
// style guide too (that IS the new look); a targeted one keeps it.
export function mergeDesign(prior, next, redrawnSlots = []) {
  if (!next?.subjects) return prior || null;
  const subjectKey = (slot) => (slot === 'player_sheet' ? 'player' : slot);
  const touched = new Set(redrawnSlots.map(subjectKey));
  const world = ['background_far', 'floor'].some((s) => touched.has(s));
  const cast = ['player', 'enemy'].some((s) => touched.has(s));
  if (!prior?.subjects || (world && cast)) {
    return { source: next.source, styleGuide: next.styleGuide, subjects: next.subjects, entities: next.entities || {} };
  }
  const subjects = { ...prior.subjects };
  for (const slot of touched) {
    if (next.subjects[slot]) subjects[slot] = next.subjects[slot];
  }
  return {
    source: prior.source,
    styleGuide: world ? { ...prior.styleGuide, colorPalette: next.styleGuide?.colorPalette || prior.styleGuide?.colorPalette } : prior.styleGuide,
    subjects,
    entities: { ...(prior.entities || {}), ...(next.entities || {}) }
  };
}
