/**
 * The stroke check at card scale: the hang the final review found (C1), its work budget, and the
 * stroke-checked matrix of every theme's defaults (C1, I2).
 */
import { describe, expect, test } from 'vitest';
import { union } from '@kerfuffle/engine/geom';
import { build } from '../src/core/build';
import { MIN_STROKE_BLADE_MM } from '../src/core/constants';
import { fitLayout } from '../src/core/fit';
import { applyTheme, BIRTHDAY_DEFAULTS, CARD_SIZES, defaultParams, withSize, type CardSize, type Params } from '../src/core/model';
import { thinArea } from '../src/core/text';
import { THEMES, themeById } from '../src/themes';
import { testFonts } from './helpers/fonts';

const fonts = testFonts();
const P0 = defaultParams('en-US');
const themed = (id: string): Params => applyTheme(P0, themeById(id as Params['theme']), BIRTHDAY_DEFAULTS);

/** Anniversary's defaults on A2 with a short spine: line 1 fits at a 6.41 mm cap. */
const anniversaryA2Short = (): Params => ({ ...withSize(themed('anniversary'), 'a2'), spine: 'short' });

describe('C1: the stroke check never hangs', () => {
  test('Anniversary, A2, short spine: line 1 is checked in well under 3 s', () => {
    const l = fitLayout(anniversaryA2Short(), fonts, themeById('anniversary'), 'blade', { strokeCheck: false });
    expect(l.lines[0]).toBe('HAPPY ANNIVERSARY');
    expect(l.blocks.l1.capMm).toBeCloseTo(6.41, 1);
    const solid = union([l.blocks.l1.letters, l.blocks.l1.plinth]);
    const t0 = performance.now();
    const thin = thinArea(solid, MIN_STROKE_BLADE_MM);
    expect(performance.now() - t0).toBeLessThan(3000);
    // Arvo at 6.4 mm has strokes about 1.1 mm wide: thin for a blade.
    expect(thin).toBeGreaterThan(0.05);
  }, 3000);

  test('the whole stroke-checked build of that card finishes and stays exportable', () => {
    const t0 = performance.now();
    const card = build(anniversaryA2Short(), { fonts }, 'blade', { strokeCheck: true });
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(card.checks.find((c) => c.id === 'stroke')!.ok).toBe(false);
    expect(card.exportable).toBe(true);
  }, 3000);

  test('a shape past the work budget reports thin (Infinity) instead of working on', () => {
    const l = fitLayout(anniversaryA2Short(), fonts, themeById('anniversary'), 'blade', { strokeCheck: false });
    const solid = union([l.blocks.l1.letters, l.blocks.l1.plinth]);
    expect(thinArea(solid, MIN_STROKE_BLADE_MM, { budget: 10 })).toBe(Infinity);
  });

  test('stopAbove returns as soon as the total passes the threshold', () => {
    const l = fitLayout(anniversaryA2Short(), fonts, themeById('anniversary'), 'blade', { strokeCheck: false });
    const solid = union([l.blocks.l1.letters, l.blocks.l1.plinth]);
    const early = thinArea(solid, MIN_STROKE_BLADE_MM, { stopAbove: 0.05 });
    expect(early).toBeGreaterThan(0.05);
    expect(early).toBeLessThanOrEqual(thinArea(solid, MIN_STROKE_BLADE_MM));
  });
});

describe('stroke-checked matrix: every theme × size × spine, theme font (C1, I2)', () => {
  // One test per theme and size, so no single test blocks the worker for long (R21).
  for (const theme of THEMES) {
    for (const size of Object.keys(CARD_SIZES) as CardSize[]) {
      test(`${theme.id} ${size}: builds with the stroke check; the long spine passes it`, () => {
        const bad: string[] = [];
        for (const spine of ['long', 'short'] as const) {
          const p: Params = { ...withSize(themed(theme.id), size), spine };
          const card = build(p, { fonts }, 'blade', { strokeCheck: true });
          const failed = card.checks.filter((c) => !c.ok && (spine === 'long' || c.id !== 'stroke'));
          if (failed.length || !card.exportable) {
            bad.push(`${spine}: ${failed.map((c) => `${c.id} (${c.detail})`).join('; ')} exportable ${card.exportable}`);
          }
        }
        expect(bad).toEqual([]);
      }, 30_000);
    }
  }
});
