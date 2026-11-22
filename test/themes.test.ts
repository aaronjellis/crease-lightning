import { describe, expect, test } from 'vitest';
import { area, bounds, intersect, offset, outerCount, scale, union, type Poly, type Pt } from '@kerfuffle/engine/geom';
import { applyTheme, BIRTHDAY_DEFAULTS, defaultParams, type ThemeDefaults, type ThemeId } from '../src/core/model';
import { fitLayout } from '../src/core/fit';
import { testFonts } from './helpers/fonts';
import { MIN_STROKE_BLADE_MM, PLINTH_MIN_MM } from '../src/core/constants';
import { buildIconBlock, thinArea } from '../src/core/text';
import { ICONS, THEMES, iconById, loadIcon, themeById } from '../src/themes';

const accentIds = new Set(THEMES.flatMap((t) => t.accents));
/** How many holes are narrower than 1 mm: those that vanish under a 0.5 mm inward offset. */
const narrowHoles = (p: Poly): number =>
  p.filter((c) => !outerCount([c])).filter((h) => area(offset([[...h].reverse()], -0.5, 0.05)) <= 1e-6).length;
const atMin = (id: string): Poly => {
  const i = iconById(id);
  return scale(i.poly, i.minHeightMm);
};

describe('icons', () => {
  test.each(ICONS.map((i) => i.id))('%s is one piece at its minimum height and at 30 mm, 1 mm tall, bottom on y = 0', (id) => {
    const i = iconById(id);
    const b = bounds(i.poly)!;
    expect(b.h).toBeCloseTo(1, 3);
    expect(b.y).toBeCloseTo(0, 3);
    expect(b.x).toBeCloseTo(0, 3);
    expect(outerCount(atMin(id))).toBe(1);
    expect(outerCount(scale(i.poly, 30))).toBe(1);
    expect(i.source).not.toBe('');
    expect(i.licence).not.toBe('');
  });

  test.each(ICONS.map((i) => i.id))('%s has no stroke under 1.5 mm at its minimum height', (id) => {
    expect(thinArea(atMin(id), MIN_STROKE_BLADE_MM)).toBeLessThan(0.05);
  });

  test.each(ICONS.map((i) => i.id))('%s has no hole narrower than 1 mm at its minimum height', (id) => {
    expect(narrowHoles(atMin(id))).toBe(0);
  });

  test('the hole check counts a 0.6 mm slot but not a 3 mm hole', () => {
    const box = (x: number, y: number, w: number, h: number): Pt[] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
    const withHole = (hole: Pt[]): Poly => [box(0, 0, 20, 20), [...hole].reverse()];
    expect(narrowHoles(withHole(box(5, 5, 0.6, 10)))).toBe(1);
    expect(narrowHoles(withHole(box(5, 5, 3, 3)))).toBe(0);
  });

  test.each(ICONS.map((i) => i.id))('%s welds to a plinth into one piece', (id) => {
    const i = iconById(id);
    const blk = buildIconBlock(i.poly, i.minHeightMm, 2);
    expect(outerCount(union([blk.letters, blk.plinth]))).toBe(1);
  });

  test.each([...accentIds])('accent %s has a base at least 3 mm wide at its minimum height', (id) => {
    const p = atMin(id);
    const b = bounds(p)!;
    const strip: Poly = [[{ x: b.x - 1, y: 0 }, { x: b.x + b.w + 1, y: 0 }, { x: b.x + b.w + 1, y: 0.3 }, { x: b.x - 1, y: 0.3 }]];
    const foot = bounds(intersect(p, strip))!;
    expect(foot.w).toBeGreaterThanOrEqual(PLINTH_MIN_MM);
  });

  test('loadIcon flips y so the SVG top ends up at the top', () => {
    const icon = loadIcon('<svg viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="2"/><rect x="0" y="0" width="2" height="10"/></svg>', {
      id: 't', minHeightMm: 1, source: 's', licence: 'l',
    });
    const top = bounds(intersect(icon.poly, [[{ x: -1, y: 0.9 }, { x: 2, y: 0.9 }, { x: 2, y: 1 }, { x: -1, y: 1 }]]))!;
    expect(top.w).toBeCloseTo(1, 2);
  });

  test('unknown ids throw', () => {
    expect(() => iconById('nope')).toThrow();
    expect(() => themeById('nope' as ThemeId)).toThrow();
  });
});

