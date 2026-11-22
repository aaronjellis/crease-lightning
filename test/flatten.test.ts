import { describe, expect, test } from 'vitest';
import { area, bounds, difference, grow, intersect, offsetOpen, union, type Poly, type Pt } from '@kerfuffle/engine/geom';
import { fitLayout, windowY0, type Layout } from '../src/core/fit';
import { flatten, type Fold, type Piece } from '../src/core/flatten';
import { placeMotifs } from '../src/core/motifs';
import { foldU } from '../src/core/linkage';
import { cardDims, defaultParams, type Params } from '../src/core/model';
import { MARGIN_MM, PREVIEW_TOL_MM, WEB_MM } from '../src/core/constants';
import type { StepSpec } from '../src/core/types';
import { themeById } from '../src/themes';
import { testFonts } from './helpers/fonts';

const fonts = testFonts();
const birthday = themeById('birthday');
const blank = themeById('blank');
const P0 = defaultParams('en-US');
const fit = (p: Params = P0, theme = birthday): Layout => fitLayout(p, fonts, theme, 'blade', { strokeCheck: false });

const layout = fit();
const { W, L } = cardDims(P0);
const out = flatten(layout, P0, birthday);
const { inner, jacket, panels } = out;
const root = layout.steps.find((s) => s.parentId === null)!;
const children = (id: string) => layout.steps.filter((s) => s.parentId === id);

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const rect = (x0: number, y0: number, x1: number, y1: number): Poly => [
  [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
];
/** The strip's rectangle in sheet coordinates. */
const stripRect = (s: StepSpec, steps: StepSpec[]): Poly => {
  const { B, A } = foldU(s, steps);
  return rect(B + W, s.y0, A + W, s.y1);
};
const symDiff = (a: Poly, b: Poly) => area(difference(a, b)) + area(difference(b, a));
/** The y-ranges covered by folds of `kind` lying on the line x = `x`. */
const foldSpans = (piece: Piece, kind: Fold['kind'], x: number): [number, number][] =>
  piece.folds
    .filter((f) => f.kind === kind && f.path.every((p) => near(p.x, x)))
    .map((f) => {
      const ys = f.path.map((p) => p.y);
      return [Math.min(...ys), Math.max(...ys)] as [number, number];
    })
    .sort((a, b) => a[0] - b[0]);
const covers = (spans: [number, number][], y: number) => spans.some(([a, b]) => y > a + 1e-6 && y < b - 1e-6);
const total = (spans: [number, number][]) => spans.reduce((t, [a, b]) => t + (b - a), 0);
/** The part of the spans inside [lo, hi]: siblings with equal heights share fold lines. */
const within = (spans: [number, number][], lo: number, hi: number): [number, number][] =>
  spans.map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)] as [number, number]).filter(([a, b]) => b > a);
const mapBlock = (poly: Poly, s: StepSpec): Poly => {
  const { P } = foldU(s, layout.steps);
  const y0 = windowY0(s, layout.blocks[s.id]);
  return poly.map((c) => c.map((p) => ({ x: P - p.y + W, y: y0 + p.x })));
};
const footprints = union(layout.steps.map((s) => stripRect(s, layout.steps)));
const wasteOf = (steps: StepSpec[]) => union(steps.map((s) => mapBlock(layout.blocks[s.id].waste, s)));
const motifHoles = (piece: Piece) => piece.holes.filter((h) => area(intersect(h, footprints)) < 1e-6);

