import type { Poly } from '@kerfuffle/engine/geom';
import type { ThemeId } from '../core/model';

export type SlotId =
  | 'back-top-left'
  | 'back-top-right'
  | 'back-top-row'
  | 'base-front-left'
  | 'base-front-right'
  | 'base-front-row';

/** A cut-through icon. `poly` is one mm tall with its bottom on y = 0 and its left on x = 0; y points up. */
export interface Icon {
  id: string;
  poly: Poly;
  /** The smallest height, in mm, at which the icon still cuts cleanly. */
  minHeightMm: number;
  source: string;
  licence: string;
}

export interface Motif {
  icon: string;
  slot: SlotId;
  minMm: number;
  maxMm: number;
  count: number;
}

export interface Theme {
  id: ThemeId;
  name: string;
  lines: [string, string];
  font: string;
  colours: { inner: string; jacket: string };
  motifs: Motif[];
}
