/**
 * The decoration engine: border tiles, pinned items and the seeded scatter, all through one fit test
 * (`canPlace`). Coordinates are flat (u, y): back page u ∈ [−W, 0], base page u ∈ [0, W], y ∈ [0, L].
 */
import { describe, expect, test } from 'vitest';
import { area, bounds, grow, intersect, type Poly, type Pt, type Rect } from '@kerfuffle/engine/geom';
import { build, type Card } from '../src/core/build';
import { MARGIN_MM, PREVIEW_TOL_MM, WEB_MM } from '../src/core/constants';
import { addItem, decorFromStyle, moveItem, removeItem, resizeItem, shuffle } from '../src/core/decor/model';
import { fromPin, iconPoly, toPin } from '../src/core/decor/geometry';
import { canPlace, placeDecor, type DecorLayout, type PlacedItem } from '../src/core/decor/place';
import { rng } from '../src/core/decor/rng';
import { candidates } from '../src/core/decor/scatter';
import type { Decor } from '../src/core/decor/types';
import { foldU } from '../src/core/linkage';
import { cardDims, defaultParams, withSize, type Params } from '../src/core/model';
import { THEMES, themeById } from '../src/themes';
import { testFonts } from './helpers/fonts';

const assets = { fonts: testFonts() };
const P0 = defaultParams('en-US');
const birthday = themeById('birthday');
const make = (p: Params): Card => build(p, assets, 'blade', { strokeCheck: false });
const withDecor = (p: Params, decor: Decor): Params => ({ ...p, decor });
const EMPTY: Decor = { style: null, border: null, seed: 1, items: [] };
const centreOf = (layout: DecorLayout, id: string): Pt | undefined => layout.items.find((i) => i.id === id)?.centre;

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Whether `a`, grown by just under a web, overlaps `b`; boxes first. */
const tooClose = (a: Poly, b: Poly): boolean => {
  const ba = bounds(a);
  const bb = bounds(b);
  if (!ba || !bb) return false;
  const r = WEB_MM;
  if (!overlaps({ x: ba.x - r, y: ba.y - r, w: ba.w + 2 * r, h: ba.h + 2 * r }, bb)) return false;
  return area(intersect(grow(a, WEB_MM - 0.01, PREVIEW_TOL_MM), b)) >= 1e-6;
};

/** Every cut keeps a web from every other cut and from the keep-out, and stays inside the margin. */
function spacingProblems(layout: DecorLayout, W: number, L: number): string[] {
  const cuts = [...layout.border.map((poly, i) => ({ name: `tile ${i}`, poly })), ...layout.items.map((it) => ({ name: it.id, poly: it.poly }))];
  const bad: string[] = [];
  cuts.forEach((a, i) => {
    if (tooClose(a.poly, layout.keepOut)) bad.push(`${a.name} vs keep-out`);
    for (let j = i + 1; j < cuts.length; j++) if (tooClose(a.poly, cuts[j].poly)) bad.push(`${a.name} vs ${cuts[j].name}`);
    const b = bounds(a.poly)!;
    const e = 1e-6;
    if (b.x < -W + MARGIN_MM - e || b.x + b.w > W - MARGIN_MM + e || b.y < MARGIN_MM - e || b.y + b.h > L - MARGIN_MM + e) {
      bad.push(`${a.name} outside the margin`);
    }
  });
  return bad;
}

describe('rng', () => {
  test('the same seed and key give the same sequence; another key another one', () => {
    const a = rng(7, 'i1');
    const b = rng(7, 'i1');
    const c = rng(7, 'i2');
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    expect(Array.from({ length: 5 }, () => c())).not.toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
  });
});

