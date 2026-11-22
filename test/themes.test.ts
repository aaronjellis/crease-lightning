import { describe, expect, test } from 'vitest';
import { area, bounds, difference, intersect, offset, outerCount, scale, type Poly, type Pt } from '@kerfuffle/engine/geom';
import { applyTheme, BIRTHDAY_DEFAULTS, defaultParams, type ThemeDefaults, type ThemeId } from '../src/core/model';
import { fitLayout } from '../src/core/fit';
import { testFonts } from './helpers/fonts';
import { BRIDGE_MM, MIN_STROKE_BLADE_MM } from '../src/core/constants';
import { MAX_ITEM_MM } from '../src/core/codec';
import { thinArea } from '../src/core/text';
import { BORDERS, ICONS, THEMES, borderById, iconById, loadIcon, themeById } from '../src/themes';

const atMin = (id: string): Poly => {
  const i = iconById(id);
  return scale(i.poly, i.minHeightMm);
};

/** A 100 mm square sheet with `hole` cut from its middle: the paper that is left. */
const sheetWith = (hole: Poly): Poly => {
  const b = bounds(hole)!;
  const placed = hole.map((c) => c.map((p) => ({ x: p.x - b.x + 50 - b.w / 2, y: p.y - b.y + 50 - b.h / 2 })));
  return difference([[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]], placed);
};
/** The paper round and inside an icon cut at its minimum height, framed 3 mm clear of its bounds. */
const paperAround = (id: string): Poly => {
  const p = atMin(id);
  const b = bounds(p)!;
  const frame = [[{ x: b.x - 3, y: b.y - 3 }, { x: b.x + b.w + 3, y: b.y - 3 }, { x: b.x + b.w + 3, y: b.y + b.h + 3 }, { x: b.x - 3, y: b.y + b.h + 3 }]];
  return difference(frame, p);
};
const islandSvg = '<svg viewBox="0 0 10 10"><path fill-rule="evenodd" d="M0 0H10V10H0Z M3 3H7V7H3Z"/></svg>';

describe('icons', () => {
  test('the library has at least 85 illustrations with unique ids', () => {
    expect(ICONS.length).toBeGreaterThanOrEqual(85);
    expect(new Set(ICONS.map((i) => i.id)).size).toBe(ICONS.length);
  });

  test.each(ICONS.map((i) => i.id))('%s is 1 mm tall with its bottom on y = 0 and its left on x = 0', (id) => {
    const b = bounds(iconById(id).poly)!;
    expect(b.h).toBeCloseTo(1, 3);
    expect(b.y).toBeCloseTo(0, 3);
    expect(b.x).toBeCloseTo(0, 3);
  });

  test.each(ICONS.map((i) => i.id))('%s cut from a 100 mm sheet at its minimum height and at 30 mm leaves the sheet in one piece', (id) => {
    const i = iconById(id);
    expect(outerCount(sheetWith(atMin(id)))).toBe(1);
    expect(outerCount(sheetWith(scale(i.poly, 30)))).toBe(1);
  });

  test.each(ICONS.map((i) => i.id))('%s has no paper island: every detail is bridged or filled', (id) => {
    expect(iconById(id).poly.filter((c) => !outerCount([c]))).toEqual([]);
  });

  test.each(ICONS.map((i) => i.id))('%s leaves no paper narrower than 1 mm at its minimum height', (id) => {
    expect(thinArea(paperAround(id), 1)).toBeLessThan(0.05);
  });

  test.each(ICONS.map((i) => i.id))('%s has no stroke under 1.5 mm at its minimum height', (id) => {
    expect(thinArea(atMin(id), MIN_STROKE_BLADE_MM)).toBeLessThan(0.05);
  });

  test.each(ICONS.map((i) => i.id))('%s has a name, themes, a source, a licence, and a default size range no smaller than its minimum', (id) => {
    const i = iconById(id);
    expect(i.name.trim()).not.toBe('');
    expect(i.themes.length).toBeGreaterThan(0);
    expect(i.themes).not.toContain('blank');
    expect(i.source).not.toBe('');
    expect(i.licence).not.toBe('');
    expect(i.defaultMm[0]).toBeGreaterThanOrEqual(i.minHeightMm);
    expect(i.defaultMm[1]).toBeGreaterThanOrEqual(i.defaultMm[0]);
  });

  test.each(THEMES.filter((t) => t.id !== 'blank').map((t) => t.id))('%s has at least 8 illustrations', (id) => {
    expect(ICONS.filter((i) => i.themes.includes(id)).length).toBeGreaterThanOrEqual(8);
  });

  test('the everyday group has at least 15 illustrations', () => {
    expect(ICONS.filter((i) => i.themes.includes('everyday')).length).toBeGreaterThanOrEqual(15);
  });

  test('loadIcon bridges a paper island to the paper round it', () => {
    // A 10 x 10 square with a 4 x 4 island of paper inside, 20 mm tall: the island hangs on a bridge.
    const icon = loadIcon(islandSvg, { id: 't', name: 'T', themes: ['everyday'], minHeightMm: 20, defaultMm: [20, 24], source: 's', licence: 'l' });
    const mm = scale(icon.poly, 20);
    expect(icon.poly.filter((c) => !outerCount([c]))).toEqual([]);
    expect(outerCount(sheetWith(mm))).toBe(1);
    // Cut area: 400 minus the 64 mm² island minus a bridge at least BRIDGE_MM wide across the 6 mm band.
    expect(area(mm)).toBeLessThan(400 - 64 - BRIDGE_MM * 6 * 0.99);
    expect(area(mm)).toBeGreaterThan(400 - 64 - 4 * 6);
  });

  test('loadIcon fills paper islands instead when the meta says fill', () => {
    const icon = loadIcon(islandSvg, { id: 't', name: 'T', themes: ['everyday'], minHeightMm: 20, defaultMm: [20, 24], source: 's', licence: 'l', fill: true });
    expect(icon.poly.length).toBe(1);
    expect(area(icon.poly)).toBeCloseTo(1, 3);
  });

  test('the paper check counts a 0.6 mm strip of paper between two cuts but not a 3 mm one', () => {
    const box = (x: number, y: number, w: number, h: number): Pt[] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
    const paper = (gap: number): Poly => difference([box(-3, -3, 26 + gap, 16)], [box(0, 0, 10, 10), box(10 + gap, 0, 10, 10)]);
    expect(thinArea(paper(0.6), 1)).toBeGreaterThan(0.05);
    expect(thinArea(paper(3), 1)).toBeLessThan(0.05);
  });

  test('loadIcon flips y so the SVG top ends up at the top', () => {
    const icon = loadIcon('<svg viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="2"/><rect x="0" y="0" width="2" height="10"/></svg>', {
      id: 't', name: 'T', themes: ['everyday'], minHeightMm: 1, defaultMm: [1, 2], source: 's', licence: 'l',
    });
    const top = bounds(intersect(icon.poly, [[{ x: -1, y: 0.9 }, { x: 2, y: 0.9 }, { x: 2, y: 1 }, { x: -1, y: 1 }]]))!;
    expect(top.w).toBeCloseTo(1, 2);
  });

  test('unknown ids throw', () => {
    expect(() => iconById('nope')).toThrow();
    expect(() => themeById('nope' as ThemeId)).toThrow();
    expect(() => borderById('nope')).toThrow();
  });

});

