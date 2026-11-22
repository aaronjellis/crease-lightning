import type { PanelFrame, StepSpec } from './types';

/** Flat-sheet position of the step's spine: 0 for a root, the parent's A for a child. */
export function spineU(step: StepSpec, steps: StepSpec[]): number {
  if (step.parentId === null) return 0;
  const parent = steps.find((s) => s.id === step.parentId);
  if (!parent) throw new Error(`Step ${step.id} has unknown parent ${step.parentId}`);
  return foldU(parent, steps).A;
}

/** Flat positions of the three folds: B (back hinge), P (mountain), A (base hinge). */
export function foldU(step: StepSpec, steps: StepSpec[]): { B: number; P: number; A: number } {
  const sigma = spineU(step, steps);
  return { B: sigma - step.h, P: sigma + step.d - step.h, A: sigma + step.d };
}

/**
 * Oblique-frame coordinates (a along the back page, b along the base page)
 * of the flat-sheet point at u on a panel.
 */
export function frameAB(frame: PanelFrame, u: number): { a: number; b: number } {
  switch (frame.kind) {
    case 'base':
      return { a: 0, b: u };
    case 'back':
      return { a: -u, b: 0 };
    case 'tread':
      return { a: frame.h, b: u + frame.h };
    case 'riser':
      return { a: frame.uA - u, b: frame.uA };
  }
}

/** Cross-section position at opening angle thetaDeg (0 closed, 180 flat). */
export function poseAB(a: number, b: number, thetaDeg: number): { x: number; z: number } {
  const t = (thetaDeg * Math.PI) / 180;
  return { x: a * Math.cos(t) + b, z: a * Math.sin(t) };
}

/** How far the closed step reaches from the spine. */
export function closedReach(step: StepSpec, steps: StepSpec[]): number {
  return spineU(step, steps) + step.d + step.h + step.s;
}
