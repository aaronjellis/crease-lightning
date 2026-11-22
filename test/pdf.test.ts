import { beforeAll, describe, expect, test } from 'vitest';
import { build, type Card } from '../src/core/build';
import { FOLD_STEPS } from '../src/core/foldSteps';
import { defaultParams } from '../src/core/model';
import { howToPdf, mapPoint, pageFor, printPdf } from '../src/export/pdf';
import { TARGETS } from '../src/export/targets';
import { testFonts } from './helpers/fonts';

let card: Card;
beforeAll(() => {
  card = build(defaultParams('en-US'), { fonts: testFonts() }, 'blade', { strokeCheck: false });
}, 60_000);

const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b);
const pages = (b: Uint8Array) => (text(b).match(/\/Type\s*\/Page\b/g) ?? []).length;

describe('printPdf', () => {
  test('is a 2-page PDF on 5x7', () => {
    const pdf = printPdf(card);
    expect(text(pdf).startsWith('%PDF')).toBe(true);
    expect(pages(pdf)).toBe(2);
  });
  test('paper by size, landscape when wider than tall', () => {
    expect(pageFor('5x7', 500, 100)).toMatchObject({ w: 279.4, h: 215.9 });
    expect(pageFor('a2', 100, 500)).toMatchObject({ w: 215.9, h: 279.4 });
    expect(pageFor('a6', 100, 200)).toMatchObject({ w: 210, h: 297 });
    expect(pageFor('a5', 300, 200)).toMatchObject({ w: 420, h: 297 });
  });
  test('maps flat points 1:1, centred, y flipped like the SVG', () => {
    const page = pageFor('5x7', 254, 178);
    const piece = { widthMm: 254, heightMm: 178 };
    const lo = mapPoint(piece, page, { x: 0, y: 0 });
    const hi = mapPoint(piece, page, { x: 254, y: 178 });
    expect(hi.x - lo.x).toBeCloseTo(254);
    expect(lo.y - hi.y).toBeCloseTo(178);
    // flat y = 0 (bottom of the sheet) lands lower on the page than y = height
    expect(lo.y).toBeGreaterThan(hi.y);
    expect((lo.x + hi.x) / 2).toBeCloseTo(page.w / 2);
    expect((lo.y + hi.y) / 2).toBeCloseTo(page.h / 2);
  });
});

describe('howToPdf', () => {
  test('is a PDF; text only is one page, images add pages', () => {
    const t = howToPdf(card, TARGETS.cricut);
    expect(text(t).startsWith('%PDF')).toBe(true);
    expect(pages(t)).toBe(1);
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    const withImg = howToPdf(card, TARGETS.cricut, [{ step: FOLD_STEPS[0].id, png }]);
    expect(pages(withImg)).toBe(2);
  });
});

describe('target steps and fold steps', () => {
  test('exact copy', () => {
    expect(TARGETS.cricut.steps).toEqual([
      'Upload `<name>-both.svg` in Design Space.',
      'Select the Score layer and change Operation to Score.',
      'Select all and click Attach.',
      'Click Make it. A5 cards need a 12 × 24 in mat.',
      'Crease every score with the edge of a credit card.',
    ]);
    expect(TARGETS['xtool-c1'].steps.slice(0, 3)).toEqual([
      "Open `<name>-both.svg` in xTool's software.",
      'Set the Score layer to Score and the Cut layer to Cut.',
      'Cut the inner sheet and the jacket on their own card colours.',
    ]);
    expect(TARGETS['xtool-laser'].steps.slice(0, 2)).toEqual([
      'Open the SVGs in xTool Studio. Red lines cut, including the short fold perforations.',
      'Run a test cut on scrap card first.',
    ]);
    expect(TARGETS.silhouette.steps.slice(0, 2)).toEqual(['Open `<name>.dxf` in Silhouette Studio.', 'Set the SCORE layer to a light pass or the scoring tool.']);
    expect(TARGETS.print.steps.slice(0, 2)).toEqual([
      'Print `<name>-print.pdf` at 100%. Check the 50 mm square.',
      'Cut solid lines with a craft knife. Score dashed lines with a dry pen and a ruler.',
    ]);
    for (const t of Object.values(TARGETS)) expect(t.steps.at(-1)).toBe('Crease every score with the edge of a credit card.');
  });
  test('fold steps', () => {
    expect(FOLD_STEPS.map((s) => s.text)).toEqual([
      'Fold the card in half along the spine.',
      'Open to 90° and push each strip toward you until it stands.',
      'Crease every fold with the edge of a credit card.',
      'Glue the inner sheet into the jacket. Keep glue off the strips and their openings.',
    ]);
    expect(FOLD_STEPS.map((s) => s.highlight)).toEqual(['spine', 'strips', 'strips', 'glue']);
  });
});
