/**
 * Pose math for the 3D view: where each flat panel point sits at opening angle θ, in three.js
 * coordinates (mm, x across the card, y up, z along the spine). Plain TS returning tuples, so tests
 * run in node and nothing here loads three.js.
 *
 * The cross-section comes from the oblique frame (`frameAB`, `poseAB`): x = a·cos θ + b, height =
 * a·sin θ. Flat y runs along the spine as world z = −y. The sign is a handedness choice: viewed from
 * the front (base page toward you, back page standing), +z points to your left in three.js's
 * right-handed frame, so z = −y puts flat +y on your right and the letters read the right way round.
 */
import { frameAB, poseAB } from '../core/linkage';
import type { PanelFrame } from '../core/types';

export type Vec3 = [number, number, number];

/** World z per unit of flat y. */
const SPINE_Z = -1;

/** Flat point (u, y) on a panel with this frame, at opening angle thetaDeg (0 closed, 180 flat). */
export function posePoint(frame: PanelFrame, u: number, y: number, thetaDeg: number): Vec3 {
  const { a, b } = frameAB(frame, u);
  const { x, z } = poseAB(a, b, thetaDeg);
  return [x, z, SPINE_Z * y];
}

/** The panel's inner-face normal (up when flat, toward the viewer for a standing riser). Unit length. */
export function panelNormal(frame: PanelFrame, thetaDeg: number): Vec3 {
  const p0 = posePoint(frame, 0, 0, thetaDeg);
  const p1 = posePoint(frame, 1, 0, thetaDeg);
  // d/du is a unit vector in the cross-section; d/dy is (0, 0, SPINE_Z). n = d/du × d/dy.
  const ux = p1[0] - p0[0];
  const uy = p1[1] - p0[1];
  return [uy * SPINE_Z, -ux * SPINE_Z, 0];
}

/**
 * The rigid transform that carries a panel built flat in local (u, y, w) — w along the inner-face
 * normal — to its pose at thetaDeg. Column-major, ready for `Matrix4.fromArray`.
 */
export function poseMatrix(frame: PanelFrame, thetaDeg: number): number[] {
  const t = posePoint(frame, 0, 0, thetaDeg);
  const p1 = posePoint(frame, 1, 0, thetaDeg);
  const n = panelNormal(frame, thetaDeg);
  return [
    p1[0] - t[0], p1[1] - t[1], p1[2] - t[2], 0,
    0, 0, SPINE_Z, 0,
    n[0], n[1], n[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

/** Camera directions (from the target toward the camera) for the two stock views. */
export const VIEW_DIRS: Record<'three-quarter' | 'front', Vec3> = {
  'three-quarter': [1, 0.62, 0.55],
  front: [1, 0.32, 0],
};

export type ViewName = keyof typeof VIEW_DIRS;

/**
 * A camera that frames the card (closed W × L) posed at thetaDeg, aimed at the middle of the pages'
 * bounding box. Every step stays inside the triangle the two pages make (that is what closing flat
 * means), so the pages' box is the card's box.
 */
export function viewCamera(
  W: number,
  L: number,
  view: ViewName,
  fovDeg: number,
  aspect: number,
  thetaDeg = 90
): { position: Vec3; target: Vec3; radius: number } {
  const [ex, ey] = posePoint({ kind: 'back' }, -W, 0, thetaDeg);
  const x0 = Math.min(0, ex);
  const y1 = Math.max(0, ey);
  const target: Vec3 = [(x0 + W) / 2, y1 / 2, (SPINE_Z * L) / 2];
  const radius = Math.hypot(W - x0, y1, L) / 2;
  const vfov = (fovDeg * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const dist = (1.1 * radius) / Math.tan(Math.min(vfov, hfov) / 2);
  const d = VIEW_DIRS[view];
  const k = dist / Math.hypot(...d);
  return { position: [target[0] + d[0] * k, target[1] + d[1] * k, target[2] + d[2] * k], target, radius };
}
