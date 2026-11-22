/**
 * Flat cut-through motifs on the pages: theme icons placed greedily into the theme's slots, kept a web
 * clear of everything else, shrunk toward their minimum size when crowded, and dropped (no note) when
 * even that doesn't fit. Coordinates are flat (u, y): u across the card (back page u < 0, base page
 * u > 0), y along the spine; mm.
 *
 * Slots. Each page has one band along its far edge, inside the margin:
 * - `back-top-*`: the back page's top band. Icons hang from u = −W + m (the top edge when the card
 *   stands open at 90°).
 * - `base-front-*`: the base page's front band. Icons stand on u = W − m (the front edge).
 * Along the spine, the usable length [m, L − m] splits in thirds: `left` is the first third (small y),
 * `right` the last, `row` the whole length. A slot's `count` icons sit at evenly spaced centres
 * across its range.
 *
 * Orientation. Icons stand upright for someone in front of the card open at 90°: on the back page
 * (standing) and on the base page (seen from the front, looking down) alike, "up" is −u and "right"
 * is +y, the same way the letters on the steps read. So icon (x, y-up) maps to u = u₀ − y·k,
 * y = y₀ + x·k, a rotation (contours keep their orientation).
 */
import { area, bounds, grow, intersect, type Poly, type Rect } from '@kerfuffle/engine/geom';
import { MARGIN_MM, PREVIEW_TOL_MM, WEB_MM } from './constants';
import { iconById, type Theme } from '../themes';
import type { SlotId } from '../themes/types';

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

/** The slot's range along the spine. */
function slotRange(slot: SlotId, L: number): [number, number] {
  const lo = MARGIN_MM;
  const hi = L - MARGIN_MM;
  const third = (hi - lo) / 3;
  if (slot.endsWith('-left')) return [lo, lo + third];
  if (slot.endsWith('-right')) return [hi - third, hi];
  return [lo, hi];
}

/**
 * Places the theme's motifs, avoiding `keepOut` (strip footprints and fold lines, ungrown) by a web,
 * each other by a web, and the sheet edge by the margin. Returns one poly per placed icon, in theme
 * order.
 */
export function placeMotifs(theme: Theme, keepOut: Poly, W: number, L: number): Poly[] {
  const obstacles: Obstacle[] = keepClear(keepOut);
  const placed: Poly[] = [];
  const fits = (cand: Poly): boolean => {
    const b = bounds(cand);
    if (!b) return false;
    if (b.x < -W + MARGIN_MM - EPS || b.x + b.w > W - MARGIN_MM + EPS) return false;
    if (b.y < MARGIN_MM - EPS || b.y + b.h > L - MARGIN_MM + EPS) return false;
    return obstacles.every((o) => !overlaps(o.box, b) || area(intersect(o.poly, cand)) < EPS);
  };

  for (const motif of theme.motifs) {
    const icon = iconById(motif.icon);
    const ib = bounds(icon.poly);
    if (!ib || !(ib.h > 0) || motif.count <= 0) continue;
    const back = motif.slot.startsWith('back-');
    const [lo, hi] = slotRange(motif.slot, L);
    const minMm = Math.max(motif.minMm, icon.minHeightMm);
    const sizes: number[] = [];
    for (let s = motif.maxMm; s > minMm + EPS; s -= SIZE_STEP_MM) sizes.push(s);
    sizes.push(minMm);

    for (let i = 0; i < motif.count; i++) {
      const yc = lo + ((i + 0.5) * (hi - lo)) / motif.count;
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
  }
  return placed;
}
