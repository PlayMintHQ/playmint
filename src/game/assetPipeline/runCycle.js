/**
 * Run-cycle skeletons for Runner heroes (November 2026).
 *
 * The Gemini image models cannot control which arm/leg is in front in a side view, so the
 * hero's arms never alternated. PixelLab redraws our hero in a skeleton pose per frame;
 * THIS module is the pose table: a biomechanics-based run cycle (hip/knee curves from
 * sprint gait data, contralateral arm swing with a larger back-drive, stance foot pinned
 * to the ground, an airborne phase), plus an idle and a jump pose.
 *
 * Pure math, no network. Input = the 18-joint skeleton PixelLab estimated for the hero
 * (limb lengths and head offsets are taken from it, so any hero's proportions work).
 * Output = one 18-joint skeleton per frame, in the contract of animate-with-skeleton-v3:
 * [{x, y, label, z_index}] with x/y as 0-1 fractions of the 128px input frame.
 *
 * Convention: angles in degrees from straight down, positive = forward (+x, the hero
 * faces right). LEFT limbs are the NEAR side (drawn on top), RIGHT limbs the FAR side.
 */

const rad = (d) => (d * Math.PI) / 180;

// Near-leg keyframes over one stride at t = 0, .1, ... .9 (periodic).
const HIP = [30, 22, 8, -8, -18, -14, 8, 30, 40, 38]; // thigh vs vertical, + = forward
const KNEE = [15, 32, 42, 28, 22, 70, 108, 104, 68, 30]; // knee flexion (shank folds backward)

function catmullRom(vals, t) {
  const n = vals.length;
  const x = (((t % 1) + 1) % 1) * n;
  const i = Math.floor(x);
  const f = x - i;
  const p0 = vals[(i - 1 + n) % n], p1 = vals[i % n], p2 = vals[(i + 1) % n], p3 = vals[(i + 2) % n];
  return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f ** 3);
}

export const RUN_CYCLE_DEFAULTS = {
  frames: 8,
  arm: 48, // forward arm swing
  armBack: 68, // the back-drive is larger than the forward swing
  elbowFwd: 62,
  elbowBack: 88,
  lean: 10,
  bob: 0.035,
  t0: 0
};

function runPose(t, P) {
  const hn = catmullRom(HIP, t), kn = catmullRom(KNEE, t);
  const hf = catmullRom(HIP, t + 0.5), kf = catmullRom(KNEE, t + 0.5);
  const norm = (h) => (h - 11) / 29;
  const swing = (x) => (x > 0 ? P.arm * x : P.armBack * x);
  const armN = swing(-norm(hn)), armF = swing(-norm(hf));
  const elbow = (a) => (a > 0
    ? P.elbowBack + (P.elbowFwd - P.elbowBack) * (Math.max(-1, Math.min(1, a / P.arm)) + 1) / 2
    : P.elbowBack);
  const flight = Math.max(0, Math.cos(4 * Math.PI * (t - 0.45))); // both feet off the ground
  return {
    near: { thigh: hn, flex: Math.max(kn, 5), arm: armN, el: elbow(armN) },
    far: { thigh: hf, flex: Math.max(kf, 5), arm: armF, el: elbow(armF) },
    flight, lean: P.lean
  };
}

export const IDLE_POSE = {
  near: { thigh: 4, flex: 6, arm: 5, el: 22 },
  far: { thigh: -4, flex: 6, arm: -5, el: 22 },
  flight: 0, lean: 0
};
export const JUMP_POSE = {
  near: { thigh: 72, flex: 100, arm: 55, el: 45 },
  far: { thigh: 42, flex: 95, arm: -30, el: 55 },
  flight: 1.6, lean: 6
};

/**
 * @param {Array<{x:number,y:number,label:string,z_index?:number}>} kp0 estimated skeleton of the hero image
 * @returns {Array<Array>} skeleton frames: `frames` run frames, then the idle and the jump pose.
 */
