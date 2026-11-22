import type { Poly } from '@kerfuffle/engine/geom';
import type { ThemeId } from '../core/model';

/** A cut-through icon. `poly` is one mm tall with its bottom on y = 0 and its left on x = 0; y points up. */
export interface Icon {
  id: string;
  /** The human name the picker shows, such as "Graduation cap". */
  name: string;
  poly: Poly;
  /** The smallest height, in mm, at which the icon still cuts cleanly. */
  minHeightMm: number;
  /** The size range, in mm, an icon added from the picker starts with. The low end is at least `minHeightMm`. */
  defaultMm: [number, number];
  source: string;
  licence: string;
}

/** A theme's ready-made set of decorations: data, no code. */
export interface Style {
  id: string;
  name: string;
  /** A border pattern id, or null for none. */
  border: string | null;
  items: { icon: string; count: number; minMm: number; maxMm: number }[];
}

export interface Theme {
  id: ThemeId;
  name: string;
  lines: [string, string];
  font: string;
  colours: { inner: string; jacket: string };
  /** Two or three styles; the first is the default. Blank has none. */
  styles: Style[];
}
