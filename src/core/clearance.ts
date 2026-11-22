/**
 * Exact clearance between shapes, by distance: no polygon offsets.
 *
 * Two shapes are clear by `d` when every pair of their edges is at least `d` apart (crossing edges
 * are 0 apart) and neither lies inside the other. With no edge within `d`, each contour lies wholly
 * inside or outside the other shape, so one vertex per contour settles containment.
 *
 * clipper2-js offsets (`grow`) can run for minutes on some icon polys at some sizes, which froze a
 * drag and hung builds; this test is plain arithmetic, O(edges × edges) after box checks.
 */
import type { Poly, Pt, Rect } from '@kerfuffle/engine/geom';

export interface Shape {
  /** Edges as x1, y1, x2, y2 runs. */
  segs: Float64Array;
  /** The bounding box, or null for an empty shape. */
  box: Rect | null;
  /** The contours, when the shape encloses area (holes by winding, non-zero rule). */
  contours: Pt[][] | null;
  /** One vertex per contour or path: what the containment test checks. */
  firsts: Pt[];
}

function shapeFrom(paths: Pt[][], closed: boolean): Shape {
  let n = 0;
  for (const c of paths) n += closed ? (c.length > 1 ? c.length : 0) : Math.max(0, c.length - 1);
  const segs = new Float64Array(n * 4);
  let k = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of paths) {
    for (const p of c) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    const m = closed ? (c.length > 1 ? c.length : 0) : c.length - 1;
    for (let i = 0; i < m; i++) {
      const a = c[i];
      const b = c[(i + 1) % c.length];
      segs[k++] = a.x;
      segs[k++] = a.y;
      segs[k++] = b.x;
      segs[k++] = b.y;
    }
  }
  const box = x0 <= x1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  const kept = paths.filter((c) => c.length > (closed ? 2 : 1));
  return { segs, box, contours: closed ? kept : null, firsts: kept.map((c) => c[0]) };
}

const shapes = new WeakMap<Poly, Shape>();

/** A closed poly's shape, cached per poly object (layouts are immutable). */
export function shapeOf(poly: Poly): Shape {
  let s = shapes.get(poly);
  if (!s) {
    s = shapeFrom(poly, true);
    shapes.set(poly, s);
  }
  return s;
}

/** An open path's shape: its edges only, enclosing nothing. */
export const pathShape = (path: Pt[]): Shape => shapeFrom([path], false);

/** Squared distance from (px, py) to the segment (ax, ay)–(bx, by). */
function pointSeg2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}

/** Squared distance between two segments: 0 when they cross. */
function segSeg2(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  const o1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const o2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const o3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const o4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return 0;
  // Not crossing: the nearest pair has an endpoint in it (touching and collinear cases give 0 here).
  return Math.min(
    pointSeg2(ax, ay, cx, cy, dx, dy),
    pointSeg2(bx, by, cx, cy, dx, dy),
    pointSeg2(cx, cy, ax, ay, bx, by),
    pointSeg2(dx, dy, ax, ay, bx, by)
  );
}

/** Whether `p` is inside the contours under the non-zero rule. */
function inside(p: Pt, contours: Pt[][]): boolean {
  let wn = 0;
  for (const c of contours) {
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
      const a = c[j];
      const b = c[i];
      const cross = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
      if (a.y <= p.y) {
        if (b.y > p.y && cross > 0) wn++;
      } else if (b.y <= p.y && cross < 0) wn--;
    }
  }
  return wn !== 0;
}

const near = (a: Rect, b: Rect, d: number): boolean =>
  a.x - d < b.x + b.w && b.x - d < a.x + a.w && a.y - d < b.y + b.h && b.y - d < a.y + a.h;

/** The least distance between the two shapes' edges is under `d`. Edge boxes first. */
function edgesWithin(a: Shape, b: Shape, d: number): boolean {
  const d2 = d * d;
  const A = a.segs;
  const B = b.segs;
  const bb = b.box!;
  for (let i = 0; i < A.length; i += 4) {
    const ax = A[i], ay = A[i + 1], bx = A[i + 2], by = A[i + 3];
    const lx = Math.min(ax, bx) - d;
    const hx = Math.max(ax, bx) + d;
    const ly = Math.min(ay, by) - d;
    const hy = Math.max(ay, by) + d;
    if (hx < bb.x || lx > bb.x + bb.w || hy < bb.y || ly > bb.y + bb.h) continue;
    for (let j = 0; j < B.length; j += 4) {
      const cx = B[j], cy = B[j + 1], dx = B[j + 2], dy = B[j + 3];
      if ((cx < lx && dx < lx) || (cx > hx && dx > hx) || (cy < ly && dy < ly) || (cy > hy && dy > hy)) continue;
      if (segSeg2(ax, ay, bx, by, cx, cy, dx, dy) < d2) return true;
    }
  }
  return false;
}

/**
 * Whether `a` and `b` are at least `d` apart (`d` > 0): no edge of one within `d` of an edge of the
 * other, and neither inside the other. Empty shapes are clear of everything.
 */
export function clear(a: Shape, b: Shape, d: number): boolean {
  if (!a.box || !b.box || !near(a.box, b.box, d)) return true;
  if (edgesWithin(a, b, d)) return false;
  // No edge within d, so each contour is wholly in or out of the other shape: test one vertex each.
  const within = (s: Shape, region: Shape) => !!region.contours && s.firsts.some((p) => inside(p, region.contours!));
  return !within(a, b) && !within(b, a);
}
