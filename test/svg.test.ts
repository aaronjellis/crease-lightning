import { DOMParser } from '@xmldom/xmldom';
import { beforeAll, describe, expect, test } from 'vitest';
import { build, type Card } from '../src/core/build';
import { ATOMM_CUT, ATOMM_ENGRAVE } from '../src/core/constants';
import { defaultParams } from '../src/core/model';
import { perforate } from '../src/export/perforate';
import { bothSvg, paperColours, pieceColours, pieceSvg, withFoldStyle } from '../src/export/svg';
import { TARGETS, type TargetId } from '../src/export/targets';
import { testFonts } from './helpers/fonts';

let card: Card;
beforeAll(() => {
  card = build(defaultParams('en-US'), { fonts: testFonts() }, 'blade', { strokeCheck: false });
}, 60_000);

const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml') as unknown as Document;
const kids = (el: Element): Element[] => Array.from({ length: el.childNodes.length }, (_, i) => el.childNodes[i] as Element).filter((n) => n.nodeType === 1);
const group = (doc: Document, id: string): Element => kids(doc.documentElement).find((e) => e.getAttribute('id') === id)!;
const pathsOf = (g: Element) => kids(g).filter((e) => e.tagName === 'path');
const svgFor = (id: TargetId, foldStyle?: 'score' | 'perforate') => {
  const t = withFoldStyle(TARGETS[id], foldStyle ?? 'auto');
  return pieceSvg(card.inner, t, pieceColours(card, 'inner', t));
};

describe('targets', () => {
  test('table matches the spec', () => {
    expect(TARGETS.cricut).toMatchObject({ kind: 'blade', fold: 'score', palette: 'paper' });
    expect(TARGETS['xtool-c1']).toMatchObject({ kind: 'blade', fold: 'score', palette: 'paper' });
    expect(TARGETS.silhouette.files).toContain('dxf');
    expect(TARGETS['xtool-laser']).toMatchObject({ kind: 'laser', fold: 'perforate', palette: 'atomm' });
    expect(TARGETS.print).toMatchObject({ kind: 'print' });
  });
  test('foldStyle overrides the target default, auto does not', () => {
    expect(withFoldStyle(TARGETS.cricut, 'perforate').fold).toBe('perforate');
    expect(withFoldStyle(TARGETS['xtool-laser'], 'score').fold).toBe('score');
    expect(withFoldStyle(TARGETS.cricut, 'auto')).toBe(TARGETS.cricut);
  });
});

describe('structure', () => {
  test('parses, mm size matches viewBox, layers labelled', () => {
    const svg = svgFor('cricut');
    const root = parse(svg).documentElement;
    expect(root.getAttribute('width')).toBe(`${card.inner.widthMm}mm`);
    expect(root.getAttribute('height')).toBe(`${card.inner.heightMm}mm`);
    expect(root.getAttribute('viewBox')).toBe(`0 0 ${card.inner.widthMm} ${card.inner.heightMm}`);
    expect(root.getAttribute('xmlns:inkscape')).toBe('http://www.inkscape.org/namespaces/inkscape');
    const doc = parse(svg);
    for (const id of ['Cut', 'Score']) expect(group(doc, id).getAttribute('inkscape:label')).toBe(id);
  });
  test('every coordinate is a finite number', () => {
    for (const svg of [svgFor('cricut'), svgFor('xtool-laser'), bothSvg(card, TARGETS.cricut)]) {
      expect(svg).not.toMatch(/NaN|Infinity/);
    }
  });
  test('forbidden constructs are absent', () => {
    for (const id of ['cricut', 'xtool-laser'] as TargetId[]) {
      const svg = svgFor(id);
      for (const bad of ['<defs', '<use', 'transform', 'clipPath', 'mask', 'stroke-dasharray', '<style', 'style=', 'class=']) {
        expect(svg, bad).not.toContain(bad);
      }
      expect(svg).toContain('stroke-width="0.1"');
      expect(svg).toContain('fill="none"');
    }
  });
  test('folds are never closed paths, holes precede the outline', () => {
    const doc = parse(svgFor('cricut'));
    for (const p of pathsOf(group(doc, 'Score'))) expect(p.getAttribute('d')).not.toMatch(/Z/i);
    const cut = pathsOf(group(doc, 'Cut'));
    const closed = cut.map((p) => /Z/.test(p.getAttribute('d')!));
    const firstOpen = closed.indexOf(false);
    expect(cut.length).toBe(card.inner.holes.length + card.inner.openCuts.length + 1);
    // The outline is the last closed path; every hole comes before it.
    expect(closed.lastIndexOf(true)).toBe(cut.length - 1);
    expect(firstOpen).toBeGreaterThanOrEqual(card.inner.holes.length);
    expect(closed.slice(0, card.inner.holes.length).every(Boolean)).toBe(true);
  });
  test('y is flipped: y_out = heightMm - y', () => {
    const fold = card.inner.folds[0];
    const p0 = fold.path[0];
    const d = pathsOf(group(parse(svgFor('cricut')), 'Score'))[0].getAttribute('d')!;
    const m = /^M(-?[\d.]+) (-?[\d.]+)/.exec(d)!;
    expect(Number(m[1])).toBeCloseTo(p0.x, 3);
    expect(Number(m[2])).toBeCloseTo(card.inner.heightMm - p0.y, 3);
    expect(Math.abs(card.inner.heightMm - p0.y - p0.y)).toBeGreaterThan(0.5); // asymmetric, so the flip is observable
  });
  test('jacket: one outline, one score', () => {
    const t = TARGETS.cricut;
    const doc = parse(pieceSvg(card.jacket, t, pieceColours(card, 'jacket', t)));
    expect(pathsOf(group(doc, 'Cut')).length).toBe(1);
    expect(pathsOf(group(doc, 'Score')).length).toBe(card.jacket.folds.length);
  });
  test('both: pieces side by side with a 10 mm gap, unique ids', () => {
    const doc = parse(bothSvg(card, TARGETS.cricut));
    const root = doc.documentElement;
    expect(Number(root.getAttribute('width')!.replace('mm', ''))).toBeCloseTo(card.inner.widthMm + 10 + card.jacket.widthMm, 3);
    expect(Number(root.getAttribute('height')!.replace('mm', ''))).toBeCloseTo(Math.max(card.inner.heightMm, card.jacket.heightMm), 3);
    const ids = Array.from(doc.getElementsByTagName('g')).map((g) => g.getAttribute('id'));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['Inner-Cut', 'Inner-Score', 'Jacket-Cut', 'Jacket-Score']));
    const xs = Array.from(doc.getElementsByTagName('path')).flatMap((p) => Array.from(p.getAttribute('d')!.matchAll(/(-?[\d.]+) -?[\d.]+/g), (m) => Number(m[1])));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.001);
    expect(Math.max(...xs)).toBeLessThanOrEqual(Number(root.getAttribute('width')!.replace('mm', '')) + 0.001);
  });
});

