/**
 * Decoration geometry in flat coordinates (u, y), mm: u across the card (back page u ∈ [−W, 0], base
 * page u ∈ [0, W]), y along the spine.
 *
 * Orientation. Icons stand upright for someone in front of the card open at 90°: on the back page
 * (standing) and on the base page (seen from the front, looking down) alike, "up" is −u and "right"
 * is +y, the same way the letters on the steps read. So icon (x, y-up) maps to u = u₀ − y·k,
 * y = y₀ + x·k, a rotation (contours keep their orientation).
 *
 * A page's usable rectangle runs from the spine to the margin across the card and from margin to
 * margin along it. A pin stores a centre as fractions of it: `u` = distance from the spine ÷ (W − m),
 * `v` = (y − m) ÷ (L − 2m).
 */
import { bounds, type Poly, type Pt, type Rect } from '@kerfuffle/engine/geom';
import { MARGIN_MM } from '../constants';
import { iconById } from '../../themes';
import type { Page } from './types';

/** An icon at a spot: what `canPlace` tests and placement turns into a cut. */
export interface Spot {
  id: string;
  icon: string;
  page: Page;
  centre: Pt;
  sizeMm: number;
}

const unitBoxes = new Map<string, Rect>();

/** The icon's 1 mm box, read once. */
function unitBox(iconId: string): Rect {
  let b = unitBoxes.get(iconId);
  if (!b) {
    b = bounds(iconById(iconId).poly)!;
    unitBoxes.set(iconId, b);
  }
  return b;
}

/** The icon's extent at `sizeMm`: `h` across the card (along u), `w` along the spine. */
export function iconExtent(iconId: string, sizeMm: number): { h: number; w: number } {
  const b = unitBox(iconId);
  return { h: sizeMm, w: (b.w / b.h) * sizeMm };
}

/** The smallest size the icon is ever placed at: its minimum cuttable height. */
export const atLeastMin = (iconId: string, sizeMm: number): number => Math.max(sizeMm, iconById(iconId).minHeightMm);

/**
 * The icon `sizeMm` tall (along u), upright, with its box centred on `centre`. Every caller passes a
 * size of at least the icon's minimum (R12). Nothing offsets the result: clipper2-js can stall on an
 * icon at sizes above its minimum too, so fit and checks measure distances (`clearance.ts`).
 */
export function iconPoly(iconId: string, _page: Page, centre: Pt, sizeMm: number): Poly {
  const ib = unitBox(iconId);
  const k = sizeMm / ib.h;
  const uBottom = centre.x + sizeMm / 2;
  const y0 = centre.y - (ib.w * k) / 2;
  return iconById(iconId).poly.map((c) => c.map((p) => ({ x: uBottom - (p.y - ib.y) * k, y: y0 + (p.x - ib.x) * k })));
}

/** The page's usable rectangle in flat coordinates. */
export function pageRect(page: Page, W: number, L: number): Rect {
  return { x: page === 'back' ? -(W - MARGIN_MM) : 0, y: MARGIN_MM, w: W - MARGIN_MM, h: L - 2 * MARGIN_MM };
}

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/** A centre as a pin: fractions of the page's usable rectangle, clamped to [0, 1]. */
export function toPin(page: Page, centre: Pt, W: number, L: number): { page: Page; u: number; v: number } {
  return {
    page,
    u: clamp01(Math.abs(centre.x) / (W - MARGIN_MM)),
    v: clamp01((centre.y - MARGIN_MM) / (L - 2 * MARGIN_MM)),
  };
}

/** A pin's centre in flat coordinates. */
export function fromPin(at: { page: Page; u: number; v: number }, W: number, L: number): Pt {
  const d = at.u * (W - MARGIN_MM);
  // `0 - d`, not `-d`: a pin on the spine is u = 0, never −0.
  return { x: at.page === 'back' ? 0 - d : d, y: MARGIN_MM + at.v * (L - 2 * MARGIN_MM) };
}
