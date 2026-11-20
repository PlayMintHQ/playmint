/**
 * Post-processing for a PixelLab run cycle (see providers/pixellabAnimation.js, runCycle.js).
 * Pure canvas + one injected vision review, so it can be exercised without any Gemini call:
 * the pipeline passes the real `reviewSprite`, a test passes `async () => null`.
 */
import {
  removeStrayFragments, cleanKeyedEdges, lockPalette, composeFilmstrip,
  contentBoundsOf, finalizeSheetFrames
} from './postprocess';
import { RUN_SHEET_META } from './runCycle';

/**
 * @param {HTMLCanvasElement[]} rawCells 8 run frames, idle, jump (PixelLab output, transparent)
 * @returns {Promise<{sheet, review, mirrored, issue}>} `issue` is set (and `sheet` null) when the
 *   frames must be rejected — the caller retries once or falls back to the Gemini ladder.
 */
export async function finishPixellabSheet(rawCells, { baseCanvas = null, spec, review = async () => null } = {}) {
  let cells = rawCells.map((cell) => {
    removeStrayFragments(cell);
    // Bleed only: PixelLab frames already carry their own dark outline, so no extra ring.
    return cleanKeyedEdges(cell, { erode: 0, outline: false });
  });
  // Every frame must hold a real figure (a skeleton can occasionally make the model drop the sprite).
  const tooSmall = cells.filter((cell) => {
    const b = contentBoundsOf(cell);
    return !b || (b.maxY - b.minY + 1) < cell.height * 0.3;
  }).length;
  if (tooSmall) return { sheet: null, issue: `${tooSmall} empty frame(s)` };
  // Keep the hero's own Gemini palette (PixelLab shifts colours slightly between frames).
  if (baseCanvas) cells = lockPalette(cells, baseCanvas);
  const strip = composeFilmstrip(cells);
  const verdict = await review(strip.toDataURL('image/png'), {
    kind: 'strip', label: 'qa:player_sheet',
    grid: { frameCount: cells.length, runFrameCount: RUN_SHEET_META.runFrameCount }
  });
  if (verdict && verdict.sameCharacter === false) return { sheet: null, issue: 'looks like different characters' };
  const mirrored = !!(verdict && verdict.facingRight === false);
  const sheet = await finalizeSheetFrames(cells, spec, { mirror: mirrored, framesMeta: { ...RUN_SHEET_META } });
  if (!sheet) return { sheet: null, issue: 'no content after alignment' };
  return { sheet, review: verdict, mirrored, issue: null };
}