describe('flatten: Birthday 5 × 7 default', () => {
  test('the layout is two lines with both accents', () => {
    expect(layout.steps.map((s) => s.id).sort()).toEqual(['a1', 'a2', 'l1', 'l2']);
  });

  test('the inner sheet is 254 × 178', () => {
    expect(inner.id).toBe('inner');
    expect(inner.widthMm).toBe(254);
    expect(inner.heightMm).toBe(178);
    const b = bounds(inner.outline)!;
    expect([b.x, b.y, b.w, b.h]).toEqual([0, 0, 254, 178]);
  });

  test('the jacket is 260 × 184 with one valley fold at x = 130', () => {
    expect(jacket.id).toBe('jacket');
    expect(jacket.widthMm).toBe(260);
    expect(jacket.heightMm).toBe(184);
    expect(jacket.holes).toEqual([]);
    expect(jacket.openCuts).toEqual([]);
    expect(jacket.folds).toHaveLength(1);
    const [f] = jacket.folds;
    expect(f.kind).toBe('valley');
    expect(f.path.every((p) => p.x === 130)).toBe(true);
    expect(Math.min(...f.path.map((p) => p.y))).toBe(0);
    expect(Math.max(...f.path.map((p) => p.y))).toBe(184);
  });

  test('each strip has two open cuts, at y0 and y1, from B to A', () => {
    expect(inner.openCuts).toHaveLength(2 * layout.steps.length);
    for (const s of layout.steps) {
      const { B, A } = foldU(s, layout.steps);
      for (const y of [s.y0, s.y1]) {
        const hit = inner.openCuts.filter(
          (c) => c.length === 2 && c.every((p) => near(p.y, y)) && near(Math.min(c[0].x, c[1].x), B + W) && near(Math.max(c[0].x, c[1].x), A + W)
        );
        expect(hit, `${s.id} at y ${y}`).toHaveLength(1);
      }
    }
  });

  test('the spine valley exists only outside the root strip', () => {
    const spans = foldSpans(inner, 'valley', W);
    expect(spans.length).toBeGreaterThan(0);
    expect(total(spans)).toBeCloseTo(L - (root.y1 - root.y0), 6);
    for (const y of [root.y0 + 0.5, (root.y0 + root.y1) / 2, root.y1 - 0.5]) expect(covers(spans, y)).toBe(false);
    expect(covers(spans, root.y0 / 2)).toBe(true);
    expect(covers(spans, (root.y1 + L) / 2)).toBe(true);
  });

  test('the root P mountain exists only on the rails', () => {
    const { P } = foldU(root, layout.steps);
    const spans = foldSpans(inner, 'mountain', P + W);
    const wy = windowY0(root, layout.blocks.l1);
    const ww = bounds(layout.blocks.l1.window)!.w;
    expect(spans).toHaveLength(2);
    expect(spans[0][0]).toBeCloseTo(root.y0, 6);
    expect(spans[0][1]).toBeCloseTo(wy, 6);
    expect(spans[1][0]).toBeCloseTo(wy + ww, 6);
    expect(spans[1][1]).toBeCloseTo(root.y1, 6);
  });

  test('the root B valley spans the whole strip', () => {
    const { B } = foldU(root, layout.steps);
    const spans = foldSpans(inner, 'valley', B + W);
    expect(total(spans)).toBeCloseTo(root.y1 - root.y0, 6);
  });

  test('the root A valley is absent across each child', () => {
    const { A } = foldU(root, layout.steps);
    const spans = foldSpans(inner, 'valley', A + W);
    const kids = children(root.id);
    expect(kids.length).toBe(3);
    for (const k of kids) {
      for (const y of [k.y0 + 0.1, (k.y0 + k.y1) / 2, k.y1 - 0.1]) expect(covers(spans, y), `${k.id} at ${y}`).toBe(false);
    }
    expect(total(spans)).toBeCloseTo(root.y1 - root.y0 - kids.reduce((t, k) => t + (k.y1 - k.y0), 0), 6);
  });

  test('child folds: B′ valley, P′ mountain on the rails, A′ valley', () => {
    for (const k of children(root.id)) {
      const { B, P, A } = foldU(k, layout.steps);
      const ww = bounds(layout.blocks[k.id].window)!.w;
      const on = (kind: Fold['kind'], u: number) => total(within(foldSpans(inner, kind, u + W), k.y0, k.y1));
      expect(on('valley', B), `${k.id} B`).toBeCloseTo(k.y1 - k.y0, 6);
      expect(on('mountain', P), `${k.id} P`).toBeCloseTo(k.y1 - k.y0 - ww, 6);
      expect(on('valley', A), `${k.id} A`).toBeCloseTo(k.y1 - k.y0, 6);
    }
  });

  test('folds are open paths of at least two points', () => {
    for (const f of inner.folds) {
      expect(f.path.length).toBeGreaterThanOrEqual(2);
      const [a, b] = [f.path[0], f.path[f.path.length - 1]];
      expect(a.x === b.x && a.y === b.y).toBe(false);
    }
  });

  test('every hole lies inside the outline', () => {
    expect(inner.holes.length).toBeGreaterThan(0);
    for (const h of inner.holes) {
      expect(area(h)).toBeGreaterThan(0);
      expect(area(difference(h, inner.outline))).toBeLessThan(1e-6);
    }
  });

  test('the window waste holes equal Block.waste in flat coordinates', () => {
    const inStrips = intersect(union(inner.holes), footprints);
    expect(symDiff(inStrips, wasteOf(layout.steps))).toBeLessThan(1e-3);
  });

  test('the panel union equals the inner outline minus the holes', () => {
    const shifted = union(panels.map((p) => p.poly.map((c) => c.map((q) => ({ x: q.x + W, y: q.y })))));
    const sheet = difference(inner.outline, union(inner.holes));
    expect(symDiff(shifted, sheet)).toBeLessThan(0.5);
  });

  test('panels have frames and layers by nesting depth', () => {
    const byId = new Map(panels.map((p) => [p.id, p]));
    expect(byId.get('page:back')).toMatchObject({ stepId: null, frame: { kind: 'back' }, layer: 0 });
    expect(byId.get('page:base')).toMatchObject({ stepId: null, frame: { kind: 'base' }, layer: 0 });
    for (const s of layout.steps) {
      const depth = s.parentId === null ? 1 : 2;
      const { A } = foldU(s, layout.steps);
      expect(byId.get(`${s.id}:tread`), s.id).toMatchObject({ stepId: s.id, frame: { kind: 'tread', h: s.h }, layer: depth });
      expect(byId.get(`${s.id}:letters`), s.id).toMatchObject({ stepId: s.id, frame: { kind: 'riser', uA: A }, layer: depth });
      expect(byId.get(`${s.id}:riser`), s.id).toMatchObject({ stepId: s.id, frame: { kind: 'riser', uA: A }, layer: depth });
    }
    expect(panels).toHaveLength(2 + 3 * layout.steps.length);
  });

  test('the letters panel is the letters and plinth, and the riser leaves out the children', () => {
    const l1 = panels.find((p) => p.id === 'l1:letters')!;
    const b = layout.blocks.l1;
    const flat = mapBlock(union([b.letters, b.plinth]), root).map((c) => c.map((q) => ({ x: q.x - W, y: q.y })));
    expect(symDiff(l1.poly, flat)).toBeLessThan(1e-3);
    const riser = panels.find((p) => p.id === 'l1:riser')!;
    for (const k of children(root.id)) {
      const kr = stripRect(k, layout.steps).map((c) => c.map((q) => ({ x: q.x - W, y: q.y })));
      expect(area(intersect(riser.poly, kr)), k.id).toBeLessThan(1e-6);
    }
  });

  test('motifs keep a web from every footprint, fold, other motif, and the edge margin', () => {
    const motifs = motifHoles(inner);
    expect(motifs.length).toBe(10);
    const grown = motifs.map((m) => grow(m, WEB_MM - 0.02, PREVIEW_TOL_MM));
    const foldLines = union(inner.folds.map((f) => offsetOpen(f.path, 0.01, PREVIEW_TOL_MM)));
    grown.forEach((g, i) => {
      expect(area(intersect(g, footprints)), `motif ${i} footprint`).toBeLessThan(1e-6);
      expect(area(intersect(g, foldLines)), `motif ${i} fold`).toBeLessThan(1e-6);
      motifs.forEach((m, j) => {
        if (j !== i) expect(area(intersect(g, m)), `motif ${i} vs ${j}`).toBeLessThan(1e-6);
      });
      const b = bounds(motifs[i])!;
      expect(b.x).toBeGreaterThanOrEqual(MARGIN_MM - 1e-6);
      expect(b.y).toBeGreaterThanOrEqual(MARGIN_MM - 1e-6);
      expect(b.x + b.w).toBeLessThanOrEqual(2 * W - MARGIN_MM + 1e-6);
      expect(b.y + b.h).toBeLessThanOrEqual(L - MARGIN_MM + 1e-6);
    });
  });

  test('back-top motifs sit on the back page, base-front motifs on the base page', () => {
    const motifs = motifHoles(inner);
    const back = motifs.filter((m) => bounds(m)!.x + bounds(m)!.w < W);
    const base = motifs.filter((m) => bounds(m)!.x > W);
    expect(back).toHaveLength(6);
    expect(base).toHaveLength(4);
    // Each band hugs its far edge: the margin line.
    expect(Math.min(...back.map((m) => bounds(m)!.x))).toBeCloseTo(MARGIN_MM, 1);
    expect(Math.max(...base.map((m) => bounds(m)!.x + bounds(m)!.w))).toBeCloseTo(2 * W - MARGIN_MM, 1);
  });

  test('with motifs off there are no motif holes', () => {
    const off = flatten(layout, { ...P0, motifs: false }, birthday);
    expect(motifHoles(off.inner)).toHaveLength(0);
    expect(off.inner.holes).toHaveLength(layout.steps.length);
    expect(symDiff(union(off.inner.holes), wasteOf(layout.steps))).toBeLessThan(1e-3);
  });

  test('the Blank theme has no motif holes', () => {
    const l = fit(P0, blank);
    expect(flatten(l, P0, blank).inner.holes).toHaveLength(l.steps.length);
  });
});

