/**
 * Flatten: a fitted layout becomes the flat inner sheet and jacket (cut and fold geometry for export)
 * and the posable panels the 3D view folds (one geometry source for both).
 *
 * Flat coordinates (u, y), mm: u across the card, spine at u = 0, back page u ∈ [−W, 0], base page
 * u ∈ [0, W]; y along the spine, [0, L]. Sheet coordinates (pieces) are x = u + W, y unchanged.
 *
 * A block (step-local: x along the spine from the window's left edge, v up from crease P) maps to
 * flat as u = P − v, y = windowY0 + x. That is a rotation, so contours keep their orientation.
 *
 * Folds follow the spec's "One step", "Letters on a step" and "Two lines":
 * - Every fold stops at the cuts of any strip hinged on its surface that it would cross: the spine at
 *   the root strip, a step's A at its children, and (only in layouts the fit was told not to fix) any
 *   other fold a child strip reaches across.
 * - P is a mountain only across the rails: the window's bottom edge lies on P, cut either side of the
 *   plinth and uncut under it (the letters' attachment).
 */
import { bounds, difference, union, type Poly, type Pt } from '@kerfuffle/engine/geom';
import { windowY0, type Layout } from './fit';
import { foldU } from './linkage';
import { cardDims, type Params } from './model';
import { placeDecor, type DecorLayout } from './decor/place';
import type { FoldKind, PanelFrame, StepSpec } from './types';
import type { Theme } from '../themes';

export interface Fold {
  kind: FoldKind;
  /** An open path in sheet mm. */
  path: Pt[];
}

/** A sheet to cut. Coordinates are sheet mm: x = u + W on the inner sheet, y along the spine. */
export interface Piece {
  id: 'inner' | 'jacket';
  widthMm: number;
  heightMm: number;
  outline: Poly;
  /** Closed cut-throughs: each block's window waste (in step order), then the border tiles, then the illustrations. */
  holes: Poly[];
  /** The strip cuts, two per step, each from B to A. */
  openCuts: Pt[][];
  folds: Fold[];
}

/** A rigid piece of the inner sheet, in flat (u, y), posed by its frame. */
export interface Panel {
  /** `page:back`, `page:base`, or `<stepId>:tread` / `:letters` / `:riser`. */
  id: string;
  stepId: string | null;
  poly: Poly;
  frame: PanelFrame;
  /** Nesting depth for 3D thickness offsets: pages 0, root step panels 1, child panels 2. */
  layer: number;
}

export interface Flat {
  inner: Piece;
  jacket: Piece;
  panels: Panel[];
  /** The decorations, in flat coordinates. */
  decor: DecorLayout;
}

const EPS = 1e-6;
/** Half-width of the strip that stands in for a fold line in the decorations' keep-out. */
const FOLD_KEEP_MM = 0.01;

type Span = [number, number];

const rect = (u0: number, y0: number, u1: number, y1: number): Poly =>
  u1 - u0 > EPS && y1 - y0 > EPS
    ? [[{ x: u0, y: y0 }, { x: u1, y: y0 }, { x: u1, y: y1 }, { x: u0, y: y1 }]]
    : [];

/** [lo, hi] with the given ranges taken out. */
function subtract(lo: number, hi: number, cuts: Span[]): Span[] {
  let spans: Span[] = [[lo, hi]];
  for (const [a, b] of cuts) {
    spans = spans.flatMap(([s, e]): Span[] => {
      if (b <= s || a >= e) return [[s, e]];
      const keep: Span[] = [];
      if (a > s) keep.push([s, a]);
      if (b < e) keep.push([b, e]);
      return keep;
    });
  }
  return spans.filter(([s, e]) => e - s > EPS);
}

interface StepGeom {
  step: StepSpec;
  B: number;
  P: number;
  A: number;
  /** The window's y-range along the spine (empty when the step has no block). */
  win: Span | null;
  depth: number;
}

interface FlatFold {
  kind: FoldKind;
  u: number;
  span: Span;
}

