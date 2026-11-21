// Shooter ground gate: the PURE decision logic (no DOM, no network), so every rung can be tested
// in node with injected reviews. qa.js owns the vision call; pipeline.js owns the image work.
// See pipeline.js applyGroundGate for the why (a painted skyline became walkable ground).

export const GROUND_DEFECTS = ['wall', 'parapet', 'ledge', 'building', 'skyline', 'sky_clouds', 'liquid_body', 'void_hole', 'frame_border', 'vignette', 'vertical_surface', 'text_logo'];

// The model's own short material label must not read as scenery ("skyline of neon towers").
const GROUND_MATERIAL_VETO = /\b(sky|skyline|skyscrapers?|clouds?|horizon|buildings?|parapet|void|abyss|cliff|ocean|sea)\b/i;

/**
 * Pure acceptance rule for a ground review. FAIL-CLOSED: a missing/malformed review is a rejection,
 * unlike the sprite QA where null means "proceed unverified" — shipping an unverified ground is
 * exactly what let a painted skyline become walkable.
 */
export function groundVerdict(review) {
  if (!review || typeof review !== 'object') return { ok: false, reason: 'no review' };
  if (review.pureGround !== true) return { ok: false, reason: `not pure ground${review.defects?.length ? `: ${review.defects.join(', ')}` : ''}` };
  if (!Array.isArray(review.defects)) return { ok: false, reason: 'malformed review' };
  if (review.defects.length) return { ok: false, reason: `defects: ${review.defects.join(', ')}` };
  if (GROUND_MATERIAL_VETO.test(String(review.groundMaterial || ''))) return { ok: false, reason: `material reads as scenery: ${review.groundMaterial}` };
  return { ok: true, reason: null };
}

/**
 * The fail-closed ladder. Every dependency is injected:
 *   reviewPicture()      -> review | null   the generated ground picture
 *   makeFloor()          -> any | null      generate the 1:1 floor texture (one image call) or null if unavailable
 *   reviewFloor(floor)   -> review | null
 *   bakeFloor(floor)     -> result          stochastic bake of the accepted floor texture
 *   makeProcedural()     -> result          the no-image ground (must not throw)
 * Resolves { source: 'picture'|'floor-bake'|'procedural', issue, review, result }.
 * `err.cancelled` always propagates; any other error moves down one rung. The ladder never rejects
 * for a quality reason, so the REQUIRED slot is always satisfied.
 */
export async function runGroundLadder({ reviewPicture, makeFloor, reviewFloor, bakeFloor, makeProcedural }) {
  const review = await reviewPicture();
  const verdict = groundVerdict(review);
  if (verdict.ok) return { source: 'picture', issue: null, review, result: null };
  // Nothing can be verified (vision outage): a second image would be unverifiable too — skip it.
  if (!review) return { source: 'procedural', issue: verdict.reason, review, result: await makeProcedural() };
  let issue = verdict.reason;
  try {
    const floor = await makeFloor();
    if (floor) {
      const floorVerdict = groundVerdict(await reviewFloor(floor));
      if (floorVerdict.ok) return { source: 'floor-bake', issue, review, result: await bakeFloor(floor) };
      issue = `${issue}; floor texture: ${floorVerdict.reason}`;
    }
  } catch (err) {
    if (err?.cancelled) throw err;
    issue = `${issue}; floor texture failed: ${err?.message || err}`;
  }
  return { source: 'procedural', issue, review, result: await makeProcedural() };
}