describe('flatten: other layouts', () => {
  test('one line: the spine stops at the root and the A valley at the accents', () => {
    const p = { ...P0, line2: '', line1: 'HELLO' };
    const l = fit(p);
    expect(l.steps.some((s) => s.role === 'line2')).toBe(false);
    const f = flatten(l, p, birthday);
    const r = l.steps.find((s) => s.parentId === null)!;
    expect(total(foldSpans(f.inner, 'valley', W))).toBeCloseTo(L - (r.y1 - r.y0), 6);
    const kids = l.steps.filter((s) => s.parentId === r.id);
    const { A } = foldU(r, l.steps);
    expect(total(foldSpans(f.inner, 'valley', A + W))).toBeCloseTo(r.y1 - r.y0 - kids.reduce((t, k) => t + (k.y1 - k.y0), 0), 6);
  });

  test('an empty layout is two blank pages with a full spine', () => {
    const empty: Layout = { steps: [], blocks: {}, lines: [], fixes: [], notes: [] };
    const f = flatten(empty, { ...P0, motifs: false }, birthday);
    expect(f.inner.holes).toEqual([]);
    expect(f.inner.openCuts).toEqual([]);
    expect(f.inner.folds).toHaveLength(1);
    expect(f.panels.map((p) => p.id).sort()).toEqual(['page:back', 'page:base']);
  });

  test('an undone clear:l2 (line 2 too tall for line 1) does not throw', () => {
    const p: Params = {
      ...P0,
      advanced: { ...P0.advanced, line1: { h: 5 } },
      overrides: { 'clear:l2': true, 'fit:l1': true },
    };
    const l = fit(p);
    const [l1, l2] = [l.steps.find((s) => s.id === 'l1')!, l.steps.find((s) => s.id === 'l2')!];
    expect(l2.h + WEB_MM).toBeGreaterThan(l1.h);
    expect(() => flatten(l, p, birthday)).not.toThrow();
    // A child reaching above its parent's crease, built by hand.
    const tall: Layout = { ...layout, steps: layout.steps.map((s) => (s.id === 'l2' ? { ...s, h: root.h + 10 } : s)) };
    expect(() => flatten(tall, P0, birthday)).not.toThrow();
  });

  test('A6 and short spine build with every motif clear of the strips', () => {
    for (const over of [{ size: 'a6' as const }, { spine: 'short' as const }, { size: 'a2' as const }]) {
      const p = { ...P0, ...over };
      const l = fit(p);
      const dims = cardDims(p);
      const f = flatten(l, p, birthday);
      expect(f.inner.widthMm).toBe(2 * dims.W);
      const fp = union(l.steps.map((s) => {
        const { B, A } = foldU(s, l.steps);
        return rect(B + dims.W, s.y0, A + dims.W, s.y1);
      }));
      const motifs = f.inner.holes.filter((h) => area(intersect(h, fp)) < 1e-6);
      expect(motifs.length, JSON.stringify(over)).toBeGreaterThan(0);
      for (const m of motifs) expect(area(intersect(grow(m, WEB_MM - 0.02, PREVIEW_TOL_MM), fp))).toBeLessThan(1e-6);
    }
  });
});

