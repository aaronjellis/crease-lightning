import { describe, expect, test } from 'vitest';
import { cardDims, defaultParams } from '../src/core/model';
import { MARGIN_MM } from '../src/core/constants';
import { build, type Card } from '../src/core/build';
import { runChecks, type CheckResult } from '../src/core/checks';
import { thinNote } from '../src/core/fixes';
import type { Panel } from '../src/core/flatten';

import { testFonts } from './helpers/fonts';

const assets = { fonts: testFonts() };

const P0 = defaultParams('en-US');
const { W, L } = cardDims(P0);
const real = build(P0, assets, 'blade', { strokeCheck: false });
const { checks: _checks, ...base } = real;
type Base = Omit<Card, 'checks'>;

const result = (checks: CheckResult[], id: CheckResult['id']): CheckResult => checks.find((c) => c.id === id)!;
const run = (card: Base, p = P0, strokeCheck = false) => runChecks(card, p, { strokeCheck });
const square = (u: number, y: number, size = 2) => [[
  { x: u, y }, { x: u + size, y }, { x: u + size, y: y + size }, { x: u, y: y + size },
]];
const withPanels = (extra: Panel[]): Base => ({ ...base, panels: [...base.panels, ...extra] });

describe('runChecks on the default card', () => {
  test('reports the five checks in order, all ok', () => {
    const checks = run(base);
    expect(checks.map((c) => c.id)).toEqual(['closed', 'one-piece', 'layout', 'stroke', 'front-view']);
    for (const c of checks) expect(c.ok, `${c.id}: ${c.detail}`).toBe(true);
  });
});

describe('closed', () => {
  // A riser panel whose vertex at u has a + b = 2 uA − u.
  const riserAt = (reach: number): Panel => {
    const uA = 40;
    const u = 2 * uA - reach;
    return { id: 'x:letters', stepId: 'x', poly: square(u, 20), frame: { kind: 'riser', uA }, layer: 1 };
  };

  test('d + h + s = W − 6 still closes', () => {
    expect(result(run(withPanels([riserAt(W - MARGIN_MM)])), 'closed').ok).toBe(true);
  });

  test('d + h + s = W − 5 fails and names the panel', () => {
    const r = result(run(withPanels([riserAt(W - 5)])), 'closed');
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('x:letters');
  });

  test('a built tread that pokes out fails', () => {
    const tread: Panel = { id: 'x:tread', stepId: 'x', poly: square(0, 20), frame: { kind: 'tread', h: W }, layer: 1 };
    expect(result(run(withPanels([tread])), 'closed').ok).toBe(false);
  });
});

describe('one-piece', () => {
  test('a cut across the whole sheet splits it', () => {
    const wall = [[
      { x: W - 1, y: -1 }, { x: W + 1, y: -1 }, { x: W + 1, y: L + 1 }, { x: W - 1, y: L + 1 },
    ]];
    const split: Base = { ...base, inner: { ...base.inner, holes: [...base.inner.holes, wall] } };
    const r = result(run(split), 'one-piece');
    expect(r.ok).toBe(false);
  });

  test('a letter panel that does not touch its riser fails', () => {
    const panels = base.panels.map((p) => (p.id.endsWith(':letters') && p.poly.length ? { ...p, poly: square(-W + 1, 1) } : p));
    const r = result(run({ ...base, panels }), 'one-piece');
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('letters');
  });
});

describe('one-piece: open cuts and stray contours', () => {
  test('one open cut across the sheet splits it in two', () => {
    const cut = [{ x: W, y: -1 }, { x: W, y: L + 1 }];
    const split: Base = { ...base, inner: { ...base.inner, openCuts: [...base.inner.openCuts, cut] } };
    const r = result(run(split), 'one-piece');
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('pieces');
  });

  test('one stray contour fails even when the rest of the line touches the riser', () => {
    let done = false;
    const panels = base.panels.map((p) => {
      if (done || !p.id.endsWith(':letters') || !p.poly.length) return p;
      done = true;
      return { ...p, poly: [...p.poly, ...square(-W + 1, 1)] };
    });
    const r = result(run({ ...base, panels }), 'one-piece');
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('letters');
  });
});

