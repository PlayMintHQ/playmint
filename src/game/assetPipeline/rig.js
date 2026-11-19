/**
 * Rigged run cycle (2026-11-19).
 *
 * Problem: the image model draws the whole 10-frame strip in one call and copies the
 * reference sprite's arms, so the arms (and often the legs) never swap sides. The
 * industry answer for limbs that must swap is a skeletal rig: separate near/far limb
 * layers moved by a pose table (Spine / DragonBones), generated as a parts sheet.
 *
 * Here Gemini draws the hero ONCE as six separate parts (head, torso, upper arm,
 * forearm, thigh, shin). This module cuts them, then poses them on canvases — near
 * and far limbs use the same art, the far ones darkened — and bakes the result into
 * ordinary cells. The output is the existing sprite-sheet contract (a 1×N strip with
 * runFrameCount / idleFrameIndex / jumpFrameIndex), so the scene, cache, alignment
 * and share links need no changes.
 *
 * Pure canvas, no network. Angles are in degrees; "forward" = toward the facing
 * direction (right).
 */
import { removeStrayFragments, cropCanvasToContent } from './postprocess';

export const RIG_PART_NAMES = ['head', 'torso', 'upperArm', 'foreArm', 'thigh', 'shin'];
const RUN_FRAMES = 8;
const CELL = 128;
const HERO_HEIGHT = 104; // standing height inside the 128px cell
const FAR_SHADE = 0.78;

const rad = (d) => (d * Math.PI) / 180;

/* ------------------------------------------------------------------ cutting */

// Column runs of opaque content, merged until `want` segments remain.
function columnSegments(canvas, want) {
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const col = new Uint8Array(w);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (d[(y * w + x) * 4 + 3] >= 16) { col[x] = 1; break; }
    }
  }
  const segs = [];
  let start = -1;
  for (let x = 0; x <= w; x++) {
    if (x < w && col[x]) { if (start < 0) start = x; }
    else if (start >= 0) { segs.push({ x0: start, x1: x - 1 }); start = -1; }
  }
  // Drop specks, then merge the closest neighbours (a part split by a thin column gap).
  let list = segs.filter((s) => s.x1 - s.x0 + 1 >= Math.max(6, w * 0.012));
  while (list.length > want) {
    let best = 0, bestGap = Infinity;
    for (let i = 0; i < list.length - 1; i++) {
      const gap = list[i + 1].x0 - list[i].x1;
      if (gap < bestGap) { bestGap = gap; best = i; }
    }
    list.splice(best, 2, { x0: list[best].x0, x1: list[best + 1].x1 });
  }
  return list;
}

/**
 * Cut a KEYED parts image into the six parts. Returns { parts, issue }: parts is
 * { head, torso, upperArm, foreArm, thigh, shin } canvases cropped to content, or
 * null with a human-readable `issue` (the caller falls back to the full-sheet path).
 */
export function extractRigParts(keyedCanvas) {
  const segs = columnSegments(keyedCanvas, RIG_PART_NAMES.length);
  if (segs.length !== RIG_PART_NAMES.length) {
    return { parts: null, issue: `found ${segs.length} separate pieces, expected ${RIG_PART_NAMES.length}` };
  }
  const parts = {};
  for (let i = 0; i < segs.length; i++) {
    const { x0, x1 } = segs[i];
    const seg = document.createElement('canvas');
    seg.width = x1 - x0 + 1;
    seg.height = keyedCanvas.height;
    seg.getContext('2d').drawImage(keyedCanvas, x0, 0, seg.width, seg.height, 0, 0, seg.width, seg.height);
    removeStrayFragments(seg, { gap: 10, maxFrac: 0.2 });
    const cropped = cropCanvasToContent(seg);
    if (cropped.width < 4 || cropped.height < 4) return { parts: null, issue: `piece ${RIG_PART_NAMES[i]} is empty` };
    parts[RIG_PART_NAMES[i]] = cropped;
  }
  // Plausibility: limbs are taller than wide, the torso is the biggest piece.
  for (const k of ['upperArm', 'foreArm', 'thigh', 'shin']) {
    const p = parts[k];
    if (p.height < p.width * 1.15) return { parts: null, issue: `${k} is not a hanging limb (${p.width}x${p.height})` };
  }
  const area = (p) => p.width * p.height;
  if (area(parts.torso) < area(parts.head) * 0.8) return { parts: null, issue: 'torso is smaller than the head' };
  return { parts, issue: null };
}

