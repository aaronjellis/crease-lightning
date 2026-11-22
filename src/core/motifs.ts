/**
 * Flat cut-through decorations on the pages, placed greedily, kept a web clear of everything else,
 * shrunk toward their minimum size when crowded, and dropped (no note) when even that doesn't fit.
 * Coordinates are flat (u, y): u across the card (back page u < 0, base page u > 0), y along the
 * spine; mm.
 *
 * Bridge until free placement lands: items alternate, in order, between two bands along the pages'
 * far edges, inside the margin:
 * - `back-top-row`: the back page's top band. Icons hang from u = −W + m (the top edge when the card
 *   stands open at 90°).
 * - `base-front-row`: the base page's front band. Icons stand on u = W − m (the front edge).
 * Along the spine, each band's n items split the usable length [m, L − m] into n equal ranges, one
 * centred item each. An item with `sizeMm` is tried at that size only; pins are ignored for now.
 *
 * Orientation. Icons stand upright for someone in front of the card open at 90°: on the back page
 * (standing) and on the base page (seen from the front, looking down) alike, "up" is −u and "right"
 * is +y, the same way the letters on the steps read. So icon (x, y-up) maps to u = u₀ − y·k,
 * y = y₀ + x·k, a rotation (contours keep their orientation).
 */
import { area, bounds, grow, intersect, type Poly, type Rect } from '@kerfuffle/engine/geom';
import { MARGIN_MM, PREVIEW_TOL_MM, WEB_MM } from './constants';
import { iconById } from '../themes';
import type { DecorItem } from './decor/types';

/** Sizes are tried from the largest down, this far apart; the minimum is always tried. */
const SIZE_STEP_MM = 0.5;
const EPS = 1e-6;

interface Obstacle {
  poly: Poly;
  box: Rect;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * The zone a poly keeps others out of: grown by a web plus the chord tolerance, so the inscribed
 * chords of the grown arcs never bring the gap under WEB_MM.
 */
function keepClear(poly: Poly): Obstacle[] {
  if (!poly.length) return [];
  const grown = grow(poly, WEB_MM + PREVIEW_TOL_MM, PREVIEW_TOL_MM);
  const box = bounds(grown);
  return box ? [{ poly: grown, box }] : [];
}

/** One icon to place in a band: count 1, centred in its range along the spine. */
interface Slot {
  icon: string;
  back: boolean;
  range: [number, number];
  minMm: number;
  maxMm: number;
}

/** Items alternate between the back-top and base-front bands; each band splits [m, L − m] evenly among its items. */
function slotsOf(items: DecorItem[], L: number): Slot[] {
  const lo = MARGIN_MM;
  const span = L - 2 * MARGIN_MM;
  const counts = [Math.ceil(items.length / 2), Math.floor(items.length / 2)];
  return items.map((item, i) => {
    const band = i % 2;
    const k = Math.floor(i / 2);
    const n = counts[band];
    const size = item.sizeMm;
    return {
      icon: item.icon,
      back: band === 0,
      range: [lo + (k * span) / n, lo + ((k + 1) * span) / n],
      minMm: size ?? item.minMm,
      maxMm: size ?? item.maxMm,
    };
  });
}

/**
 * Places the decor's items, avoiding `keepOut` (strip footprints and fold lines, ungrown) by a web,
 * each other by a web, and the sheet edge by the margin. Returns one poly per placed item, in item
 * order.
 */
export function placeMotifs(items: DecorItem[], keepOut: Poly, W: number, L: number): Poly[] {
  const obstacles: Obstacle[] = keepClear(keepOut);
  const placed: Poly[] = [];
  const fits = (cand: Poly): boolean => {
    const b = bounds(cand);
    if (!b) return false;
    if (b.x < -W + MARGIN_MM - EPS || b.x + b.w > W - MARGIN_MM + EPS) return false;
    if (b.y < MARGIN_MM - EPS || b.y + b.h > L - MARGIN_MM + EPS) return false;
    return obstacles.every((o) => !overlaps(o.box, b) || area(intersect(o.poly, cand)) < EPS);
  };

  for (const slot of slotsOf(items, L)) {
    const icon = iconById(slot.icon);
    const ib = bounds(icon.poly);
    if (!ib || !(ib.h > 0)) continue;
    const { back } = slot;
    const [lo, hi] = slot.range;
    const minMm = Math.max(slot.minMm, icon.minHeightMm);
    const sizes: number[] = [];
    for (let s = slot.maxMm; s > minMm + EPS; s -= SIZE_STEP_MM) sizes.push(s);
    sizes.push(minMm);

    const yc = (lo + hi) / 2;
    for (const size of sizes) {
      const k = size / ib.h;
      // Back page: the icon's top on the margin line. Base page: its bottom on the margin line.
      const uBottom = back ? -W + MARGIN_MM + size : W - MARGIN_MM;
      const y0 = yc - (ib.w * k) / 2;
      const cand = icon.poly.map((c) => c.map((p) => ({ x: uBottom - (p.y - ib.y) * k, y: y0 + (p.x - ib.x) * k })));
      if (!fits(cand)) continue;
      placed.push(cand);
      obstacles.push(...keepClear(cand));
      break;
    }
  }
  return placed;
}