const styleIcons = new Set(THEMES.flatMap((t) => t.styles.flatMap((st) => st.items.map((it) => it.icon))));

describe('borders', () => {
  test('the seed patterns exist, each tiled with a known icon', () => {
    expect(BORDERS.map((b) => b.id).sort()).toEqual(
      ['cap-row', 'confetti-row', 'dot-row', 'heart-row', 'holly-row', 'scallop-edge', 'snow-row', 'star-row'],
    );
    for (const b of BORDERS) {
      expect(borderById(b.id)).toBe(b);
      expect(b.name.trim()).not.toBe('');
      expect(() => iconById(b.tile)).not.toThrow();
      if (b.corner) expect(() => iconById(b.corner!)).not.toThrow();
      expect(b.sizeFrac).toBeGreaterThan(0);
      expect(b.minMm).toBeGreaterThanOrEqual(iconById(b.tile).minHeightMm);
      expect(b.gapMm).toBeGreaterThan(0);
    }
  });

  test('border tiles have no holes', () => {
    for (const b of BORDERS) expect(iconById(b.tile).poly.filter((c) => !outerCount([c])), b.id).toEqual([]);
  });

  test('the new patterns tile with their own shapes', () => {
    expect(borderById('holly-row').tile).toBe('holly');
    expect(borderById('scallop-edge').tile).toBe('scallop');
    expect(borderById('dot-row').tile).toBe('dot');
    expect(borderById('cap-row').tile).toBe('mortarboard');
  });
});