describe('geometry', () => {
  const { W, L } = cardDims(P0);

  test('an icon is upright: its height runs along u and its box is centred on the centre', () => {
    const poly = iconPoly('star', 'back', { x: -50, y: 80 }, 12);
    const b = bounds(poly)!;
    expect(b.w).toBeCloseTo(12, 6);
    expect(b.x + b.w / 2).toBeCloseTo(-50, 6);
    expect(b.y + b.h / 2).toBeCloseTo(80, 6);
  });

  test('toPin and fromPin are inverses, measured from the spine', () => {
    for (const at of [{ page: 'back' as const, u: 0.25, v: 0.8 }, { page: 'base' as const, u: 0.9, v: 0.1 }]) {
      const c = fromPin(at, W, L);
      expect(Math.sign(c.x)).toBe(at.page === 'back' ? -1 : 1);
      const back = toPin(at.page, c, W, L);
      expect(back.page).toBe(at.page);
      expect(back.u).toBeCloseTo(at.u, 9);
      expect(back.v).toBeCloseTo(at.v, 9);
    }
    expect(fromPin({ page: 'base', u: 1, v: 1 }, W, L)).toEqual({ x: W - MARGIN_MM, y: L - MARGIN_MM });
  });
});

describe('placeDecor', () => {
  const { W, L } = cardDims(P0);
  const confetti = decorFromStyle(birthday, 'confetti', 1);

  test('with nothing in the way, every item places within its size range', () => {
    const out = placeDecor(confetti, [], W, L);
    expect(out.missing).toEqual([]);
    expect(out.items.map((i) => i.id)).toEqual(confetti.items.map((i) => i.id));
    for (const it of out.items) {
      const src = confetti.items.find((i) => i.id === it.id)!;
      expect(it.sizeMm).toBeGreaterThanOrEqual(src.minMm - 1e-9);
      expect(it.sizeMm).toBeLessThanOrEqual(src.maxMm + 1e-9);
      // Height is along u.
      expect(bounds(it.poly)!.w).toBeCloseTo(it.sizeMm, 6);
      expect(it.pinned).toBe(false);
      expect(it.displaced).toBe(false);
    }
  });

  test('a resized item is placed at its size only', () => {
    const d = resizeItem(confetti, 'i1', 12);
    expect(placeDecor(d, [], W, L).items[0].sizeMm).toBe(12);
  });

  test('no items and no border place nothing', () => {
    expect(placeDecor(EMPTY, [], W, L)).toEqual({ keepOut: [], border: [], items: [], missing: [] });
  });

  test('an item with no room anywhere is missing', () => {
    const wall: Poly = [[{ x: -W, y: 0 }, { x: W, y: 0 }, { x: W, y: L }, { x: -W, y: L }]];
    const out = placeDecor(confetti, wall, W, L);
    expect(out.items).toEqual([]);
    expect(out.missing).toEqual(confetti.items.map((i) => i.id));
  });

  test('a border runs on both pages, never on the spine, with tiles on the margin lines', () => {
    const out = placeDecor({ ...EMPTY, border: 'star-row' }, [], W, L);
    expect(out.border.length).toBeGreaterThan(8);
    const boxes = out.border.map((t) => bounds(t)!);
    expect(boxes.some((b) => b.x + b.w <= 0)).toBe(true);
    expect(boxes.some((b) => b.x >= 0)).toBe(true);
    expect(Math.min(...boxes.map((b) => b.x))).toBeCloseTo(-W + MARGIN_MM, 6);
    expect(Math.max(...boxes.map((b) => b.x + b.w))).toBeCloseTo(W - MARGIN_MM, 6);
    expect(Math.min(...boxes.map((b) => b.y))).toBeCloseTo(MARGIN_MM, 6);
    expect(Math.max(...boxes.map((b) => b.y + b.h))).toBeCloseTo(L - MARGIN_MM, 6);
    // Nothing runs along the spine: no tile within a web of u = 0.
    for (const b of boxes) expect(b.x > WEB_MM || b.x + b.w < -WEB_MM).toBe(true);
    expect(spacingProblems(out, W, L)).toEqual([]);
  });
});