/* ------------------------------------------------------------------ drawing */

function scaleCanvas(src, s) {
  let cur = src;
  let w = src.width, h = src.height;
  const tw = Math.max(1, Math.round(w * s)), th = Math.max(1, Math.round(h * s));
  while (w / 2 >= tw * 1.5 && h / 2 >= th * 1.5) {
    const half = document.createElement('canvas');
    half.width = Math.round(w / 2); half.height = Math.round(h / 2);
    const c = half.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(cur, 0, 0, half.width, half.height);
    cur = half; w = half.width; h = half.height;
  }
  const out = document.createElement('canvas');
  out.width = tw; out.height = th;
  const c = out.getContext('2d');
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(cur, 0, 0, tw, th);
  return out;
}

function shaded(canvas, f) {
  const out = document.createElement('canvas');
  out.width = canvas.width; out.height = canvas.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) { d[i] *= f; d[i + 1] *= f; d[i + 2] *= f; }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Scale the parts so the assembled standing figure is HERO_HEIGHT tall. */
export function buildRig(parts) {
  const standing = parts.head.height * 0.9 + parts.torso.height * 0.95 + parts.thigh.height * 0.92 + parts.shin.height;
  const s = HERO_HEIGHT / standing;
  const sc = {};
  for (const k of RIG_PART_NAMES) sc[k] = scaleCanvas(parts[k], s);
  const far = {
    upperArm: shaded(sc.upperArm, FAR_SHADE), foreArm: shaded(sc.foreArm, FAR_SHADE),
    thigh: shaded(sc.thigh, FAR_SHADE), shin: shaded(sc.shin, FAR_SHADE)
  };
  return { near: sc, far, scale: s };
}

// Draw a part with its pivot (top-centre, slightly inside the part) at the origin.
const PIVOT_IN = 0.08;
function drawHanging(ctx, part) {
  ctx.drawImage(part, -part.width / 2, -part.height * PIVOT_IN);
}
const hangLen = (part) => part.height * (1 - PIVOT_IN * 1.4);

function drawLeg(ctx, thigh, shin, thighDeg, flexDeg) {
  ctx.save();
  ctx.rotate(-rad(thighDeg));
  drawHanging(ctx, thigh);
  ctx.translate(0, hangLen(thigh));
  ctx.rotate(rad(flexDeg));
  drawHanging(ctx, shin);
  ctx.restore();
}
function drawArm(ctx, upper, fore, armDeg, elbowDeg) {
  ctx.save();
  ctx.rotate(-rad(armDeg));
  drawHanging(ctx, upper);
  ctx.translate(0, hangLen(upper));
  ctx.rotate(-rad(elbowDeg));
  drawHanging(ctx, fore);
  ctx.restore();
}

/** One baked cell. pose = { nearThigh, nearFlex, farThigh, farFlex, nearArm, nearElbow, farArm, farElbow, lean, dy } */
export function drawRigPose(rig, pose) {
  const { near, far } = rig;
  const cell = document.createElement('canvas');
  cell.width = CELL; cell.height = CELL;
  const ctx = cell.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';

  const legLen = hangLen(near.thigh) + hangLen(near.shin);
  const hipX = CELL / 2;
  const hipY = CELL - 10 - legLen + (pose.dy || 0);
  const torsoH = near.torso.height * 0.95;
  const shoulder = { x: 0, y: -torsoH * 0.82 };

  // back → front: far arm, far leg, torso, head, near leg, near arm
  const inTorso = (fn) => { ctx.save(); ctx.translate(hipX, hipY); ctx.rotate(rad(pose.lean || 0)); fn(); ctx.restore(); };
  inTorso(() => { ctx.translate(shoulder.x, shoulder.y); drawArm(ctx, far.upperArm, far.foreArm, pose.farArm, pose.farElbow); });
  ctx.save(); ctx.translate(hipX, hipY); drawLeg(ctx, far.thigh, far.shin, pose.farThigh, pose.farFlex); ctx.restore();
  inTorso(() => {
    ctx.drawImage(near.torso, -near.torso.width / 2, -torsoH);
    ctx.drawImage(near.head, -near.head.width / 2, -torsoH - near.head.height * 0.9 + near.torso.height * 0.02);
  });
  ctx.save(); ctx.translate(hipX, hipY); drawLeg(ctx, near.thigh, near.shin, pose.nearThigh, pose.nearFlex); ctx.restore();
  inTorso(() => { ctx.translate(shoulder.x, shoulder.y); drawArm(ctx, near.upperArm, near.foreArm, pose.nearArm, pose.nearElbow); });
  return cell;
}

