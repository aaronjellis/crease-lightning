/**
 * The decoration engine. In order: border tiles, pinned items (in `items` order), then unpinned and
 * displaced pinned items (in `items` order). Every candidate goes through `canPlace`, the one fit
 * test, which the drag check uses too.
 *
 * Rules (from the spec): every cut keeps a web (`WEB_MM`) from the keep-out (strip footprints and
 * folds), from every border tile and from every other item, and stays inside the margin on its own
 * page. A pinned item that no longer fits takes, for this build only, the fitting candidate of its
 * own scatter list nearest its pin, marked `displaced`; its pin stays in the params.
 */
import type { Poly, Pt, Rect } from '@kerfuffle/engine/geom';
import { clear, shapeOf, type Shape } from '../clearance';
import { MARGIN_MM, PREVIEW_TOL_MM, WEB_MM } from '../constants';
import { borderSpots } from './border';
import { atLeastMin, fromPin, iconExtent, iconPoly, type Spot } from './geometry';
import { candidates, pinnedSize } from './scatter';
import type { Decor, Page } from './types';

export interface PlacedItem {
  id: string;
  icon: string;
  page: Page;
  centre: Pt;
  sizeMm: number;
  poly: Poly;
  pinned: boolean;
  displaced: boolean;
}

export interface DecorLayout {
  keepOut: Poly;
  border: Poly[];
  items: PlacedItem[];
  missing: string[];
}

const EPS = 1e-6;
/**
 * How far every cut keeps others away: a web plus the chord tolerance the grown-zone test this
 * replaced allowed for, so placements keep the margin they had.
 */
const CLEAR_MM = WEB_MM + PREVIEW_TOL_MM;

/** Whether two boxes come within CLEAR_MM of each other: if not, their shapes are clear. */
const nearBox = (a: Rect, b: Rect) =>
  a.x - CLEAR_MM < b.x + b.w && b.x - CLEAR_MM < a.x + a.w && a.y - CLEAR_MM < b.y + b.h && b.y - CLEAR_MM < a.y + a.h;

/**
 * Whether `cand` fits on the layout: inside the margin on its own page, and `CLEAR_MM` clear of the
 * keep-out, every border tile and every other item (an item with `cand.id` is ignored, so an item
 * can be tested against the rest). Boxes first; the exact distance test (`clear`) only on box hits.
 * No polygon offsets: clipper2's offset can stall for minutes on some icon sizes.
 */
export function canPlace(layout: DecorLayout, cand: Spot, W: number, L: number): boolean {
  const size = atLeastMin(cand.icon, cand.sizeMm);
  const { h, w } = iconExtent(cand.icon, size);
  const box = { x: cand.centre.x - h / 2, y: cand.centre.y - w / 2, w: h, h: w };
  const lo = cand.page === 'back' ? -W + MARGIN_MM : 0;
  const hi = cand.page === 'back' ? 0 : W - MARGIN_MM;
  if (box.x < lo - EPS || box.x + box.w > hi + EPS) return false;
  if (box.y < MARGIN_MM - EPS || box.y + box.h > L - MARGIN_MM + EPS) return false;

  let shape: Shape | null = null;
  const hits = (other: Poly): boolean => {
    const o = shapeOf(other);
    if (!o.box || !nearBox(o.box, box)) return false;
    shape ??= shapeOf(iconPoly(cand.icon, cand.page, cand.centre, size));
    return !clear(shape, o, CLEAR_MM);
  };
  if (hits(layout.keepOut)) return false;
  for (const tile of layout.border) if (hits(tile)) return false;
  for (const it of layout.items) if (it.id !== cand.id && hits(it.poly)) return false;
  return true;
}

const placed = (s: Spot, pinned: boolean, displaced: boolean): PlacedItem => ({
  id: s.id,
  icon: s.icon,
  page: s.page,
  centre: s.centre,
  sizeMm: s.sizeMm,
  poly: iconPoly(s.icon, s.page, s.centre, s.sizeMm),
  pinned,
  displaced,
});

/** Places the decor on a card W × L around `keepOut` (strip footprints and folds, ungrown). */
export function placeDecor(decor: Decor, keepOut: Poly, W: number, L: number): DecorLayout {
  const layout: DecorLayout = { keepOut, border: [], items: [], missing: [] };

  if (decor.border !== null) {
    for (const s of borderSpots(decor.border, W, L)) {
      if (canPlace(layout, s, W, L)) layout.border.push(iconPoly(s.icon, s.page, s.centre, s.sizeMm));
    }
  }

  const atPin = new Set<string>();
  for (const item of decor.items) {
    if (!item.at) continue;
    const s: Spot = { id: item.id, icon: item.icon, page: item.at.page, centre: fromPin(item.at, W, L), sizeMm: pinnedSize(item) };
    if (!canPlace(layout, s, W, L)) continue;
    layout.items.push(placed(s, true, false));
    atPin.add(item.id);
  }

  for (const item of decor.items) {
    if (atPin.has(item.id)) continue;
    let spot: Spot | null = null;
    if (item.at) {
      // Displaced: the fitting candidate nearest the pin (ties go to the earlier one).
      const pin = fromPin(item.at, W, L);
      let best = Infinity;
      for (const s of candidates(item, decor.seed, W, L)) {
        const d = Math.hypot(s.centre.x - pin.x, s.centre.y - pin.y);
        if (d < best && canPlace(layout, s, W, L)) [spot, best] = [s, d];
      }
    } else {
      for (const s of candidates(item, decor.seed, W, L)) {
        if (canPlace(layout, s, W, L)) {
          spot = s;
          break;
        }
      }
    }
    if (spot) layout.items.push(placed(spot, !!item.at, !!item.at));
    else layout.missing.push(item.id);
  }

  // Draw order is the items' order.
  const order = new Map(decor.items.map((it, i) => [it.id, i]));
  layout.items.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  return layout;
}