describe('themes', () => {
  test('every accent and motif icon resolves, and motif sizes respect the icon minimum', () => {
    for (const t of THEMES) {
      for (const a of t.accents) expect(iconById(a)).toBeTruthy();
      for (const m of t.motifs) {
        const i = iconById(m.icon);
        expect(m.minMm).toBeGreaterThanOrEqual(i.minHeightMm);
        expect(m.maxMm).toBeGreaterThanOrEqual(m.minMm);
        expect(m.count).toBeGreaterThan(0);
      }
    }
  });

  test('motif icons have no holes: an island inside a cut-through would fall out of the page', () => {
    for (const id of new Set(THEMES.flatMap((t) => t.motifs.map((m) => m.icon)))) {
      expect(iconById(id).poly.filter((c) => !outerCount([c])), id).toEqual([]);
    }
  });

  test('Birthday', () => {
    const t = themeById('birthday');
    expect(t.lines).toEqual(['HAPPY BIRTHDAY', 'SAM']);
    expect(t.font).toBe('Arvo');
    expect(t.accents).toEqual(['balloon', 'cake']);
    expect(t.motifs.length).toBeGreaterThan(0);
  });

  test('Blank has no accents and no motifs', () => {
    const t = themeById('blank');
    expect(t.accents).toEqual([]);
    expect(t.motifs).toEqual([]);
    expect(t.lines).toEqual(['HELLO', '']);
    expect(t.font).toBe('Arvo');
    expect(t.colours).toEqual({ inner: '#ffffff', jacket: '#2f5d8a' });
  });

  test('every theme is a ThemeDefaults, and BIRTHDAY_DEFAULTS matches the Birthday theme', () => {
    const defaults: ThemeDefaults[] = THEMES;
    expect(defaults.length).toBe(THEMES.length);
    const b = themeById('birthday');
    expect(BIRTHDAY_DEFAULTS).toEqual({ id: b.id, lines: b.lines, font: b.font, colours: b.colours });
  });
});

describe('launch themes', () => {
  const EXPECTED: Record<string, { lines: [string, string]; jacket: string; inner?: string }> = {
    birthday: { lines: ['HAPPY BIRTHDAY', 'SAM'], jacket: '#e8453c' },
    anniversary: { lines: ['HAPPY ANNIVERSARY', 'ALEX & SAM'], jacket: '#8c2f39' },
    wedding: { lines: ['JUST MARRIED', 'ALEX & SAM'], jacket: '#7d9a86' },
    graduation: { lines: ['CONGRATS GRAD', 'CLASS OF 2027'], jacket: '#1f3a5f' },
    'baby-girl': { lines: ['WELCOME', 'BABY GIRL'], jacket: '#f4a6c0', inner: '#ffffff' },
    'baby-boy': { lines: ['WELCOME', 'BABY BOY'], jacket: '#8fc1e8', inner: '#ffffff' },
    christmas: { lines: ['MERRY CHRISTMAS', 'LOVE, SAM'], jacket: '#c8102e', inner: '#ffffff' },
    'new-year': { lines: ['HAPPY NEW YEAR', '2027'], jacket: '#1b2a49' },
    'thank-you': { lines: ['THANK YOU', 'SO MUCH'], jacket: '#2a9d8f' },
    love: { lines: ['LOVE YOU', 'ALWAYS'], jacket: '#c2185b' },
  };

  test('there are ten themed cards plus Blank, each with two accents and two or three motif kinds', () => {
    expect(THEMES.map((t) => t.id).sort()).toEqual([...Object.keys(EXPECTED), 'blank'].sort());
    for (const t of THEMES.filter((x) => x.id !== 'blank')) {
      expect(t.accents.length, t.id).toBe(2);
      const kinds = new Set(t.motifs.map((m) => m.icon)).size;
      expect(kinds, t.id).toBeGreaterThanOrEqual(2);
      expect(kinds, t.id).toBeLessThanOrEqual(3);
    }
  });

  test.each(Object.entries(EXPECTED))('%s has its default lines and colours', (id, e) => {
    const t = themeById(id as ThemeId);
    expect(t.lines).toEqual(e.lines);
    expect(t.colours.jacket).toBe(e.jacket);
    expect(t.colours.inner).toMatch(/^#[0-9a-f]{6}$/);
    if (e.inner) expect(t.colours.inner).toBe(e.inner);
  });

  // Rulings R11 and R14: Arvo, unless another bundled font beats its line 1 by more than 0.1 mm on 5 x 7.
  const fonts = testFonts();
  const capOf = (t: (typeof THEMES)[number], font: string): number => {
    const p = { ...applyTheme(defaultParams('en-US'), t, BIRTHDAY_DEFAULTS), font };
    return fitLayout(p, fonts, t, 'blade', { strokeCheck: false }).blocks.l1.capMm;
  };
  test.each(THEMES.map((t) => t.id))('%s default font is Arvo unless another beats it by more than 0.1 mm', (id) => {
    const t = themeById(id);
    const caps = Object.fromEntries(['Alfa Slab One', 'Arvo', 'Rokkitt'].map((f) => [f, capOf(t, f)]));
    const best = Object.entries(caps).reduce((m, e) => (e[1] > m[1] ? e : m));
    const expected = best[1] > caps.Arvo + 0.1 ? best[0] : 'Arvo';
    expect(t.font).toBe(expected);
  });

  test.each(THEMES.filter((t) => t.accents.length).map((t) => t.id))('%s shows both accents on a 5 x 7 card with its default lines', (id) => {
    const t = themeById(id);
    const p = applyTheme(defaultParams('en-US'), t, BIRTHDAY_DEFAULTS);
    const layout = fitLayout(p, fonts, t, 'blade', { strokeCheck: false });
    expect(Object.keys(layout.blocks)).toEqual(expect.arrayContaining(['a1', 'a2']));
    expect(layout.notes.map((n) => n.message).join()).not.toContain('left out');
    expect(layout.fixes).toEqual([]);
  });
});
