export type FoldKind = 'mountain' | 'valley';

/** One pop-up step: a tread (depth d) rising to height h, with letters s tall on the riser. */
export interface StepSpec {
  id: string;
  role: 'line1' | 'line2';
  parentId: string | null;
  y0: number;
  y1: number;
  d: number;
  h: number;
  s: number;
}

export type PanelFrame =
  | { kind: 'base' }
  | { kind: 'back' }
  | { kind: 'tread'; h: number }
  | { kind: 'riser'; uA: number };
