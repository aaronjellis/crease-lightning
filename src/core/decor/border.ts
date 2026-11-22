/**
 * Where a border's tiles go: along each page's three outer edges (never the spine), each tile's
 * outer side on the margin line, upright like every icon. Corner tiles go in first (the pattern's
 * `corner` icon when it has one); each run between them is spaced evenly with a gap of at least
 * max(gapMm, WEB_MM), including at both ends. `placeDecor` drops any tile that fails `canPlace`.
 */
import { WEB_MM, MARGIN_MM } from '../constants';
import { borderById, iconById } from '../../themes';
import { iconExtent, type Spot } from './geometry';
import type { Page } from './types';

/** The side runs stop this far from the spine; the run's end gap then keeps a web from the spine fold. */
const SPINE_END_MM = 0.1;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/**
 * The tile height for a card: `sizeFrac` of the shorter page side, at least the pattern's and the
 * icon's minimum, and at most twice the pattern's minimum (or the lower bound, if that is larger: R2).
 */
export function tileSize(borderId: string, W: number, L: number): number {
  const b = borderById(borderId);
  const lower = Math.max(b.minMm, iconById(b.tile).minHeightMm);
  return clamp(b.sizeFrac * Math.min(W, L), lower, Math.max(lower, 2 * b.minMm));
}

/** Centres of `t`-long tiles spaced evenly in [a, b], at least `g` apart and from both ends. */
function run(a: number, b: number, t: number, g: number): number[] {
  const n = Math.max(0, Math.floor((b - a - g) / (t + g)));
  const gap = (b - a - n * t) / (n + 1);
  return Array.from({ length: n }, (_, i) => a + gap * (i + 1) + t * i + t / 2);
}

/** Every tile spot of the border on a card W × L, in flat coordinates: per page, corners, far edge, then sides. */
export function borderSpots(borderId: string, W: number, L: number): Spot[] {
  const b = borderById(borderId);
  const size = tileSize(borderId, W, L);
  const cornerIcon = b.corner ?? b.tile;
  const cornerSize = Math.max(size, iconById(cornerIcon).minHeightMm);
  const tile = iconExtent(b.tile, size);
  const corner = iconExtent(cornerIcon, cornerSize);
  const g = Math.max(b.gapMm, WEB_MM);
  const out: Spot[] = [];
  for (const page of ['back', 'base'] as Page[]) {
    const s = page === 'back' ? -1 : 1;
    const far = W - MARGIN_MM;
    const add = (icon: string, sizeMm: number, d: number, y: number) =>
      out.push({ id: `border:${page}:${out.length}`, icon, page, centre: { x: s * d, y }, sizeMm });
    // Corners: both outer sides on the margin lines.
    const dCorner = far - corner.h / 2;
    add(cornerIcon, cornerSize, dCorner, MARGIN_MM + corner.w / 2);
    add(cornerIcon, cornerSize, dCorner, L - MARGIN_MM - corner.w / 2);
    // The far edge, between the corners.
    for (const y of run(MARGIN_MM + corner.w, L - MARGIN_MM - corner.w, tile.w, g)) add(b.tile, size, far - tile.h / 2, y);
    // The two sides, from the corners toward the spine.
    for (const d of run(SPINE_END_MM, far - corner.h, tile.h, g)) {
      add(b.tile, size, d, MARGIN_MM + tile.w / 2);
      add(b.tile, size, d, L - MARGIN_MM - tile.w / 2);
    }
  }
  return out;
}
