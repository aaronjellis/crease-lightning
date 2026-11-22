/** Flat panel polys as three.js shapes. Takes the three.js module as an argument, so nothing here loads it. */
import type * as T from 'three';
import type { Poly } from '@kerfuffle/engine/geom';

type Three = typeof import('three');

/** Signed area, positive for Clipper's outer contours. */
const ringArea = (r: { x: number; y: number }[]) =>
  r.reduce((s, p, i) => {
    const q = r[(i + 1) % r.length];
    return s + p.x * q.y - q.x * p.y;
  }, 0) / 2;

function inside(pt: { x: number; y: number }, ring: { x: number; y: number }[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** A Clipper poly (outers positive, holes negative) as three.js shapes, each hole in the smallest outer around it. */
export function polyShapes(THREE: Three, poly: Poly): T.Shape[] {
  const rings = poly.filter((r) => r.length >= 3).map((r) => ({ r, a: ringArea(r) }));
  const outers = rings.filter((x) => x.a > 0).sort((p, q) => p.a - q.a);
  const shapes = outers.map((o) => new THREE.Shape(o.r.map((p) => new THREE.Vector2(p.x, p.y))));
  for (const hole of rings.filter((x) => x.a < 0)) {
    const i = outers.findIndex((o) => hole.r.some((p) => inside(p, o.r)));
    if (i >= 0) shapes[i].holes.push(new THREE.Path(hole.r.map((p) => new THREE.Vector2(p.x, p.y))));
  }
  return shapes;
}
