import type { Pt } from '@kerfuffle/engine/geom';
import { PERF_BRIDGE_MM, PERF_CUT_MM } from '../core/constants';

/**
 * Turns a fold path into short cut segments separated by bridges, as real geometry (never
 * `stroke-dasharray`). Half a bridge is left at each end, so the fold never ends in a cut that
 * runs into its neighbour. The dash length stretches slightly so the pattern fits the path exactly:
 * n dashes and n bridges (n - 1 between, half at each end) fill the length. A path too short to
 * hold one dash and one bridge is returned whole.
 */
export function perforate(path: Pt[], cutMm = PERF_CUT_MM, bridgeMm = PERF_BRIDGE_MM): Pt[][] {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    seg.push(l);
    total += l;
  }
  const n = Math.max(1, Math.round(total / (cutMm + bridgeMm)));
  const dash = (total - n * bridgeMm) / n;
  if (path.length < 2 || dash <= 0) return [path];

  const at = (s: number, i: number): Pt => {
    // The point at arclength s, which lies on segment i (0-based) or at its end.
    const start = seg.slice(0, i).reduce((a, b) => a + b, 0);
    const t = seg[i] === 0 ? 0 : (s - start) / seg[i];
    return { x: path[i].x + (path[i + 1].x - path[i].x) * t, y: path[i].y + (path[i + 1].y - path[i].y) * t };
  };
  const starts = [0];
  for (const l of seg) starts.push(starts[starts.length - 1] + l);

  const out: Pt[][] = [];
  for (let k = 0; k < n; k++) {
    const s0 = bridgeMm / 2 + k * (dash + bridgeMm);
    const s1 = s0 + dash;
    const segAt = (s: number) => {
      let i = 0;
      while (i < seg.length - 1 && s > starts[i + 1]) i++;
      return i;
    };
    const i0 = segAt(s0);
    const i1 = segAt(s1);
    const pts = [at(s0, i0)];
    for (let v = i0 + 1; v <= i1; v++) if (starts[v] > s0 && starts[v] < s1) pts.push(path[v]);
    pts.push(at(s1, i1));
    out.push(pts);
  }
  return out;
}