export function buildRunSkeletons(kp0, opts = {}) {
  const P = { ...RUN_CYCLE_DEFAULTS, ...opts };
  const pt = {};
  const Z = {};
  for (const k of kp0) { pt[k.label] = [k.x, k.y]; Z[k.label] = Math.floor(k.z_index || 0); }
  const need = ['LEFT SHOULDER', 'RIGHT SHOULDER', 'LEFT ELBOW', 'RIGHT ELBOW', 'LEFT ARM', 'RIGHT ARM',
    'LEFT HIP', 'RIGHT HIP', 'LEFT KNEE', 'RIGHT KNEE', 'LEFT LEG', 'RIGHT LEG', 'NECK', 'NOSE'];
  if (need.some((l) => !pt[l])) throw new Error('estimated skeleton is missing joints');
  const d = (a, b) => Math.hypot(pt[a][0] - pt[b][0], pt[a][1] - pt[b][1]);
  const U = (d('LEFT SHOULDER', 'LEFT ELBOW') + d('RIGHT SHOULDER', 'RIGHT ELBOW')) / 2;
  const F = (d('LEFT ELBOW', 'LEFT ARM') + d('RIGHT ELBOW', 'RIGHT ARM')) / 2;
  const T = (d('LEFT HIP', 'LEFT KNEE') + d('RIGHT HIP', 'RIGHT KNEE')) / 2;
  const S = (d('LEFT KNEE', 'LEFT LEG') + d('RIGHT KNEE', 'RIGHT LEG')) / 2;
  if (![U, F, T, S].every((v) => v > 0.02 && v < 0.5)) throw new Error('implausible limb lengths in the estimated skeleton');
  const hipX = (pt['LEFT HIP'][0] + pt['RIGHT HIP'][0]) / 2;
  const hipY0 = (pt['LEFT HIP'][1] + pt['RIGHT HIP'][1]) / 2;
  const neck0 = pt.NECK;
  const torso = Math.hypot(neck0[0] - hipX, neck0[1] - hipY0);
  const headLabels = ['NOSE', 'LEFT EYE', 'RIGHT EYE', 'LEFT EAR', 'RIGHT EAR'].filter((l) => pt[l]);
  const headOff = Object.fromEntries(headLabels.map((l) => [l, [pt[l][0] - neck0[0], pt[l][1] - neck0[1]]]));
  const ground = 0.925, footH = 0.03, shoulderDrop = 0.02;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  const frameFor = (ps, liftScale) => {
    const ext = (leg) => T * Math.cos(rad(leg.thigh)) + S * Math.cos(rad(leg.thigh - leg.flex));
    const hipY = ground - footH - Math.max(ext(ps.near), ext(ps.far)) - P.bob * ps.flight * liftScale;
    const la = rad(ps.lean);
    const neck = [hipX + torso * Math.sin(la), hipY - torso * Math.cos(la)];
    const sh = [neck[0], neck[1] + shoulderDrop];
    const hl = rad(ps.lean * 0.4);
    const pts = { NECK: neck };
    for (const [l, [ox, oy]] of Object.entries(headOff)) {
      pts[l] = [neck[0] + ox * Math.cos(hl) - oy * Math.sin(hl), neck[1] + ox * Math.sin(hl) + oy * Math.cos(hl)];
    }
    for (const [side, limb] of [['LEFT', ps.near], ['RIGHT', ps.far]]) {
      const off = side === 'LEFT' ? 0.004 : -0.004;
      const s = [sh[0] + off, sh[1]], h = [hipX + off, hipY];
      const a = rad(limb.arm), e = [s[0] + U * Math.sin(a), s[1] + U * Math.cos(a)];
      const a2 = rad(limb.arm + limb.el), w = [e[0] + F * Math.sin(a2), e[1] + F * Math.cos(a2)];
      const th = rad(limb.thigh), kn = [h[0] + T * Math.sin(th), h[1] + T * Math.cos(th)];
      const t2 = rad(limb.thigh - limb.flex), an = [kn[0] + S * Math.sin(t2), kn[1] + S * Math.cos(t2)];
      pts[`${side} SHOULDER`] = s; pts[`${side} ELBOW`] = e; pts[`${side} ARM`] = w;
      pts[`${side} HIP`] = h; pts[`${side} KNEE`] = kn; pts[`${side} LEG`] = an;
    }
    return Object.keys(Z).map((label) => ({
      x: clamp01(pts[label][0]), y: clamp01(pts[label][1]), label, z_index: Z[label]
    }));
  };

  const out = [];
  for (let k = 0; k < P.frames; k++) out.push(frameFor(runPose(P.t0 + k / P.frames, P), 1));
  out.push(frameFor(IDLE_POSE, 1));
  out.push(frameFor(JUMP_POSE, 1));
  return out;
}

/** Sheet metadata for the frames buildRunSkeletons returns (8 run + idle + jump). */
export const RUN_SHEET_META = Object.freeze({
  cols: 10, rows: 1, runFrameCount: 8, idleFrameIndex: 8, jumpFrameIndex: 9
});