describe('colours', () => {
  const strokes = (svg: string) => new Set(Array.from(svg.matchAll(/stroke="(#[0-9A-Fa-f]{6})"/g), (m) => m[1]));
  test('atomm palette uses only the two laser colours', () => {
    expect([...strokes(svgFor('xtool-laser'))].sort()).toEqual([ATOMM_CUT]);
    const sc = strokes(svgFor('xtool-laser', 'score'));
    expect([...sc].sort()).toEqual([ATOMM_CUT, ATOMM_ENGRAVE].sort());
  });
  test('cricut uses the paper colours', () => {
    const { cut, score } = paperColours(card, 'inner');
    expect(cut).toBe('#c8c8c8'); // R16: near-white paper cuts in light grey
    expect(score).toBe('#a6a6a6');
    expect([...strokes(svgFor('cricut'))].sort()).toEqual([cut, score].sort());
    const j = paperColours(card, 'jacket');
    expect(j.cut).toBe('#e8453c');
    expect(j.score).not.toBe(j.cut);
  });
});

describe('fold style', () => {
  test('xtool laser: red perforations in Cut, Score group empty', () => {
    const doc = parse(svgFor('xtool-laser'));
    expect(pathsOf(group(doc, 'Score')).length).toBe(0);
    const cut = pathsOf(group(doc, 'Cut'));
    expect(cut.length).toBe(card.inner.holes.length + card.inner.openCuts.length + card.inner.folds.length + 1);
    expect(cut.every((p) => p.getAttribute('stroke') === ATOMM_CUT)).toBe(true);
    const perf = cut.filter((p) => (p.getAttribute('d')!.match(/M/g) ?? []).length > 1);
    expect(perf.length).toBeGreaterThan(0);
  });
  test('cricut: solid folds in Score', () => {
    const score = pathsOf(group(parse(svgFor('cricut')), 'Score'));
    expect(score.length).toBe(card.inner.folds.length);
    for (const p of score) expect((p.getAttribute('d')!.match(/M/g) ?? []).length).toBe(1);
  });
  test('cricut with foldStyle perforate: perforations in Cut', () => {
    const doc = parse(svgFor('cricut', 'perforate'));
    expect(pathsOf(group(doc, 'Score')).length).toBe(0);
    expect(pathsOf(group(doc, 'Cut')).length).toBe(card.inner.holes.length + card.inner.openCuts.length + card.inner.folds.length + 1);
  });
  test('xtool laser with foldStyle score: blue engrave in Score', () => {
    const score = pathsOf(group(parse(svgFor('xtool-laser', 'score')), 'Score'));
    expect(score.length).toBe(card.inner.folds.length);
    expect(score.every((p) => p.getAttribute('stroke') === ATOMM_ENGRAVE)).toBe(true);
  });
});

describe('perforate', () => {
  test('10 mm line gives dashes summing to 7 mm, starting 0.5 mm in', () => {
    const dashes = perforate([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    const len = dashes.map((d) => Math.hypot(d[1].x - d[0].x, d[1].y - d[0].y));
    expect(dashes.length).toBe(3);
    expect(len.reduce((a, b) => a + b, 0)).toBeCloseTo(7, 6);
    expect(dashes[0][0].x).toBeCloseTo(0.5, 6);
    expect(dashes[2][1].x).toBeCloseTo(9.5, 6);
    expect(dashes[1][0].x - dashes[0][1].x).toBeCloseTo(1, 6);
  });
  test('follows bends and keeps dashes on the path', () => {
    const dashes = perforate([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    const total = dashes.flatMap((d) => d.slice(1).map((q, i) => Math.hypot(q.x - d[i].x, q.y - d[i].y))).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(20 - Math.round(20 / 3), 6);
    expect(dashes.some((d) => d.length > 2)).toBe(true);
  });
  test('a path shorter than a bridge stays whole', () => {
    expect(perforate([{ x: 0, y: 0 }, { x: 0.8, y: 0 }]).length).toBe(1);
  });
});

describe('snapshot', () => {
  test('Birthday default, cricut and xtool laser', () => {
    expect(svgFor('cricut')).toMatchSnapshot();
    expect(svgFor('xtool-laser')).toMatchSnapshot();
  });
});