/* -------------------------------------------------------------- pose table */

const pos = (x) => Math.max(0, x);

/** Phase k of the 8-pose run cycle. k=0 is the near-leg contact; arms oppose legs. */
export function runPose(k) {
  const phi = Math.PI / 2 + (k * Math.PI) / 4;
  const sin = Math.sin(phi), cos = Math.cos(phi);
  // Arms swing wider than before (±62°) and the elbow OPENS when the arm drives back
  // (a bent forearm pointing forward in every frame read as "arms never move").
  const nearArm = -62 * sin;
  const farArm = 62 * sin;
  const elbow = (a) => 38 + 62 * pos(a / 62);
  return {
    nearThigh: 6 + 42 * sin,
    nearFlex: 12 + 78 * Math.pow(pos(cos), 1.3),
    farThigh: 6 - 42 * sin,
    farFlex: 12 + 78 * Math.pow(pos(-cos), 1.3),
    nearArm,
    nearElbow: elbow(nearArm),
    farArm,
    farElbow: elbow(farArm),
    lean: 9,
    dy: 3 * (1 + Math.cos(2 * phi - Math.PI)) / 2
  };
}
export const IDLE_RIG_POSE = {
  nearThigh: 3, nearFlex: 5, farThigh: -3, farFlex: 5,
  nearArm: 4, nearElbow: 16, farArm: -4, farElbow: 16, lean: 0, dy: 0
};
export const JUMP_RIG_POSE = {
  nearThigh: 70, nearFlex: 95, farThigh: 48, farFlex: 95,
  nearArm: -30, nearElbow: 40, farArm: 55, farElbow: 50, lean: 6, dy: -4
};

/**
 * Bake the full strip: 8 run cells, an idle cell, a jump cell, with the sheet
 * metadata the scene reads. `arms`/`legs` sides are exposed for the swap check.
 */
export function composeRigFrames(parts) {
  const rig = buildRig(parts);
  const poses = [];
  for (let k = 0; k < RUN_FRAMES; k++) poses.push(runPose(k));
  poses.push(IDLE_RIG_POSE, JUMP_RIG_POSE);
  const cells = poses.map((p) => drawRigPose(rig, p));
  return {
    cells,
    poses,
    framesMeta: { cols: cells.length, rows: 1, runFrameCount: RUN_FRAMES, idleFrameIndex: RUN_FRAMES, jumpFrameIndex: RUN_FRAMES + 1 }
  };
}

/**
 * $0 gate: the near arm must swing to opposite sides in the first and second half of
 * the cycle, and each leg must lead in one half and trail in the other. True by
 * construction of the pose table; this guards against a future table edit.
 */
export function rigSwapsLimbs(poses) {
  const run = poses.slice(0, RUN_FRAMES);
  const arms = run.map((p) => p.nearArm), legs = run.map((p) => p.nearThigh - 6);
  const sign = (a) => a.filter((v) => v > 5).length > 0 && a.filter((v) => v < -5).length > 0;
  const opposed = run.every((p) => Math.abs(p.nearArm + p.farArm) < 1 && Math.abs((p.nearThigh - 6) + (p.farThigh - 6)) < 1);
  return sign(arms) && sign(legs) && opposed;
}
