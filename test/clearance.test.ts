/** Exact clearance by distance: edges, crossings, containment (with holes), and open paths. */
import { describe, expect, test } from 'vitest';
import type { Poly } from '@kerfuffle/engine/geom';
import { clear, pathShape, shapeOf } from '../src/core/clearance';

/** A counter-clockwise square, or a clockwise one (a hole) when `hole` is set. */
const sq = (x: number, y: number, s: number, hole = false) => {
  const c = [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];
  return hole ? c.reverse() : c;
};

describe('clear', () => {
  const a = shapeOf([sq(0, 0, 10)]);

  test('side by side: clear at the gap, not past it', () => {
    const b = shapeOf([sq(13, 0, 10)]);
    expect(clear(a, b, 3)).toBe(true);
    expect(clear(a, b, 3.01)).toBe(false);
    expect(clear(b, a, 3.01)).toBe(false);
  });

  test('corner to corner is measured exactly, not along the box', () => {
    // Boxes 2 apart on each axis: the corners are 2√2 ≈ 2.83 apart.
    const b = shapeOf([sq(12, 12, 10)]);
    expect(clear(a, b, 2.8)).toBe(true);
    expect(clear(a, b, 2.9)).toBe(false);
  });

  test('crossing edges are 0 apart, though every vertex is far from the other shape', () => {
    const bar: Poly = [[{ x: -20, y: 4 }, { x: 30, y: 4 }, { x: 30, y: 6 }, { x: -20, y: 6 }]];
    expect(clear(a, shapeOf(bar), 0.1)).toBe(false);
  });

  test('one inside the other is never clear, either way round', () => {
    const small = shapeOf([sq(4, 4, 2)]);
    expect(clear(a, small, 1)).toBe(false);
    expect(clear(small, a, 1)).toBe(false);
  });

  test("a shape in another's hole is clear when the hole leaves the gap", () => {
    const ring = shapeOf([sq(0, 0, 30), sq(5, 5, 20, true)]);
    expect(clear(ring, shapeOf([sq(12, 12, 6)]), 3)).toBe(true);
    expect(clear(ring, shapeOf([sq(6, 12, 6)]), 3)).toBe(false);
  });

  test('a multi-piece shape: one piece inside the other shape is enough to fail', () => {
    const pieces = shapeOf([sq(100, 100, 2), sq(4, 4, 2)]);
    expect(clear(a, pieces, 1)).toBe(false);
  });

  test('open paths: measured to the segment, and inside a closed shape fails', () => {
    expect(clear(a, pathShape([{ x: 0, y: 13 }, { x: 10, y: 13 }]), 3)).toBe(true);
    expect(clear(a, pathShape([{ x: 0, y: 12 }, { x: 10, y: 12 }]), 3)).toBe(false);
    expect(clear(pathShape([{ x: 2, y: 5 }, { x: 8, y: 5 }]), a, 1)).toBe(false);
    expect(clear(pathShape([{ x: 0, y: 0 }, { x: 5, y: 0 }]), pathShape([{ x: 0, y: 1 }, { x: 5, y: 1 }]), 1.5)).toBe(false);
  });

  test('empty shapes are clear of everything', () => {
    expect(clear(a, shapeOf([]), 100)).toBe(true);
    expect(clear(shapeOf([]), a, 100)).toBe(true);
  });
});
