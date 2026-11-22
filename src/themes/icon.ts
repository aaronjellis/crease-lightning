import { area, bounds, difference, dropHoles, grow, intersect, offset, union, type Poly, type Rect } from '@kerfuffle/engine/geom';
import { BRIDGE_MM, MIN_STROKE_BLADE_MM, PREVIEW_TOL_MM } from '../core/constants';
import { components, shortestBar } from '../core/text';
import { parseSvgShape } from '../svg/svgShape';
import type { Icon } from './types';

/** Bridges are drawn a little wider than BRIDGE_MM, so chord error and rounding never take them under it. */
const BAR_MM = BRIDGE_MM + 0.2;
/** The paper frame round the icon while it is bridged, in mm. */
const FRAME_MM = 2;
/**
 * Where a bar crosses a curved or slanted edge it leaves a wedge of cut too thin for the blade.
 * Near each bar, cut thinner than this (an opening a little over half the blade's minimum stroke)
 * goes back to paper, which rounds the bridge's feet.
 */
const SLIVER_R_MM = MIN_STROKE_BLADE_MM / 2 + 0.05;
/** How far round each bar the slivers are looked for, in mm. */
const SLIVER_BOX_MM = 2;
/**
 * A sliver is a small wedge at a bar's foot. Anything larger is a stroke of the icon that is simply
 * too thin at this size, which the stroke check must report rather than trimming hide.
 */
const SLIVER_MAX_MM2 = 1;
const SLIVER_MAX_LEN_MM = 2.5;
/** Bridging repeats until every island hangs on the sheet; an island may first join another island. */
const MAX_PASSES = 12;

/** What `loadIcon` needs beside the SVG: the icon's fields, and whether to fill its details. */
export type IconMeta = Omit<Icon, 'poly'> & {
  /** Fill every paper detail inside the icon instead of bridging it, for icons where a bridge looks wrong. */
  fill?: boolean;
};

/** A rectangle `f` clear of `b` all round. */
const frameRound = (b: Rect, f: number): Poly => [[
  { x: b.x - f, y: b.y - f },
  { x: b.x + b.w + f, y: b.y - f },
  { x: b.x + b.w + f, y: b.y + b.h + f },
  { x: b.x - f, y: b.y + b.h + f },
]];

/**
 * Returns to paper the cut wedges each bar leaves thinner than the blade can cut: within a box round
 * the bar, the small pieces of cut that an opening at SLIVER_R_MM removes and that touch the bar.
 * Working on the small local piece keeps the offsets quick.
 */
function trimSlivers(cut: Poly, bars: Poly[], frame: Poly): Poly {
  let out = cut;
  const piecesOf = (c: Poly) => components(difference(frame, c)).length;
  let pieces = piecesOf(out);
  for (const bar of bars) {
    const local = intersect(out, frameRound(bounds(bar)!, SLIVER_BOX_MM));
    const opened = grow(offset(local, -SLIVER_R_MM, PREVIEW_TOL_MM), SLIVER_R_MM, PREVIEW_TOL_MM);
    const near = grow(bar, 0.1, PREVIEW_TOL_MM);
    const slivers = components(difference(local, opened)).filter((c) => {
      const b = bounds(c)!;
      return area(c) < SLIVER_MAX_MM2 && Math.max(b.w, b.h) < SLIVER_MAX_LEN_MM && area(intersect(c, near)) > 1e-6;
    });
    if (!slivers.length) continue;
    // The slivers go with the bar's 0.1 mm surround, so a sliver the opening left a hairline off the
    // bar still joins the bridge rather than floating as a new island.
    const trimmed = difference(out, union([near, ...slivers]));
    // A trim that would leave a new paper island is skipped: the island would fall out.
    const n = piecesOf(trimmed);
    if (n <= pieces) [out, pieces] = [trimmed, n];
  }
  return out;
}

/**
 * Joins every paper island inside `cut` (mm, a hole in the sheet) to the paper round it: each
 * island gets the shortest straight bar `BAR_MM` wide, up, down, left, or right, to the nearest
 * other paper, and the bars come out of the cut. Repeats until the paper is one piece.
 */
function bridgeIslands(cut: Poly, frame: Poly, id: string): Poly {
  let out = cut;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const pieces = components(difference(frame, out));
    if (pieces.length <= 1) return out;
    // The sheet is the piece with the largest outline: the frame, which encloses everything else.
    const sheet = pieces.reduce((m, p) => (area([p[0]]) > area([m[0]]) ? p : m));
    const bars: Poly[] = [];
    for (const island of pieces.filter((p) => p !== sheet)) {
      const bar = shortestBar(island, pieces.filter((p) => p !== island).flat(), BAR_MM);
      if (bar) bars.push(bar);
    }
    if (!bars.length) break;
    out = trimSlivers(difference(out, union(bars)), bars, frame);
  }
  throw new Error(`Icon "${id}" has a paper island that no bridge reaches.`);
}

/**
 * Reads an SVG's filled shapes into an {@link Icon}: the non-zero union of every shape, flipped so
 * y points up, scaled to 1 mm tall, with its bottom on y = 0 and its left on x = 0.
 *
 * The icon is cut as a hole, so paper details inside it (a gift's ribbon, a cake's frosting line)
 * would fall out. Each is bridged to the paper round it with a bridge `BRIDGE_MM` wide at the
 * icon's `minHeightMm`, or filled when the meta says `fill`. The bars are plain polygon booleans;
 * only the sliver trim offsets, and only the small piece round each bar.
 */
export function loadIcon(svgText: string, meta: IconMeta): Icon {
  const { fill, ...fields } = meta;
  // The first read only finds the viewBox, so a coarse tolerance keeps it cheap.
  const shape = parseSvgShape(svgText, 1);
  // The tolerance is in viewBox units; a thousandth of the width keeps curves smooth.
  const parsed = shape ? parseSvgShape(svgText, shape.viewBox.w / 1000) : null;
  if (!parsed || !parsed.poly.length) throw new Error(`Icon "${meta.id}" has no filled shapes.`);
  const b = bounds(parsed.poly)!;
  // Worked in mm at the minimum height, where the bridges must be BRIDGE_MM wide.
  const k = meta.minHeightMm / b.h;
  const flipped = parsed.poly.map((c) => c.map((p) => ({ x: (p.x - b.x) * k, y: (b.y + b.h - p.y) * k })));
  // Each poly is made the first time it is read: loading the library stays instant, and only the
  // icons a card or the picker uses cost anything.
  let poly: Poly | null = null;
  const make = (): Poly => {
    const cut = union([flipped]);
    const done = fill ? union([dropHoles(cut)]) : bridgeIslands(cut, frameRound(bounds(cut)!, FRAME_MM), meta.id);
    // A bridge can trim an extreme point (a clapper's foot, a curl's tip), so the result is set back
    // to 1 mm tall with its corner on the origin. It can only grow, so bridges stay at least BRIDGE_MM.
    const db = bounds(done)!;
    return done.map((c) => c.map((p) => ({ x: (p.x - db.x) / db.h, y: (p.y - db.y) / db.h })));
  };
  return {
    ...fields,
    get poly() {
      return (poly ??= make());
    },
  };
}
