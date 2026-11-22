import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { panelNormal, poseMatrix, posePoint, viewCamera, VIEW_DIRS } from '../src/view3d/pose';
import { build } from '../src/core/build';
import { defaultParams, cardDims } from '../src/core/model';
import type { PanelFrame } from '../src/core/types';
import { testFonts } from './helpers/fonts';

const FRAMES: PanelFrame[] = [
  { kind: 'base' },
  { kind: 'back' },
  { kind: 'tread', h: 35 },
  { kind: 'riser', uA: 40 },
];
const ANGLES = [0, 15, 45, 90, 120, 165, 180];
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);
const len = (v: number[]) => Math.hypot(...v);
const sub = (a: number[], b: number[]) => a.map((x, i) => x - b[i]);

describe('posePoint', () => {
  test('flat at 180°: (u, 0, -y) for every frame', () => {
    for (const f of FRAMES) {
      for (const [u, y] of [[-30, 10], [5, 0], [20, 170]]) {
        const [x, h, z] = posePoint(f, u, y, 180);
        near(x, u);
        near(h, 0);
        near(z, -y);
      }
    }
  });

  test('at 90° the riser stands at x = uA and runs along the spine', () => {
    const riser: PanelFrame = { kind: 'riser', uA: 40 };
    for (const [u, y] of [[5, 12], [20, 80], [40, 150]]) {
      const [x, h, z] = posePoint(riser, u, y, 90);
      near(x, 40);
      near(h, 40 - u);
      near(z, -y);
    }
  });

  test('the tread is horizontal at height h (and at h·sinθ on the way)', () => {
    const tread: PanelFrame = { kind: 'tread', h: 35 };
    for (const u of [-35, -10, 5]) near(posePoint(tread, u, 50, 90)[1], 35);
    for (const th of ANGLES) {
      const hs = [-35, -10, 5].map((u) => posePoint(tread, u, 50, th)[1]);
      for (const h of hs) near(h, 35 * Math.sin((th * Math.PI) / 180));
    }
  });

  test('closed at 0°: every point lies in the page plane', () => {
    for (const f of FRAMES) for (const u of [-60, -5, 0, 7, 60]) near(posePoint(f, u, 33, 0)[1], 0);
  });

  test('the back page stands up at 90°', () => {
    const [x, h] = posePoint({ kind: 'back' }, -50, 0, 90);
    near(x, 0);
    near(h, 50);
  });
});

describe('panelNormal', () => {
  test('is a unit vector, up when flat, and perpendicular to the panel', () => {
    for (const f of FRAMES) {
      for (const th of ANGLES) {
        const n = panelNormal(f, th);
        near(len(n), 1);
        const du = sub(posePoint(f, 10, 0, th), posePoint(f, 0, 0, th));
        const dy = sub(posePoint(f, 0, 10, th), posePoint(f, 0, 0, th));
        near(n[0] * du[0] + n[1] * du[1] + n[2] * du[2], 0);
        near(n[0] * dy[0] + n[1] * dy[1] + n[2] * dy[2], 0);
      }
      const flat = panelNormal(f, 180);
      near(flat[0], 0);
      near(flat[1], 1);
      near(flat[2], 0);
    }
  });

  test('at 90° the back page and riser face the viewer (+x), the tread faces up', () => {
    for (const f of [FRAMES[1], FRAMES[3]]) expect(panelNormal(f, 90)[0]).toBeCloseTo(1, 9);
    expect(panelNormal(FRAMES[2], 90)[1]).toBeCloseTo(1, 9);
  });
});

describe('poseMatrix', () => {
  test('maps flat (u, y, 0) to posePoint and (0, 0, w) along the normal', () => {
    for (const f of FRAMES) {
      for (const th of ANGLES) {
        const m = new THREE.Matrix4().fromArray(poseMatrix(f, th));
        expect(m.determinant()).toBeCloseTo(1, 9);
        const p = new THREE.Vector3(-12, 44, 0).applyMatrix4(m);
        const q = posePoint(f, -12, 44, th);
        near(p.x, q[0]);
        near(p.y, q[1]);
        near(p.z, q[2]);
        const w = new THREE.Vector3(-12, 44, 0.3).applyMatrix4(m).sub(p);
        const n = panelNormal(f, th);
        for (let i = 0; i < 3; i++) near(w.getComponent(i), 0.3 * n[i]);
      }
    }
  });
});

describe('the Birthday card posed', () => {
  const card = build(defaultParams('en-US'), { fonts: testFonts() }, 'blade', { strokeCheck: false });
  const { W, L } = cardDims(card.params);

  test('distances between two vertices of one panel stay constant over θ', () => {
    for (const panel of card.panels) {
      const pts = panel.poly.flat();
      if (pts.length < 2) continue;
      const a = pts[0];
      const b = pts[Math.floor(pts.length / 2)];
      const c = pts[pts.length - 1];
      const flat = (p: typeof a, q: typeof a) => Math.hypot(p.x - q.x, p.y - q.y);
      for (const th of ANGLES) {
        const pa = posePoint(panel.frame, a.x, a.y, th);
        const pb = posePoint(panel.frame, b.x, b.y, th);
        const pc = posePoint(panel.frame, c.x, c.y, th);
        expect(len(sub(pa, pb)), `${panel.id} at ${th}°`).toBeCloseTo(flat(a, b), 9);
        expect(len(sub(pb, pc)), `${panel.id} at ${th}°`).toBeCloseTo(flat(b, c), 9);
      }
    }
  });

  test('from the front, flat +y reads to the viewer’s right (letters are not mirrored)', () => {
    const letters = card.panels.filter((p) => p.id.endsWith(':letters') && p.poly.length > 0);
    expect(letters.length).toBeGreaterThan(0);
    for (const view of Object.keys(VIEW_DIRS) as (keyof typeof VIEW_DIRS)[]) {
      const cam = viewCamera(W, L, view, 35, 1);
      const camera = new THREE.PerspectiveCamera(35, 1, 1, 10000);
      camera.position.set(...cam.position);
      camera.lookAt(...cam.target);
      camera.updateMatrixWorld();
      const screenX = (p: [number, number, number]) => new THREE.Vector3(...p).project(camera).x;
      // Along the spine on the base page, and across the letters on each riser.
      expect(screenX(posePoint({ kind: 'base' }, W / 2, L * 0.8, 90))).toBeGreaterThan(screenX(posePoint({ kind: 'base' }, W / 2, L * 0.2, 90)));
      for (const panel of letters) {
        const ys = panel.poly.flat().map((q) => q.y);
        const u = panel.poly[0][0].x;
        const lo = posePoint(panel.frame, u, Math.min(...ys), 90);
        const hi = posePoint(panel.frame, u, Math.max(...ys), 90);
        expect(screenX(hi), `${panel.id} in ${view}`).toBeGreaterThan(screenX(lo));
      }
      // And up is up: the standing back page's top is above its foot on screen.
      const yOf = (p: [number, number, number]) => new THREE.Vector3(...p).project(camera).y;
      expect(yOf(posePoint({ kind: 'back' }, -W, L / 2, 90))).toBeGreaterThan(yOf(posePoint({ kind: 'back' }, 0, L / 2, 90)));
    }
  });
});
