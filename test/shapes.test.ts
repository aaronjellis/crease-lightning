import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { area } from '@kerfuffle/engine/geom';
import { polyShapes } from '../src/view3d/shapes';
import { build } from '../src/core/build';
import { defaultParams } from '../src/core/model';
import { testFonts } from './helpers/fonts';

/** Area covered by a ShapeGeometry's triangles. */
function triangulatedArea(shapes: THREE.Shape[]): number {
  const g = new THREE.ShapeGeometry(shapes, 1);
  const pos = g.attributes.position;
  const idx = g.index!;
  let total = 0;
  for (let i = 0; i < idx.count; i += 3) {
    const [a, b, c] = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
    total += Math.abs((pos.getX(b) - pos.getX(a)) * (pos.getY(c) - pos.getY(a)) - (pos.getX(c) - pos.getX(a)) * (pos.getY(b) - pos.getY(a))) / 2;
  }
  g.dispose();
  return total;
}

describe('polyShapes', () => {
  test('every Birthday panel triangulates to its own flat area (holes in the right outers, no spikes)', () => {
    const card = build(defaultParams('en-US'), { fonts: testFonts() }, 'blade', { strokeCheck: false });
    for (const panel of card.panels) {
      if (panel.poly.length === 0) continue;
      const want = area(panel.poly);
      expect(triangulatedArea(polyShapes(THREE, panel.poly)), panel.id).toBeCloseTo(want, 1);
    }
  });

  test('a hole goes in the outer around it, not an island beside it', () => {
    const sq = (x0: number, y0: number, s: number, cw = false) => {
      const r = [{ x: x0, y: y0 }, { x: x0 + s, y: y0 }, { x: x0 + s, y: y0 + s }, { x: x0, y: y0 + s }];
      return cw ? r.reverse() : r;
    };
    // A small island first, then a big square with a hole that does not contain the island.
    const shapes = polyShapes(THREE, [sq(100, 0, 5), sq(0, 0, 50), sq(10, 10, 10, true)]);
    expect(shapes).toHaveLength(2);
    expect(shapes.map((s) => s.holes.length).sort()).toEqual([0, 1]);
    expect(triangulatedArea(shapes)).toBeCloseTo(25 + 2500 - 100, 6);
  });
});
