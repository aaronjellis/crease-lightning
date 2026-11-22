import { describe, expect, test } from 'vitest';
import { area, bounds, intersect, offset, outerCount, scale, union, type Poly } from '@kerfuffle/engine/geom';
import { BIRTHDAY_DEFAULTS, type ThemeDefaults } from '../src/core/model';
import { MIN_STROKE_BLADE_MM, PLINTH_MIN_MM } from '../src/core/constants';
import { buildIconBlock, thinArea } from '../src/core/text';
import { ICONS, THEMES, iconById, loadIcon, themeById } from '../src/themes';

const accentIds = new Set(THEMES.flatMap((t) => t.accents));
const atMin = (id: string): Poly => {
  const i = iconById(id);
  return scale(i.poly, i.minHeightMm);
};

describe('icons', () => {
  test.each(ICONS.map((i) => i.id))('%s is one piece at any size, 1 mm tall, bottom on y = 0', (id) => {
    const i = iconById(id);
    const b = bounds(i.poly)!;
    expect(b.h).toBeCloseTo(1, 3);
    expect(b.y).toBeCloseTo(0, 3);
    expect(b.x).toBeCloseTo(0, 3);
    expect(outerCount(atMin(id))).toBe(1);
    expect(i.source).not.toBe('');
    expect(i.licence).not.toBe('');
  });

  test.each(ICONS.map((i) => i.id))('%s has no stroke under 1.5 mm at its minimum height', (id) => {
    expect(thinArea(atMin(id), MIN_STROKE_BLADE_MM)).toBeLessThan(0.05);
  });

  test.each(ICONS.map((i) => i.id))('%s has no hole narrower than 1 mm at its minimum height', (id) => {
    const holes = atMin(id).filter((c) => !outerCount([c]));
    for (const h of holes) expect(area(offset([[...h].reverse()], -0.5, 0.05))).toBeGreaterThan(1e-6);
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
    expect(() => themeById('wedding')).toThrow();
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

  test('Birthday', () => {
    const t = themeById('birthday');
    expect(t.lines).toEqual(['HAPPY BIRTHDAY', 'SAM']);
    expect(t.font).toBe('Rokkitt');
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