export function flatten(layout: Layout, p: Params, _theme: Theme): Flat {
  const { W, L } = cardDims(p);
  const steps = layout.steps;
  const byId = new Map(steps.map((s) => [s.id, s]));
  const depthOf = (s: StepSpec): number => {
    let d = 1;
    for (let q = s; q.parentId !== null && d <= steps.length; d++) {
      const parent = byId.get(q.parentId);
      if (!parent) break;
      q = parent;
    }
    return d;
  };
  const geo: StepGeom[] = steps.map((step) => {
    const { B, P, A } = foldU(step, steps);
    const block = layout.blocks[step.id];
    const w = block ? bounds(block.window) : null;
    const wy0 = block ? windowY0(step, block) : 0;
    return { step, B, P, A, win: w ? [wy0, wy0 + w.w] : null, depth: depthOf(step) };
  });
  const stripOf = (g: StepGeom) => rect(g.B, g.step.y0, g.A, g.step.y1);
  const toFlat = (poly: Poly, g: StepGeom): Poly => {
    const wy0 = g.win?.[0] ?? 0;
    return poly.map((c) => c.map((q) => ({ x: g.P - q.y, y: wy0 + q.x })));
  };
  const kids = (id: string | null) => geo.filter((g) => g.step.parentId === id);
  /** The y-ranges of strips hinged on surface `parentId` whose cuts cross the line u = `u`. */
  const crossing = (u: number, parentId: string | null): Span[] =>
    kids(parentId)
      .filter((g) => g.B < u - EPS && g.A > u + EPS)
      .map((g) => [g.step.y0, g.step.y1]);

  // Folds and cuts, flat.
  const folds: FlatFold[] = subtract(0, L, crossing(0, null)).map((span) => ({ kind: 'valley', u: 0, span }));
  const openCuts: Pt[][] = [];
  for (const g of geo) {
    const { y0, y1, id } = g.step;
    const add = (kind: FoldKind, u: number, cuts: Span[]) =>
      subtract(y0, y1, [...cuts, ...crossing(u, id)]).forEach((span) => folds.push({ kind, u, span }));
    add('valley', g.B, []);
    add('mountain', g.P, g.win ? [g.win] : []);
    add('valley', g.A, []);
    for (const y of [y0, y1]) openCuts.push([{ x: g.B, y }, { x: g.A, y }]);
  }

  // Holes: window waste, then decorations clear of every footprint and fold.
  const footprints = union(geo.map(stripOf));
  const waste = geo
    .map((g) => (layout.blocks[g.step.id] ? toFlat(layout.blocks[g.step.id].waste, g) : []))
    .filter((h) => h.length > 0);
  const keepOut = union([footprints, ...folds.map((f) => rect(f.u - FOLD_KEEP_MM, f.span[0], f.u + FOLD_KEEP_MM, f.span[1]))]);
  const decor = placeDecor(p.decor, keepOut, W, L);
  const cuts = [...decor.border, ...decor.items.map((it) => it.poly)];

  // Panels.
  const pageCut = union([footprints, ...cuts]);
  const panels: Panel[] = [
    { id: 'page:back', stepId: null, poly: difference(rect(-W, 0, 0, L), pageCut), frame: { kind: 'back' }, layer: 0 },
    { id: 'page:base', stepId: null, poly: difference(rect(0, 0, W, L), pageCut), frame: { kind: 'base' }, layer: 0 },
  ];
  for (const g of geo) {
    const { id, y0, y1, h } = g.step;
    const block = layout.blocks[id];
    const childStrips = union(kids(id).map(stripOf));
    const window = block ? toFlat(block.window, g) : [];
    const riser: PanelFrame = { kind: 'riser', uA: g.A };
    const at = (part: string, poly: Poly, frame: PanelFrame): Panel => ({ id: `${id}:${part}`, stepId: id, poly, frame, layer: g.depth });
    panels.push(
      at('tread', difference(rect(g.B, y0, g.P, y1), union([window, childStrips])), { kind: 'tread', h }),
      at('letters', block ? toFlat(union([block.letters, block.plinth]), g) : [], riser),
      at('riser', difference(rect(g.P, y0, g.A, y1), childStrips), riser)
    );
  }

  const toSheet = (poly: Poly): Poly => poly.map((c) => c.map((q) => ({ x: q.x + W, y: q.y })));
  const inner: Piece = {
    id: 'inner',
    widthMm: 2 * W,
    heightMm: L,
    outline: rect(0, 0, 2 * W, L),
    holes: [...waste, ...cuts].map(toSheet),
    openCuts: openCuts.map((c) => c.map((q) => ({ x: q.x + W, y: q.y }))),
    folds: folds.map((f) => ({ kind: f.kind, path: [{ x: f.u + W, y: f.span[0] }, { x: f.u + W, y: f.span[1] }] })),
  };

  // The jacket: the open inner size plus the overhang all round, one valley at the spine.
  const o = Math.max(0, p.advanced.overhangMm);
  const jacket: Piece = {
    id: 'jacket',
    widthMm: 2 * W + 2 * o,
    heightMm: L + 2 * o,
    outline: rect(0, 0, 2 * W + 2 * o, L + 2 * o),
    holes: [],
    openCuts: [],
    folds: [{ kind: 'valley', path: [{ x: W + o, y: 0 }, { x: W + o, y: L + 2 * o }] }],
  };

  return { inner, jacket, panels, decor };
}
