import { describe, expect, test } from 'vitest';
import {
  area,
  bounds,
  difference,
  grow,
  intersect,
  offset,
  outerCount,
  union,
  type Poly,
} from '@kerfuffle/engine/geom';
import type { TextFont } from '@kerfuffle/engine/hbFont';
import { buildBlock, buildIconBlock, layoutGlyphs, measureLine, normaliseText, thinArea } from '../src/core/text';
import { BRIDGE_MM, TRACK_OVERLAP_MM } from '../src/core/constants';
import { alfa, arvo, rokkitt } from './helpers/fonts';

const FONTS = [
  ['alfa', alfa],
  ['arvo', arvo],
  ['rokkitt', rokkitt],
] as const;
const SPACINGS = ['tight', 'normal', 'loose'] as const;
// The brief's cases, then the rest of the spec's Punctuation table: en dash, curly and straight
// quotes, semicolon, period, and the one-piece symbols.
const BRIEF_PUNCTUATION = ['MARY-KATE', "O'BRIEN", 'SAM & ALEX', 'HAPPY 40TH!', 'CONGRATS, GRAD', 'WHY?', 'RE: US', 'HI\u2014YOU', 'ijij'];
const PUNCTUATION = [...BRIEF_PUNCTUATION, '1\u20132 \u201CHI\u201D', 'O\u2019NEIL "JO"', 'A; B. C', '3/4 #1 @ME'];

const rect = (x: number, y: number, w: number, h: number): Poly => [
  [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ],
];

/** The widest single piece of an overlap (specks under 0.01 mm² ignored), the weld tight tracking sizes. */
const widestPiece = (poly: Poly): number =>
  Math.max(0, ...poly.filter((c) => area([c]) > 0.01).map((c) => bounds([c])!.w));

describe('normaliseText', () => {
  test('emoji are dropped and named', () => {
    expect(normaliseText('HI 🎉', true, alfa, arvo)).toEqual({ text: 'HI ', dropped: ['🎉'], needsFallback: false });
  });

  test('all caps upper-cases; off keeps the case', () => {
    expect(normaliseText('Sam', true, alfa, arvo).text).toBe('SAM');
    expect(normaliseText('Sam', false, alfa, arvo).text).toBe('Sam');
  });

  test('curly quotes stay when the font has them and turn straight when it does not', () => {
    expect(alfa.hasChar('\u2019')).toBe(true);
    expect(normaliseText('O\u2019BRIEN', true, alfa, arvo).text).toBe('O\u2019BRIEN');
    const noCurly: TextFont = { ...alfa, hasChar: (ch) => !'\u2018\u2019\u201C\u201D'.includes(ch) && alfa.hasChar(ch) };
    expect(normaliseText('\u201CO\u2019BRIEN\u201D', true, noCurly, noCurly)).toEqual({
      text: '"O\'BRIEN"',
      dropped: [],
      needsFallback: false,
    });
  });

  test('a character only the fallback has sets needsFallback', () => {
    const noE: TextFont = { ...alfa, hasChar: (ch) => ch !== 'É' && alfa.hasChar(ch) };
    expect(normaliseText('RENÉE', true, noE, arvo)).toEqual({ text: 'RENÉE', dropped: [], needsFallback: true });
  });

  test('characters no font has are dropped once each, Latin-only fonts drop CJK', () => {
    expect(normaliseText('A🎉B🎉C中', true, alfa, arvo)).toEqual({ text: 'ABC', dropped: ['🎉', '中'], needsFallback: false });
  });
});

describe('measureLine', () => {
  test('top and descender scale with cap height; caps have no descender', () => {
    const m = measureLine('HAPPY', alfa, 'tight');
    expect(m.topPerCap).toBeCloseTo(1, 1);
    expect(m.descPerCap).toBe(0);
    expect(m.inkWPerCap).toBeGreaterThan(3);
    expect(measureLine('Gyp', alfa, 'tight').descPerCap).toBeGreaterThan(0.2);
  });

  test('tight is narrower than normal, normal narrower than loose', () => {
    for (const [, font] of FONTS) {
      const w = SPACINGS.map((sp) => measureLine('HAPPY BIRTHDAY', font, sp).inkWPerCap);
      expect(w[0]).toBeLessThan(w[1]);
      expect(w[1]).toBeLessThan(w[2]);
    }
  });

  test('buildBlock ink width matches measureLine at the same cap height', () => {
    const m = measureLine('HAPPY BIRTHDAY', rokkitt, 'tight', 11);
    const b = buildBlock('HAPPY BIRTHDAY', rokkitt, 11, 'tight', 2);
    expect(b.inkW).toBeCloseTo(11 * m.inkWPerCap, 6);
  });

  test('empty text measures zero', () => {
    expect(measureLine('', alfa, 'tight')).toEqual({ inkWPerCap: 0, topPerCap: 0, descPerCap: 0 });
  });
});