describe('themes', () => {
  test('every theme but Blank has two or three styles with unique ids; Blank has none', () => {
    for (const t of THEMES) {
      if (t.id === 'blank') {
        expect(t.styles).toEqual([]);
        continue;
      }
      expect(t.styles.length, t.id).toBeGreaterThanOrEqual(2);
      expect(t.styles.length, t.id).toBeLessThanOrEqual(3);
      expect(new Set(t.styles.map((st) => st.id)).size, t.id).toBe(t.styles.length);
    }
  });

  test('style ids match the final set (R1)', () => {
    const ids = (id: ThemeId) => themeById(id).styles.map((st) => st.id);
    expect(ids('birthday')).toEqual(['confetti', 'balloons', 'candles']);
    expect(ids('baby-girl')).toEqual(['stork', 'nursery']);
    expect(ids('baby-boy')).toEqual(['stork', 'nursery']);
    expect(ids('graduation')).toEqual(['caps', 'honours']);
    expect(ids('christmas')).toEqual(['holly', 'snow']);
  });

  test("every style's icons and border exist, and its sizes respect the icon minimum", () => {
    for (const t of THEMES) {
      for (const st of t.styles) {
        expect(st.name.trim(), `${t.id}/${st.id}`).not.toBe('');
        if (st.border !== null) expect(() => borderById(st.border!), `${t.id}/${st.id}`).not.toThrow();
        expect(st.items.length, `${t.id}/${st.id}`).toBeGreaterThan(0);
        for (const it of st.items) {
          const i = iconById(it.icon);
          expect(it.minMm, `${t.id}/${st.id}/${it.icon}`).toBeGreaterThanOrEqual(i.minHeightMm);
          expect(it.maxMm).toBeGreaterThanOrEqual(it.minMm);
          expect(it.maxMm).toBeLessThanOrEqual(MAX_ITEM_MM);
          expect(it.count).toBeGreaterThan(0);
        }
      }
    }
  });

  test("every style uses only illustrations that list its theme", () => {
    for (const t of THEMES) {
      for (const st of t.styles) for (const it of st.items) expect(iconById(it.icon).themes, `${t.id}/${st.id}/${it.icon}`).toContain(t.id);
    }
  });

  test('first styles match their names', () => {
    const icons = (id: ThemeId, style: string) => themeById(id).styles.find((st) => st.id === style)!.items.map((it) => it.icon);
    expect(icons('birthday', 'confetti')).toContain('confetti');
    expect(icons('birthday', 'balloons')).toContain('balloon');
    expect(icons('birthday', 'candles')).toContain('candles');
    expect(icons('baby-girl', 'stork')).toContain('stork');
    expect(icons('baby-boy', 'stork')).toContain('stork');
    expect(icons('graduation', 'caps')).toContain('mortarboard');
    expect(icons('christmas', 'holly')).toContain('holly');
    expect(icons('christmas', 'snow')).toContain('snowflake');
  });

  test("each theme's first style has no border", () => {
    for (const t of THEMES.filter((x) => x.styles.length)) expect(t.styles[0].border, t.id).toBeNull();
  });

  test('style icons have no holes: an island inside a cut-through would fall out of the page', () => {
    for (const id of styleIcons) {
      expect(iconById(id).poly.filter((c) => !outerCount([c])), id).toEqual([]);
    }
  });

  test("Birthday's first style is today's motifs: six confetti and four stars", () => {
    expect(themeById('birthday').styles[0].items.map(({ icon, count }) => ({ icon, count }))).toEqual([
      { icon: 'confetti', count: 6 },
      { icon: 'star', count: 4 },
    ]);
  });

  test('Birthday', () => {
    const t = themeById('birthday');
    expect(t.lines).toEqual(['HAPPY BIRTHDAY', 'SAM']);
    expect(t.font).toBe('Arvo');
    expect(t.styles.length).toBeGreaterThan(0);
  });

  test('Blank has no styles', () => {
    const t = themeById('blank');
    expect(t.styles).toEqual([]);
    expect(t.lines).toEqual(['HELLO', '']);
    expect(t.font).toBe('Arvo');
    expect(t.colours).toEqual({ inner: '#ffffff', jacket: '#2f5d8a' });
  });

  test('every theme is a ThemeDefaults, and BIRTHDAY_DEFAULTS matches the Birthday theme', () => {
    const defaults: ThemeDefaults[] = THEMES;
    expect(defaults.length).toBe(THEMES.length);
    const b = themeById('birthday');
    expect(BIRTHDAY_DEFAULTS).toEqual({ id: b.id, lines: b.lines, font: b.font, colours: b.colours, styles: b.styles });
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

  test('there are ten themed cards plus Blank', () => {
    expect(THEMES.map((t) => t.id).sort()).toEqual([...Object.keys(EXPECTED), 'blank'].sort());
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

  test.each(THEMES.map((t) => t.id))('%s has only message steps on a 5 x 7 card with its default lines', (id) => {
    const t = themeById(id);
    const p = applyTheme(defaultParams('en-US'), t, BIRTHDAY_DEFAULTS);
    const layout = fitLayout(p, fonts, t, 'blade', { strokeCheck: false });
    expect(layout.steps.every((s) => s.role === 'line1' || s.role === 'line2')).toBe(true);
    expect(layout.notes.map((n) => n.message).join()).not.toContain('left out');
    expect(layout.fixes).toEqual([]);
  });
});
