import { describe, expect, test } from 'vitest';
import { closedReach, foldU, frameAB, poseAB, spineU } from '../src/core/linkage';
import { CLEARANCE_MM, WEB_MM } from '../src/core/constants';
import type { PanelFrame, StepSpec } from '../src/core/types';

const root: StepSpec = { id: 'l1', role: 'line1', parentId: null, y0: 10, y1: 160, d: 30, h: 45, s: 25 };
const child: StepSpec = { id: 'l2', role: 'line2', parentId: 'l1', y0: 50, y1: 120, d: 25, h: 12, s: 20 };
const steps = [root, child];

type Seg = [{ x: number; z: number }, { x: number; z: number }];

/** The six rigid segments of a two-step linkage, as [a, b] endpoint pairs in the oblique frame. */
function panels(s1: StepSpec, s2: StepSpec, all: StepSpec[]): Record<string, [[number, number], [number, number]]> {
  const ab = (frame: PanelFrame, u: number): [number, number] => {
    const { a, b } = frameAB(frame, u);
    return [a, b];
  };
  const step = (s: StepSpec, n: string) => {
    const f = foldU(s, all);
    const tread: PanelFrame = { kind: 'tread', h: s.h };
    const riser: PanelFrame = { kind: 'riser', uA: f.A };
    return {
      [`tread${n}`]: [ab(tread, f.B), ab(tread, f.P)],
      [`riser${n}`]: [ab(tread, f.P), ab(riser, f.A)],
      // Letters hang off the mountain fold along the riser, s long.
      [`letters${n}`]: [ab(riser, f.P), ab(riser, f.P - s.s)],
    } as Record<string, [[number, number], [number, number]]>;
  };
  return { ...step(s1, '1'), ...step(s2, '2') };
}

const dist = (p: { x: number; z: number }, q: { x: number; z: number }) => Math.hypot(p.x - q.x, p.z - q.z);

function properCross(p1: Seg[0], p2: Seg[0], q1: Seg[0], q2: Seg[0]): boolean {
  const o = (a: Seg[0], b: Seg[0], c: Seg[0]) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const d1 = o(q1, q2, p1);
  const d2 = o(q1, q2, p2);
  const d3 = o(p1, p2, q1);
  const d4 = o(p1, p2, q2);
  // Each orientation must clear rounding noise on its own, so segments that only touch
  // (a tread starting on a riser) do not count as crossing.
  const eps = 1e-7;
  const opposite = (x: number, y: number) => (x > eps && y < -eps) || (x < -eps && y > eps);
  return opposite(d1, d2) && opposite(d3, d4);
}

/** Returns a description of the first rigidity or crossing violation across all angles, or null. */
function checkLinkage(s1: StepSpec, s2: StepSpec): string | null {
  const segs = panels(s1, s2, [s1, s2]);
  const names = Object.keys(segs);
  const flat = new Map(names.map((k) => [k, dist(poseAB(...segs[k][0], 180), poseAB(...segs[k][1], 180))]));
  for (let half = 1; half < 360; half++) {
    const th = half / 2;
    const pts = new Map<string, Seg>(names.map((k) => [k, [poseAB(...segs[k][0], th), poseAB(...segs[k][1], th)]]));
    for (const k of names) {
      const [p, q] = pts.get(k)!;
      if (Math.abs(dist(p, q) - flat.get(k)!) > 1e-9) return `${k} length drifts at ${th} deg`;
    }
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const [p1, p2] = pts.get(names[i])!;
        const [q1, q2] = pts.get(names[j])!;
        if (properCross(p1, p2, q1, q2)) return `${names[i]} crosses ${names[j]} at ${th} deg`;
      }
    }
  }
  return null;
}

/** Mulberry32, so the random sweep is reproducible. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('linkage math', () => {
  test('spineU is 0 for a root and the parent A for a child', () => {
    expect(spineU(root, steps)).toBe(0);
    expect(spineU(child, steps)).toBe(30);
  });

  test('fold positions match the spec tables', () => {
    expect(foldU(root, steps)).toEqual({ B: -45, P: -15, A: 30 });
    expect(foldU(child, steps)).toEqual({ B: 18, P: 43, A: 55 });
  });

  test('closed reach is height plus depth', () => {
    expect(closedReach(root, steps)).toBe(100);
    expect(closedReach(child, steps)).toBe(87);
  });

  test('flat pose (180°) puts every frame back on its flat u', () => {
    const frames: PanelFrame[] = [{ kind: 'base' }, { kind: 'back' }, { kind: 'tread', h: 45 }, { kind: 'riser', uA: 30 }];
    for (const f of frames) {
      for (const u of [-40, -15, 0, 12, 30]) {
        const { a, b } = frameAB(f, u);
        expect(poseAB(a, b, 180).x).toBeCloseTo(u, 9);
        expect(poseAB(a, b, 180).z).toBeCloseTo(0, 9);
      }
    }
  });

  test('default two-line card is rigid and never self-crosses, 0.5° to 179.5°', () => {
    expect(checkLinkage(root, child)).toBeNull();
  });

  test('500 seeded-random valid parameter sets stay rigid and never self-cross', () => {
    const rand = rng(20261121);
    const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
    for (let n = 0; n < 500; n++) {
      const d = between(15, 45);
      const h = between(20, 60);
      const s = between(5, d - CLEARANCE_MM - WEB_MM);
      const d2 = between(15, 40);
      const h2 = between(5, h - 5);
      const s2 = between(5, d2 - CLEARANCE_MM - WEB_MM);
      const a: StepSpec = { id: 'l1', role: 'line1', parentId: null, y0: 0, y1: 100, d, h, s };
      const b: StepSpec = { id: 'l2', role: 'line2', parentId: 'l1', y0: 0, y1: 100, d: d2, h: h2, s: s2 };
      expect(checkLinkage(a, b), JSON.stringify({ d, h, s, d2, h2, s2 })).toBeNull();
    }
  });

  test('closed (0°) puts every point at x = a + b, z = 0', () => {
    for (const [a, b] of [[45, 0], [45, 30], [70, 30], [12, 55]]) {
      expect(poseAB(a, b, 0)).toEqual({ x: a + b, z: 0 });
    }
  });
});