describe('buildBlock', () => {
  const b = buildBlock('HAPPY', alfa, 12, 'tight', 2);

  test('plinth is at least 3 mm and swallows descenders', () => {
    expect(bounds(b.plinth)!.h).toBeCloseTo(3, 2);
    const g = buildBlock('Gyp', alfa, 12, 'tight', 2);
    const desc = 12 * measureLine('Gyp', alfa, 'tight').descPerCap;
    expect(desc).toBeGreaterThan(3);
    expect(bounds(g.plinth)!.h).toBeGreaterThan(3);
    expect(bounds(g.plinth)!.h).toBeCloseTo(desc, 3);
    // The descenders end on P, inside the plinth.
    expect(bounds(g.letters)!.y).toBeCloseTo(0, 2);
  });

  test('plinth spans the ink from left to right, offset c inside the window', () => {
    const p = bounds(b.plinth)!;
    expect(p.x).toBeCloseTo(2, 6);
    expect(p.w).toBeCloseTo(b.inkW, 6);
    const l = bounds(b.letters)!;
    expect(l.x).toBeCloseTo(2, 2);
    expect(l.w).toBeCloseTo(b.inkW, 2);
  });

  test('window bottom is exactly on P and never below', () => {
    expect(bounds(b.window)!.y).toBe(0);
    expect(bounds(b.letters)!.y).toBeGreaterThanOrEqual(0);
    expect(bounds(b.plinth)!.y).toBe(0);
  });

  test('window is inkW + 2c wide and s + c tall, with rounded top corners', () => {
    const w = bounds(b.window)!;
    expect(w.x).toBe(0);
    expect(w.w).toBeCloseTo(b.inkW + 4, 6);
    expect(w.h).toBeCloseTo(b.s + 2, 6);
    const square = w.w * w.h;
    // Two quarter-circle corners of radius 2 are cut away: 2 · (4 − π) ≈ 1.717 mm².
    expect(square - area(b.window)).toBeCloseTo(2 * (4 - Math.PI), 1);
    // Bottom corners are square.
    const pts = b.window.flat();
    expect(pts.some((p) => p.x === 0 && p.y === 0)).toBe(true);
    expect(pts.some((p) => Math.abs(p.x - w.w) < 1e-9 && p.y === 0)).toBe(true);
  });

  test('letters and plinth sit inside the window', () => {
    for (const blk of [b, buildBlock('Gyp', arvo, 12, 'loose', 2), buildBlock('CONGRATS, GRAD', rokkitt, 12, 'normal', 2)]) {
      expect(area(difference(union([blk.letters, blk.plinth]), blk.window))).toBeLessThan(1e-3);
    }
  });

  test('s fits under the cross-bar rule input', () => {
    expect(b.s).toBeCloseTo(3 + 12 * measureLine('HAPPY', alfa, 'tight').topPerCap, 3);
    expect(b.capMm).toBe(12);
    // The tallest letter reaches s.
    expect(bounds(b.letters)!.y + bounds(b.letters)!.h).toBeCloseTo(b.s, 2);
  });

  test('tight tracking welds each word', () => {
    for (const [, font] of FONTS) {
      for (const text of ['HAPPY BIRTHDAY', 'CONGRATS GRAD', 'MARY-KATE', 'Love you']) {
        const lay = layoutGlyphs(text, font, 12, 'tight');
        const blk = buildBlock(text, font, 12, 'tight', 2);
        const body = union([blk.letters, blk.plinth]);
        const words: (typeof lay.glyphs)[] = [[]];
        for (const g of lay.glyphs) {
          if (g.space) {
            if (words[words.length - 1].length) words.push([]);
            expect(g.adjustEm).toBe(0); // spaces are never pulled
          } else words[words.length - 1].push(g);
        }
        for (const word of words.filter((w) => w.length > 0)) {
          // Each adjacent pair overlaps by at least 0.8 mm, or was pulled the full 0.25 em.
          for (let i = 0; i + 1 < word.length; i++) {
            const [a, c] = [word[i], word[i + 1]];
            const overlap = bounds(intersect(a.poly, c.poly))?.w ?? 0;
            const capped = a.adjustEm <= -0.25 + 1e-9;
            expect(overlap >= TRACK_OVERLAP_MM - 1e-3 || capped, `${text} ${a.char}${c.char}`).toBe(true);
            expect(a.adjustEm).toBeGreaterThanOrEqual(-0.25 - 1e-9);
            expect(a.adjustEm).toBeLessThanOrEqual(0);
            // The pull is the smallest that works: 0.01 em less and the pair no longer overlaps enough.
            if (a.adjustEm < 0 && !capped) {
              const eased = intersect(a.poly, c.poly.map((r) => r.map((p) => ({ x: p.x + 0.01 * lay.emMm, y: p.y }))));
              expect(widestPiece(eased), `${text} ${a.char}${c.char} eased`).toBeLessThan(TRACK_OVERLAP_MM);
            }
          }
          // The word's letters and its slice of plinth are one outer contour.
          const x0 = Math.min(...word.map((g) => bounds(g.poly)!.x));
          const x1 = Math.max(...word.map((g) => bounds(g.poly)!.x + bounds(g.poly)!.w));
          const slice = intersect(body, rect(x0 + 0.01, -1, x1 - x0 - 0.02, 100));
          expect(outerCount(slice), `${text} word at ${x0}`).toBe(1);
        }
      }
    }
  });

  test('normal uses the font spacing and loose adds 0.05 em per letter', () => {
    const n = layoutGlyphs('HAPPY', alfa, 12, 'normal');
    expect(n.glyphs.every((g) => g.adjustEm === 0)).toBe(true);
    const l = layoutGlyphs('HAPPY', alfa, 12, 'loose');
    const dx = bounds(l.glyphs[4].poly)!.x - bounds(n.glyphs[4].poly)!.x;
    expect(dx).toBeCloseTo(4 * 0.05 * n.emMm, 3);
  });

  test.each(PUNCTUATION.map((t) => [t]))('%s cuts as one piece per word attached to the plinth', (t) => {
    for (const [, font] of FONTS) {
      for (const sp of SPACINGS) {
        const blk = buildBlock(t, font, 12, sp, 2);
        expect(outerCount(union([blk.letters, blk.plinth])), `${t} ${sp}`).toBe(1);
        expect(blk.bridges === 0, `${t} ${sp} bars`).toBe(blk.bars.length === 0);
      }
    }
  });

  test('loose spacing needs bridges for floating punctuation', () => {
    for (const [, font] of FONTS) {
      expect(buildBlock('ijij', font, 12, 'loose', 2).bridges).toBeGreaterThanOrEqual(2);
      expect(buildBlock('WHY?', font, 12, 'loose', 2).bridges).toBeGreaterThanOrEqual(1);
    }
  });

  test('every bridge is at least 1.5 mm wide', () => {
    let total = 0;
    for (const t of BRIEF_PUNCTUATION) {
      for (const [name, font] of FONTS) {
        for (const sp of SPACINGS) {
          const blk = buildBlock(t, font, 12, sp, 2);
          total += blk.bridges;
          expect(thinArea(union([blk.letters, blk.plinth]), BRIDGE_MM), `${t} ${name} ${sp}`).toBeLessThan(0.05);
        }
      }
    }
    expect(total).toBeGreaterThan(10);
  }, 60_000); // 81 openings of a whole line take about 10 s

  test('slots narrower than 1 mm are filled; no hole left vanishes at -0.5 mm', () => {
    for (const t of PUNCTUATION) {
      for (const [name, font] of FONTS) {
        for (const sp of SPACINGS) {
          const blk = buildBlock(t, font, 12, sp, 2);
          for (const hole of union([blk.letters, blk.plinth]).filter((c) => area([c]) < 0)) {
            const h = [[...hole].reverse()];
            expect(area(offset(h, -0.5, 0.05)), `${t} ${name} ${sp} hole at ${JSON.stringify(bounds(h))}`).toBeGreaterThan(1e-6);
          }
        }
      }
    }
  });

  test('BOAT keeps its counters', () => {
    for (const [name, font] of FONTS) {
      for (const sp of SPACINGS) {
        const blk = buildBlock('BOAT', font, 12, sp, 2);
        const holes = union([blk.letters, blk.plinth]).filter((c) => area([c]) < 0);
        // B has two counters, O one, A one.
        expect(holes.length, `${name} ${sp}`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  describe('bridge type per Punctuation row', () => {
    const solid = (blk: ReturnType<typeof buildBlock>) => union([blk.letters, blk.plinth]);
    const plinthTop = (blk: ReturnType<typeof buildBlock>) => bounds(blk.plinth)!.h;

    test("O'BRIEN: the apostrophe gets a short sideways bar at the top", () => {
      for (const [name, font] of FONTS) {
        for (const sp of ['normal', 'loose'] as const) {
          const blk = buildBlock("O'BRIEN", font, 12, sp, 2);
          expect(blk.bridgeBars.length, `${name} ${sp}`).toBeGreaterThan(0);
          for (const { dir, bar } of blk.bridgeBars) {
            expect(dir, `${name} ${sp}`).not.toBe('down');
            const b = bounds(bar)!;
            expect(b.y, `${name} ${sp}`).toBeGreaterThan(plinthTop(blk) + 0.5 * 12);
            expect(b.w, `${name} ${sp}`).toBeLessThan(3); // short
          }
        }
      }
    });

    test('ijij in Loose: every dot drops a vertical bar to its stem', () => {
      for (const [name, font] of FONTS) {
        const blk = buildBlock('ijij', font, 12, 'loose', 2);
        expect(blk.bridgeBars.length, name).toBe(4);
        for (const { dir, bar } of blk.bridgeBars) {
          expect(dir, name).toBe('down');
          // It lands on the stem at x-height, not on the plinth.
          expect(bounds(bar)!.y, name).toBeGreaterThan(plinthTop(blk) + 0.3 * 12);
        }
      }
    });

    test.each([['WHY?'], ['HAPPY 40TH!']])('%s: a vertical bar from the bar to the dot', (t) => {
      for (const [name, font] of FONTS) {
        for (const sp of ['normal', 'loose'] as const) {
          const blk = buildBlock(t, font, 12, sp, 2);
          const last = layoutGlyphs(t, font, 12, sp, 2).glyphs.at(-1)!;
          const mark = bounds(last.poly)!;
          expect(blk.bridgeBars.length, `${name} ${sp}`).toBe(1);
          const { dir, bar } = blk.bridgeBars[0];
          const b = bounds(bar)!;
          expect(dir, `${name} ${sp}`).toBe('down');
          // Inside the mark's own width, landing on the dot rather than the plinth.
          expect(b.x).toBeGreaterThanOrEqual(mark.x - 0.01);
          expect(b.x + b.w).toBeLessThanOrEqual(mark.x + mark.w + 0.01);
          expect(b.y, `${name} ${sp}`).toBeGreaterThan(plinthTop(blk) + 1);
        }
      }
    });

    test('a hyphen stretches sideways to touch both neighbours when they are within 3 mm', () => {
      for (const [name, font] of FONTS) {
        const blk = buildBlock('HI-HO', font, 12, 'normal', 2);
        expect(blk.bridgeBars.map((b) => b.dir).sort(), name).toEqual(['left', 'right']);
      }
    });

    test('MARY-KATE in Normal: the hyphen stretches to K; on the Y side, with no neighbour within 3 mm, it drops to the plinth', () => {
      for (const [name, font] of FONTS) {
        const blk = buildBlock('MARY-KATE', font, 12, 'normal', 2);
        const dirs = blk.bridgeBars.map((b) => b.dir).sort();
        expect(dirs, name).toEqual(['down', 'right']);
        const down = bounds(blk.bridgeBars.find((b) => b.dir === 'down')!.bar)!;
        expect(down.y, name).toBeLessThan(plinthTop(blk)); // reaches into the plinth
        const hyphen = bounds(layoutGlyphs('MARY-KATE', font, 12, 'normal', 2).glyphs[4].poly)!;
        const right = bounds(blk.bridgeBars.find((b) => b.dir === 'right')!.bar)!;
        // The stretch runs at the hyphen's height, from its right end.
        expect(right.y).toBeGreaterThanOrEqual(hyphen.y - 0.1);
        expect(right.y + right.h).toBeLessThanOrEqual(hyphen.y + hyphen.h + 0.1);
        expect(right.x).toBeLessThan(hyphen.x + hyphen.w);
      }
    });

    test('CONGRATS, GRAD: the comma merges into the plinth with no bar', () => {
      for (const [name, font] of FONTS) {
        for (const sp of SPACINGS) {
          const blk = buildBlock('CONGRATS, GRAD', font, 12, sp, 2);
          expect(blk.bridges, `${name} ${sp}`).toBe(0);
          const comma = layoutGlyphs('CONGRATS, GRAD', font, 12, sp, 2).glyphs.find((g) => g.char === ',')!;
          expect(area(intersect(comma.poly, blk.plinth)), `${name} ${sp}`).toBeGreaterThan(0.1);
          expect(outerCount(solid(blk))).toBe(1);
        }
      }
    });
  });

  test('waste is window minus letters and plinth', () => {
    for (const blk of [b, buildBlock("O'BRIEN", arvo, 12, 'loose', 2)]) {
      const solid = union([blk.letters, blk.plinth]);
      expect(area(blk.waste)).toBeCloseTo(area(blk.window) - area(intersect(blk.window, solid)), 1);
      expect(area(intersect(blk.waste, solid))).toBeLessThan(1e-3);
      expect(area(blk.waste)).toBeGreaterThan(0);
    }
  });

  test('empty text builds an empty block without throwing', () => {
    const e = buildBlock('', alfa, 12, 'tight', 2);
    expect(e.inkW).toBe(0);
    expect(e.letters).toEqual([]);
    expect(bounds(e.window)!.w).toBeCloseTo(4, 6);
  });
});

describe('buildIconBlock', () => {
  test('stands the icon on a 3 mm plinth inside the window', () => {
    const square = rect(0, 0, 0.8, 1);
    const blk = buildIconBlock(square, 10, 2);
    expect(bounds(blk.letters)).toMatchObject({ x: 2, w: 8 });
    expect(bounds(blk.letters)!.h).toBeCloseTo(10, 2);
    expect(bounds(blk.plinth)!.h).toBeCloseTo(3, 6);
    expect(blk.s).toBeCloseTo(13, 6);
    expect(bounds(blk.window)!.w).toBeCloseTo(12, 6);
    expect(bounds(blk.window)!.y).toBe(0);
  });

  test('an icon in two pieces is bridged into one', () => {
    const twoPieces = union([rect(0, 0, 1, 0.5), rect(0.3, 0.7, 0.4, 0.3)]);
    const blk = buildIconBlock(twoPieces, 10, 2);
    expect(outerCount(union([blk.letters, blk.plinth]))).toBe(1);
    expect(blk.bridges).toBe(1);
  });
});

describe('thinArea', () => {
  test('a stroke thinner than the minimum counts in full', () => {
    expect(thinArea(rect(0, 0, 10, 1), 1.5)).toBeCloseTo(10, 0);
  });

  test('corner slivers do not count', () => {
    expect(thinArea(rect(0, 0, 5, 5), 1.5)).toBeLessThan(0.05);
  });

  test('square slab text counts nothing', () => {
    const blk = buildBlock('HAPPY', alfa, 12, 'tight', 2);
    expect(thinArea(union([blk.letters, blk.plinth]), 1.5)).toBeLessThan(0.05);
  });

  test('a 1 mm bar joined to a block counts', () => {
    expect(thinArea(union([rect(0, 0, 6, 6), rect(6, 2, 5, 1)]), 1.5)).toBeGreaterThan(0.05);
  });

  test("flags a glyph's own thin stroke: Rokkitt Black's @ ring is about 1.1 mm at 12 mm", () => {
    const blk = buildBlock('@', rokkitt, 12, 'normal', 2);
    const solid = union([blk.letters, blk.plinth]);
    expect(thinArea(solid, 1.5)).toBeGreaterThan(5);
    expect(thinArea(solid, 1.0)).toBeLessThan(0.05);
  });

  // The review's probes: thin welds, necks and spurs that must fail a 0.05 mm² threshold.
  const block = rect(0, 0, 6, 6);
  test.each([0.05, 0.1, 0.3])('two blocks welded corner to corner by %s mm count', (o) => {
    const weld = union([block, rect(6 - o, 6 - o, 6, 6)]);
    expect(outerCount(weld)).toBe(1);
    expect(thinArea(weld, 1.5)).toBeGreaterThan(0.05);
  });
  test.each([
    [0.3, 0.08],
    [0.3, 0.2],
    [0.5, 0.08],
    [1.0, 0.08],
    [0.5, 0.19],
  ])('a neck %s mm long and %s mm wide between two blocks counts', (len, w) => {
    const neck = union([block, rect(5.99, 3 - w / 2, len + 0.02, w), rect(6 + len, 0, 6, 6)]);
    expect(outerCount(neck)).toBe(1);
    expect(thinArea(neck, 1.5)).toBeGreaterThan(0.05);
  });
  test.each([0.1, 0.15, 0.19])('a 10 mm spur %s mm wide counts', (w) => {
    expect(thinArea(union([block, rect(5.99, 3, 10, w)]), 1.5)).toBeGreaterThan(0.05);
  });

  test('a 0.8 mm neck between two blocks counts', () => {
    // Shorter than 2 × minStroke, so it counts because the opening splits the shape there.
    const neck = union([rect(0, 0, 6, 6), rect(5.9, 2.6, 1.2, 0.8), rect(7, 0, 6, 6)]);
    expect(thinArea(neck, 1.5)).toBeGreaterThan(0.05);
  });
});