describe('decor in build', () => {
  test('deterministic: the same decor and card give the same layout', () => {
    const p = withDecor(P0, decorFromStyle(birthday, 'candles', 5));
    expect(make(p).decor).toEqual(make(p).decor);
  });

  describe('stable', () => {
    const p = withDecor(P0, decorFromStyle(birthday, 'balloons', 1));
    const before = make(p).decor;

    test('removing an item leaves every other item in its spot', () => {
      const after = make(withDecor(p, removeItem(p.decor, 'i2'))).decor;
      expect(after.items.map((i) => i.id)).toEqual(before.items.map((i) => i.id).filter((id) => id !== 'i2'));
      for (const it of after.items) expect(it.centre, it.id).toEqual(centreOf(before, it.id));
    });

    test('adding an item leaves every other item in its spot', () => {
      const after = make(withDecor(p, addItem(p.decor, 'star'))).decor;
      for (const it of before.items) expect(centreOf(after, it.id), it.id).toEqual(it.centre);
    });

    test('a changed message leaves every item whose spot still fits in it', () => {
      const card = make({ ...p, line1: 'HAPPY BIRTHDAY!' });
      const { W, L } = cardDims(p);
      let kept = 0;
      for (const it of before.items) {
        const fits = canPlace(card.decor, it, W, L);
        if (fits) {
          expect(centreOf(card.decor, it.id), it.id).toEqual(it.centre);
          kept++;
        }
      }
      expect(kept).toBeGreaterThan(0);
    });
  });

  describe('spacing', () => {
    const cases: [string, Params][] = [
      ['Birthday candles 5 × 7', withDecor(P0, decorFromStyle(birthday, 'candles', 3))],
      ['Christmas holly A6 short', { ...withSize(P0, 'a6'), spine: 'short', theme: 'christmas', decor: decorFromStyle(themeById('christmas'), themeById('christmas').styles[0].id, 9) }],
      ['Graduation A2', { ...withSize(P0, 'a2'), theme: 'graduation', decor: decorFromStyle(themeById('graduation'), themeById('graduation').styles[0].id, 2) }],
    ];
    test.each(cases)('%s: every cut keeps a web from every other and the keep-out, inside the margin', (_name, p) => {
      const { W, L } = cardDims(p);
      const layout = make(p).decor;
      expect(layout.border.length + layout.items.length).toBeGreaterThan(0);
      expect(spacingProblems(layout, W, L)).toEqual([]);
    });
  });

  test('canPlace agrees with the build: every placed item fits where it is, and not on another', () => {
    const p = withDecor(P0, decorFromStyle(birthday, 'confetti', 4));
    const { W, L } = cardDims(p);
    const { decor } = make(p);
    for (const it of decor.items) expect(canPlace(decor, it, W, L), it.id).toBe(true);
    const [a, b] = decor.items;
    expect(canPlace(decor, { ...a, page: b.page, centre: b.centre }, W, L)).toBe(false);
  });

  test('shuffle moves at least one unpinned item and no pinned one', () => {
    const pinned = moveItem(decorFromStyle(birthday, 'confetti', 1), 'i1', { page: 'back', u: 0.75, v: 0.15 });
    const before = make(withDecor(P0, pinned)).decor;
    const after = make(withDecor(P0, shuffle(pinned, () => 0.5))).decor;
    expect(centreOf(after, 'i1')).toEqual(centreOf(before, 'i1'));
    const moved = before.items.filter((it) => !it.pinned && JSON.stringify(centreOf(after, it.id)) !== JSON.stringify(it.centre));
    expect(moved.length).toBeGreaterThan(0);
  });

  test('items that fit nowhere are left out with an info note; the card still exports with no fixes', () => {
    // 25 balloons at their default 12 to 16 mm all fit on A6; at 25 mm about half don't.
    let decor = EMPTY;
    for (let k = 0; k < 25; k++) decor = addItem(decor, 'balloon');
    for (const it of decor.items) decor = resizeItem(decor, it.id, 25);
    const card = make(withDecor(withSize(P0, 'a6'), decor));
    const n = card.decor.missing.length;
    expect(n).toBeGreaterThan(0);
    expect(card.notes).toContainEqual({ level: 'info', message: `${n} illustrations didn't fit. Remove some or try a bigger card.` });
    expect(card.exportable).toBe(true);
    expect(card.fixes).toEqual([]);
  });

  describe('a pin that stops fitting', () => {
    // A star pinned where line 2's strip lands: free on a one-line card, under the strip on a two-line one.
    const one: Params = { ...P0, line2: '' };
    const two: Params = { ...P0, line2: 'SAM' };
    const star: Decor = { ...EMPTY, items: [{ id: 'i1', icon: 'star', minMm: 9, maxMm: 9, sizeMm: 9 }] };
    const { W, L } = cardDims(P0);
    const c1 = make(withDecor(one, star));
    const c2 = make(withDecor(two, star));
    const l2 = c2.layout.steps.find((s) => s.role === 'line2')!;
    const { B, A } = foldU(l2, c2.layout.steps);
    let spot: { page: 'back' | 'base'; centre: Pt } | null = null;
    for (let u = B; u <= A && !spot; u += 1) {
      for (let y = l2.y0; y <= l2.y1 && !spot; y += 1) {
        const page = u < 0 ? 'back' : 'base';
        const cand = { id: 'i1', icon: 'star', page, centre: { x: u, y }, sizeMm: 9 } as const;
        if (canPlace(c1.decor, cand, W, L) && !canPlace(c2.decor, cand, W, L)) spot = { page, centre: { x: u, y } };
      }
    }
    const at = spot ? toPin(spot.page, spot.centre, W, L) : null;
    const pinned = at ? moveItem(star, 'i1', at) : star;

    test("switching to two lines shows it elsewhere, keeps its pin, and notes it's out of its spot", () => {
      expect(spot).not.toBeNull();
      const card = make(withDecor(two, pinned));
      const it = card.decor.items.find((i) => i.id === 'i1')!;
      expect(it.displaced).toBe(true);
      expect(it.pinned).toBe(true);
      expect(card.params.decor.items[0].at).toEqual(at);
      expect(card.notes).toContainEqual({ level: 'info', message: "1 illustration is out of its spot until there's room." });
      // It shows at the fitting candidate of its own list nearest its pin: no farther than the first
      // fitting one, and the nearest of all of them.
      const pin = fromPin(at!, W, L);
      const dist = (c: Pt) => Math.hypot(c.x - pin.x, c.y - pin.y);
      const empty: DecorLayout = { ...card.decor, border: [], items: [], missing: [] };
      const fitting = [...candidates(card.params.decor.items[0], card.params.decor.seed, W, L)].filter((s) => canPlace(empty, s, W, L));
      expect(fitting.length).toBeGreaterThan(1);
      expect(dist(it.centre)).toBeLessThanOrEqual(dist(fitting[0].centre));
      expect(dist(it.centre)).toBe(Math.min(...fitting.map((s) => dist(s.centre))));
    });

    test('switching back to one line returns it to its pin', () => {
      const card = make(withDecor(one, pinned));
      const it = card.decor.items.find((i) => i.id === 'i1')!;
      expect(it.displaced).toBe(false);
      expect(it.centre).toEqual(fromPin(at!, W, L));
      expect(card.notes.map((n) => n.message)).not.toContain("1 illustration is out of its spot until there's room.");
    });
  });

  test('a pinned item with no size keeps its centre and size whatever the seed', () => {
    const d = moveItem(decorFromStyle(birthday, 'confetti', 1), 'i1', { page: 'back', u: 0.75, v: 0.15 });
    expect(d.items[0].sizeMm).toBeUndefined();
    const seen = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const it = make(withDecor(P0, { ...d, seed })).decor.items.find((i) => i.id === 'i1')!;
      expect(it.displaced, `seed ${seed}`).toBe(false);
      seen.add(JSON.stringify([it.centre, it.sizeMm]));
    }
    expect(seen.size).toBe(1);
  });

  test('pinning an item where it shows, at the size it shows, keeps it there on the next build', () => {
    const p = withDecor(P0, decorFromStyle(birthday, 'confetti', 4));
    const { W, L } = cardDims(p);
    const before = make(p).decor;
    for (const it of before.items) {
      const after = make(withDecor(p, moveItem(p.decor, it.id, toPin(it.page, it.centre, W, L), it.sizeMm))).decor;
      const now = after.items.find((i) => i.id === it.id)!;
      expect(now.pinned, it.id).toBe(true);
      expect(now.displaced, it.id).toBe(false);
      expect(now.sizeMm, it.id).toBeCloseTo(it.sizeMm, 9);
      expect(now.centre.x, it.id).toBeCloseTo(it.centre.x, 9);
      expect(now.centre.y, it.id).toBeCloseTo(it.centre.y, 9);
    }
  });

  test('a pin keeps its fraction through a size change', () => {
    const at = { page: 'back' as const, u: 0.75, v: 0.15 };
    const d = moveItem(decorFromStyle(birthday, 'confetti', 1), 'i1', at);
    for (const size of ['5x7', 'a5'] as const) {
      const p = withDecor(withSize(P0, size), d);
      const { W, L } = cardDims(p);
      const it = make(p).decor.items.find((i) => i.id === 'i1')!;
      expect(it.displaced, size).toBe(false);
      const back = toPin(it.page, it.centre, W, L);
      expect(back.page).toBe(at.page);
      expect(Math.abs(back.u - at.u)).toBeLessThan(1e-6);
      expect(Math.abs(back.v - at.v)).toBeLessThan(1e-6);
    }
  });

  test('canPlace answers within a frame: median under 4 ms with 30 items on 5 × 7', () => {
    let decor: Decor = EMPTY;
    for (let k = 0; k < 30; k++) decor = addItem(decor, ['star', 'heart', 'balloon'][k % 3]);
    const p = withDecor(P0, decor);
    const { W, L } = cardDims(p);
    const layout = make(p).decor;
    const r = rng(1, 'drag');
    const target: PlacedItem = layout.items[0];
    const times: number[] = [];
    for (let k = 0; k < 50; k++) {
      const page = r() < 0.5 ? 'back' : 'base';
      const centre = { x: (page === 'back' ? -1 : 1) * r() * (W - MARGIN_MM), y: MARGIN_MM + r() * (L - 2 * MARGIN_MM) };
      const t0 = performance.now();
      canPlace(layout, { ...target, page, centre }, W, L);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[25]).toBeLessThan(4);
  });
});