describe('placeMotifs', () => {
  const none: Poly = [];

  test('with nothing in the way, every motif goes in at its largest size', () => {
    const placed = placeMotifs(birthday, none, W, L);
    expect(placed).toHaveLength(10);
    const tallest = Math.max(...placed.map((m) => bounds(m)!.w));
    // Height is along u (the sheet's x): the confetti's largest is 14 mm.
    expect(tallest).toBeCloseTo(14, 1);
  });

  test('a motif short of room shrinks, but never under its minimum', () => {
    // Leave the back-top band only 11 mm deep: room for confetti between 9 and 14 mm.
    const wall = [[{ x: -W + MARGIN_MM + 11 + WEB_MM, y: 0 }, { x: -1, y: 0 }, { x: -1, y: L }, { x: -W + MARGIN_MM + 11 + WEB_MM, y: L }]] as Pt[][];
    const placed = placeMotifs(birthday, wall, W, L).filter((m) => bounds(m)!.x < 0);
    expect(placed.length).toBe(6);
    for (const m of placed) {
      expect(bounds(m)!.w).toBeLessThanOrEqual(11 + 1e-6);
      expect(bounds(m)!.w).toBeGreaterThanOrEqual(9 - 1e-6);
    }
  });

  test('a motif with no room at its minimum drops', () => {
    const wall = [[{ x: -W + MARGIN_MM + 8 + WEB_MM, y: 0 }, { x: -1, y: 0 }, { x: -1, y: L }, { x: -W + MARGIN_MM + 8 + WEB_MM, y: L }]] as Pt[][];
    expect(placeMotifs(birthday, wall, W, L).filter((m) => bounds(m)!.x < 0)).toHaveLength(0);
  });

  test('Blank places nothing', () => {
    expect(placeMotifs(blank, none, W, L)).toEqual([]);
  });
});
