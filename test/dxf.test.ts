import { beforeAll, describe, expect, test } from 'vitest';
import { build, type Card } from '../src/core/build';
import { defaultParams } from '../src/core/model';
import { pieceDxf } from '../src/export/dxf';
import { TARGETS } from '../src/export/targets';
import { testFonts } from './helpers/fonts';

let card: Card;
beforeAll(() => {
  card = build(defaultParams('en-US'), { fonts: testFonts() }, 'blade', { strokeCheck: false });
}, 60_000);

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const pairs = (dxf: string) => dxf.split('\n').reduce<[string, string][]>((a, l, i, all) => (i % 2 === 0 ? [...a, [l.trim(), (all[i + 1] ?? '').trim()]] : a), []);

describe('pieceDxf', () => {
  let dxf = '';
  beforeAll(() => {
    dxf = pieceDxf(card.inner, TARGETS.silhouette);
  });
  test('strict R12: AC1009, no $INSUNITS, an LTYPE table defining CONTINUOUS, both layers (M4)', () => {
    expect(dxf).toMatch(/\$ACADVER\s+1\s+AC1009\b/);
    expect(dxf).not.toContain('$INSUNITS');
    expect(dxf).toMatch(/0\s+TABLE\s+2\s+LTYPE\s+70\s+1\s+0\s+LTYPE\s+2\s+CONTINUOUS\b/);
    // The line type is defined before the layers that use it.
    expect(dxf.indexOf('2\nLTYPE')).toBeLessThan(dxf.indexOf('2\nLAYER'));
    expect(dxf).toMatch(/2\s+CUT\b/);
    expect(dxf).toMatch(/2\s+SCORE\b/);
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
  });
  test('a perforated piece has no SCORE layer', () => {
    const perf = pieceDxf(card.inner, { ...TARGETS.silhouette, fold: 'perforate' });
    expect(perf).not.toMatch(/\bSCORE\b/);
    expect(perf).toMatch(/2\s+LAYER\s+70\s+1\b/);
  });
  test('one polyline per path', () => {
    const p = card.inner;
    const expected = p.outline.length + p.holes.reduce((n, h) => n + h.length, 0) + p.openCuts.length + p.folds.length;
    expect(count(dxf, /^POLYLINE$/gm)).toBe(expected);
    expect(count(dxf, /^SEQEND$/gm)).toBe(expected);
  });
  test('folds sit on SCORE when scoring and move to CUT when perforated', () => {
    const scoreLayerPolys = (d: string) => pairs(d).filter(([c, v], i, a) => c === '0' && v === 'POLYLINE' && a[i + 1][1] === 'SCORE').length;
    expect(scoreLayerPolys(dxf)).toBe(card.inner.folds.length);
    expect(scoreLayerPolys(pieceDxf(card.inner, { ...TARGETS.silhouette, fold: 'perforate' }))).toBe(0);
  });
  test('writes raw flat y (y up), not the SVG flip', () => {
    const piece = { ...card.jacket, outline: [], folds: [{ kind: 'valley' as const, path: [{ x: 5, y: 2 }, { x: 5, y: 40 }] }] };
    const v = pairs(pieceDxf(piece, TARGETS.silhouette));
    const ys = v.filter(([c]) => c === '20').map(([, n]) => Number(n));
    expect(ys.slice(0, 2)).toEqual([2, 40]);
  });
});

describe('cardDxf', () => {
  test('holds both pieces', async () => {
    const { cardDxf } = await import('../src/export/dxf');
    const n = (p: typeof card.inner) => p.outline.length + p.holes.reduce((a, h) => a + h.length, 0) + p.openCuts.length + p.folds.length;
    expect(count(cardDxf(card, TARGETS.silhouette), /^POLYLINE$/gm)).toBe(n(card.inner) + n(card.jacket));
  });
});
