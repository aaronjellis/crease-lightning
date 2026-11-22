/** Where strips sit along the spine. Every strip is centred on L / 2. */
import { WEB_MM } from './constants';

/** The lowest a step may be: its back hinge needs room on whatever it is cut from. */
export const MIN_H_MM = WEB_MM + 1;

export interface Span {
  y0: number;
  y1: number;
}

const centred = (mid: number, w: number): Span => ({ y0: mid - w / 2, y1: mid + w / 2 });

/** Two lines: both strips centred on L / 2; line 1's strip is wide enough for its window and for line 2's strip. */
export function placeTwoLines(L: number, window1: number, rail1: number, strip2: number): { root: Span; l2: Span } {
  const root = centred(L / 2, Math.max(window1, strip2) + 2 * rail1);
  const l2 = centred(L / 2, strip2);
  return { root, l2 };
}

/** One line: line 1 centred. */
export function placeOneLine(L: number, window1: number, rail1: number): { root: Span } {
  return { root: centred(L / 2, window1 + 2 * rail1) };
}