/**
 * Critical 1 (final review): clipper2's offset ran for minutes on the default card's confetti `i5`
 * (12.217 mm at (86.08, 15.67)), and the fit test grew every obstacle a candidate's box met. A drag
 * to about (86.75, 13.68) froze the tab. The fit test now measures distances instead; these must
 * return, and quickly. A hang here blocks the worker, which vitest reports after its RPC timeout.
 */
describe('the fit test never stalls', () => {
  const SPOT = { x: 86.75, y: 13.68 };

  test('canPlace beside the default card’s confetti i5 answers in under 500 ms', () => {
    const p = P0;
    const { W, L } = cardDims(p);
    const layout = make(p).decor;
    const i5 = layout.items.find((i) => i.id === 'i5')!;
    expect(i5.icon).toBe('confetti');
    expect(i5.sizeMm).toBeCloseTo(12.217, 3);
    for (const it of layout.items.filter((i) => i.id !== 'i5')) {
      const t0 = performance.now();
      const ok = canPlace(layout, { ...it, page: 'base', centre: SPOT }, W, L);
      expect(performance.now() - t0, it.id).toBeLessThan(500);
      // Its box meets i5's, which is in the way.
      expect(ok, it.id).toBe(false);
    }
  });

  test('building the default card with an item pinned at that spot completes', () => {
    const { W, L } = cardDims(P0);
    const d = moveItem(P0.decor, 'i7', toPin('base', SPOT, W, L), 11.45);
    const t0 = performance.now();
    const card = make(withDecor(P0, d));
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(card.decor.items.length + card.decor.missing.length).toBe(P0.decor.items.length);
    expect(card.checks.find((c) => c.id === 'layout')!.ok).toBe(true);
  });

  describe('a drag sweep round every placed item on 5 × 7', () => {
    const OFFSETS = [-12, -9, -6, -3, 0, 3, 6, 9, 12];
    test.each(THEMES.filter((t) => t.styles.length).map((t) => [t.id, t] as const))('%s, first style', (_id, theme) => {
      const p: Params = { ...P0, theme: theme.id, decor: decorFromStyle(theme, theme.styles[0].id, 1) };
      const { W, L } = cardDims(p);
      const layout = make(p).decor;
      const t0 = performance.now();
      let calls = 0;
      for (const dragged of layout.items) {
        for (const around of layout.items) {
          for (const dx of OFFSETS) {
            for (const dy of OFFSETS) {
              const centre = { x: around.centre.x + dx, y: around.centre.y + dy };
              canPlace(layout, { ...dragged, page: centre.x < 0 ? 'back' : 'base', centre }, W, L);
              calls++;
            }
          }
        }
      }
      expect(calls).toBeGreaterThan(0);
      expect(performance.now() - t0).toBeLessThan(5000);
    });
  });
});
