// Shooter Arena enemy navigation (2026-11-05). Pure functions, no Phaser, so the
// node harness can prove reachability over hundreds of arenas.
//
// Client report: "enemies do not understand how to move around the new cover —
// they can be blocked by it". The v1 steering slid sideways for 450 ms on a fixed
// side, which cannot get round a 3-block wall or an L of two pieces. This is a
// FLOW FIELD: one breadth-first distance map from the player's cell over a coarse
// grid (cover inflated by the enemy radius), shared by every enemy. An enemy with
// a clear line to the player walks straight at it; otherwise it walks toward the
// farthest point along its descending-distance path that it can see directly
// ("string pulling"), so it rounds corners smoothly instead of zig-zagging cell
// to cell. Recomputed only when the player changes cell (~3k cells: well under a
// millisecond).

export const NAV_CELL = 32;

/**
 * @param {{width:number,height:number,rects:{x:number,y:number,width:number,height:number}[],inflate?:number,cell?:number}} opts
 */
export function buildNavGrid({ width, height, rects = [], inflate = 26, cell = NAV_CELL }) {
  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.ceil(height / cell));
  const blocked = new Uint8Array(cols * rows);
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor((r.x - inflate) / cell));
    const x1 = Math.min(cols - 1, Math.floor((r.x + r.width + inflate) / cell));
    const y0 = Math.max(0, Math.floor((r.y - inflate) / cell));
    const y1 = Math.min(rows - 1, Math.floor((r.y + r.height + inflate) / cell));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const px = (cx + 0.5) * cell, py = (cy + 0.5) * cell;
        if (px > r.x - inflate && px < r.x + r.width + inflate && py > r.y - inflate && py < r.y + r.height + inflate) {
          blocked[cy * cols + cx] = 1;
        }
      }
    }
  }
  return { cols, rows, cell, blocked, width, height };
}

export const cellOf = (grid, x, y) => {
  const cx = Math.min(grid.cols - 1, Math.max(0, Math.floor(x / grid.cell)));
  const cy = Math.min(grid.rows - 1, Math.max(0, Math.floor(y / grid.cell)));
  return cy * grid.cols + cx;
};

const NEIGHBORS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
];

/** Dijkstra distance map (in cells) from the target point. No corner cutting. */
export function computeFlowField(grid, tx, ty) {
  const { cols, rows, blocked } = grid;
  const n = cols * rows;
  // Float64: a Float32 store rounds diagonal sums below the heap key, and the
  // `d > dist[idx]` check then skipped almost every cell.
  const dist = new Float64Array(n).fill(Infinity);
  const start = cellOf(grid, tx, ty);
  dist[start] = 0;
  // Small binary heap of [dist, index].
  const heap = [[0, start]];
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, idx] = pop();
    if (d > dist[idx]) continue;
    const x = idx % cols, y = (idx / cols) | 0;
    for (const [dx, dy, cost] of NEIGHBORS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (blocked[ni]) continue;
      if (dx && dy && (blocked[y * cols + nx] || blocked[ny * cols + x])) continue;
      const nd = d + cost;
      if (nd < dist[ni]) {
        dist[ni] = nd;
        push([nd, ni]);
      }
    }
  }
  return dist;
}

/** Segment vs axis-aligned rectangles (inflated by `pad`). */
export function segmentClear(x1, y1, x2, y2, rects, pad = 0) {
  for (const r of rects) {
    const minX = r.x - pad, maxX = r.x + r.width + pad;
    const minY = r.y - pad, maxY = r.y + r.height + pad;
    // Liang–Barsky clip.
    let t0 = 0, t1 = 1;
    const dx = x2 - x1, dy = y2 - y1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - minX, maxX - x1, y1 - minY, maxY - y1];
    let hit = true;
    for (let k = 0; k < 4; k++) {
      if (p[k] === 0) {
        if (q[k] < 0) { hit = false; break; }
      } else {
        const t = q[k] / p[k];
        if (p[k] < 0) { if (t > t1) { hit = false; break; } if (t > t0) t0 = t; }
        else { if (t < t0) { hit = false; break; } if (t < t1) t1 = t; }
      }
    }
    if (hit && t0 <= t1) return false;
  }
  return true;
}

/**
 * Where an enemy at (x, y) should head next. Straight at the target when the
 * line is clear; otherwise the farthest visible point on its flow-field path.
 */
export function steerPoint(grid, dist, rects, x, y, tx, ty, { pad = 20, maxSteps = 14 } = {}) {
  if (segmentClear(x, y, tx, ty, rects, pad)) return { x: tx, y: ty, direct: true };
  const { cols, rows, cell, blocked } = grid;
  let idx = cellOf(grid, x, y);
  // An enemy pushed into an inflated cell starts from its best free neighbour.
  if (!Number.isFinite(dist[idx])) {
    let best = -1, bestD = Infinity;
    const cx = idx % cols, cy = (idx / cols) | 0;
    for (let r = 1; r <= 3 && best < 0; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const ni = ny * cols + nx;
          if (!blocked[ni] && dist[ni] < bestD) { bestD = dist[ni]; best = ni; }
        }
      }
    }
    if (best < 0) return { x: tx, y: ty, direct: true };
    idx = best;
  }
  let point = { x: ((idx % cols) + 0.5) * cell, y: (((idx / cols) | 0) + 0.5) * cell, direct: false };
  for (let step = 0; step < maxSteps; step++) {
    const cx = idx % cols, cy = (idx / cols) | 0;
    let next = -1, nd = dist[idx];
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (blocked[ni]) continue;
      if (dx && dy && (blocked[cy * cols + nx] || blocked[ny * cols + cx])) continue;
      if (dist[ni] < nd) { nd = dist[ni]; next = ni; }
    }
    if (next < 0) break;
    idx = next;
    const px = ((idx % cols) + 0.5) * cell, py = (((idx / cols) | 0) + 0.5) * cell;
    if (!segmentClear(x, y, px, py, rects, pad)) break;
    point = { x: px, y: py, direct: false };
    if (dist[idx] === 0) break;
  }
  return point;
}