describe('layout: open cuts and edges', () => {
  const cutsAt = (gap: number): Base => {
    const a = [{ x: 2 * W - 40, y: 80 }, { x: 2 * W - 30, y: 80 }];
    const b = [{ x: 2 * W - 40, y: 80 + gap }, { x: 2 * W - 30, y: 80 + gap }];
    return { ...base, inner: { ...base.inner, openCuts: [...base.inner.openCuts, a, b] } };
  };

  test('two open cuts 1 mm apart fail', () => {
    expect(result(run(cutsAt(1)), 'layout').ok).toBe(false);
  });
  test('boundary: 2.8 mm fails, 3.2 mm passes', () => {
    expect(result(run(cutsAt(2.8)), 'layout').ok).toBe(false);
    expect(result(run(cutsAt(3.2)), 'layout').ok).toBe(true);
  });

  const root = base.layout.steps.find((s) => s.parentId === null)!;
  const edit = (patch: Partial<typeof root>): Base => ({
    ...base,
    layout: { ...base.layout, steps: base.layout.steps.map((s) => (s.id === root.id ? { ...s, ...patch } : s)) },
  });

  test('a strip whose back hinge is within 6 mm of the sheet edge fails', () => {
    const r = result(run(edit({ h: W - 3 })), 'layout');
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('card edge');
  });
  test('a strip whose base hinge is within 6 mm of the sheet edge fails', () => {
    const r = result(run(edit({ d: W - 3 })), 'layout');
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('card edge');
  });
});

describe('layout', () => {
  // A card with no decorations, so the hand-made cuts below meet nothing but each other.
  const { checks: _bare, ...bare } = build({ ...P0, decor: { ...P0.decor, items: [] } }, assets, 'blade', { strokeCheck: false });

  test('two cuts 1 mm apart fail', () => {
    const a = [[{ x: 2 * W - 40, y: 80 }, { x: 2 * W - 30, y: 80 }, { x: 2 * W - 30, y: 85 }, { x: 2 * W - 40, y: 85 }]];
    const b = [[{ x: 2 * W - 29, y: 80 }, { x: 2 * W - 20, y: 80 }, { x: 2 * W - 20, y: 85 }, { x: 2 * W - 29, y: 85 }]];
    const close: Base = { ...bare, inner: { ...bare.inner, holes: [...bare.inner.holes, a, b] } };
    expect(result(run(close), 'layout').ok).toBe(false);
  });

  test('cuts 4 mm apart pass', () => {
    const a = [[{ x: 2 * W - 40, y: 80 }, { x: 2 * W - 30, y: 80 }, { x: 2 * W - 30, y: 85 }, { x: 2 * W - 40, y: 85 }]];
    const b = [[{ x: 2 * W - 26, y: 80 }, { x: 2 * W - 20, y: 80 }, { x: 2 * W - 20, y: 85 }, { x: 2 * W - 26, y: 85 }]];
    const apart: Base = { ...bare, inner: { ...bare.inner, holes: [...bare.inner.holes, a, b] } };
    expect(result(run(apart), 'layout').ok).toBe(true);
  });

  test('overlapping panels fail', () => {
    const dup = base.panels.find((p) => p.id === 'page:base')!;
    expect(result(run(withPanels([{ ...dup, id: 'dup' }])), 'layout').ok).toBe(false);
  });

  test('a strip closer than 6 mm to the card end fails', () => {
    const steps = base.layout.steps.map((s, i) => (i === 0 ? { ...s, y0: 2 } : s));
    const r = result(run({ ...base, layout: { ...base.layout, steps } }), 'layout');
    expect(r.ok).toBe(false);
  });
});

describe('stroke', () => {
  test('ok when fit emitted no thin-stroke note', () => {
    expect(result(run(base, P0, true), 'stroke').ok).toBe(true);
  });

  test('fails when fit emitted a thin-stroke note', () => {
    const notes = [...base.notes, thinNote('l1', 1.5)];
    const r = result(run({ ...base, notes }, P0, true), 'stroke');
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('line 1');
  });

  test('reports "not run" when the stroke check is off', () => {
    const notes = [...base.notes, thinNote('l1', 1.5)];
    expect(result(run({ ...base, notes }, P0, false), 'stroke')).toEqual({ id: 'stroke', ok: true, detail: 'not run' });
  });
});

describe('front-view', () => {
  const [l1, l2] = [base.layout.steps.find((s) => s.role === 'line1')!, base.layout.steps.find((s) => s.role === 'line2')!];

  test('the default two-line card clears', () => {
    expect(l1.h).toBeGreaterThanOrEqual(l2.h + l2.s + 3 - 1e-6);
    expect(result(run(base), 'front-view').ok).toBe(true);
  });

  test('line 2 hiding line 1 fails', () => {
    const steps = base.layout.steps.map((s) => (s.id === l2.id ? { ...s, h: l1.h - 1 } : s));
    const r = result(run({ ...base, layout: { ...base.layout, steps } }), 'front-view');
    expect(r.ok).toBe(false);
    expect(r.detail).toContain(l2.id);
  });

  test('a one-line card has nothing to clear', () => {
    const one = build({ ...P0, line2: '' }, assets, 'blade', { strokeCheck: false });
    expect(one.layout.steps).toHaveLength(1);
    expect(result(one.checks, 'front-view').ok).toBe(true);
  });
});
