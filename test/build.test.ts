import { describe, expect, test } from 'vitest';
import { applyTheme, BIRTHDAY_DEFAULTS, CARD_SIZES, defaultParams, withSize, type CardSize, type Params } from '../src/core/model';
import { build } from '../src/core/build';
import { THEMES } from '../src/themes';
import { testFonts } from './helpers/fonts';

const assets = { fonts: testFonts() };
const P0 = defaultParams('en-US');
const FONTS = ['Alfa Slab One', 'Arvo', 'Rokkitt'];
const MAT_NOTE = 'This card needs a 12 × 24 in mat.';
const EMPTY_NOTE = 'Type a message to make your card.';

describe('build', () => {
  test('the default card is exportable with every check ok (stroke check on)', () => {
    const card = build(P0, assets);
    expect(card.checks.map((c) => c.id)).toEqual(['closed', 'one-piece', 'layout', 'stroke', 'front-view']);
    for (const c of card.checks) expect(c.ok, `${c.id}: ${c.detail}`).toBe(true);
    expect(card.checks.find((c) => c.id === 'stroke')!.detail).toBeUndefined();
    expect(card.exportable).toBe(true);
    expect(card.fixes).toEqual([]);
    expect(card.params).toBe(P0);
    expect(card.inner.id).toBe('inner');
    expect(card.jacket.id).toBe('jacket');
    expect(card.panels.length).toBeGreaterThan(2);
  }, 60_000);

  test('stroke check off reports "not run"', () => {
    const card = build(P0, assets, 'blade', { strokeCheck: false });
    expect(card.checks.find((c) => c.id === 'stroke')).toEqual({ id: 'stroke', ok: true, detail: 'not run' });
  });

  test('stats sum cut and score lengths of both pieces', () => {
    const card = build(P0, assets, 'blade', { strokeCheck: false });
    const perimeters = 2 * (card.inner.widthMm + card.inner.heightMm) + 2 * (card.jacket.widthMm + card.jacket.heightMm);
    expect(card.stats.cutMm).toBeGreaterThan(perimeters);
    expect(card.stats.scoreMm).toBeGreaterThan(card.jacket.heightMm);
    // The jacket's one valley is counted, and the inner's spine fold is at most the card length.
    const folds = [...card.inner.folds, ...card.jacket.folds].reduce(
      (t, f) => t + f.path.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - f.path[i].x, q.y - f.path[i].y), 0),
      0
    );
    expect(card.stats.scoreMm).toBeCloseTo(folds, 6);
  });

  describe('empty message', () => {
    test.each([
      ['both lines blank', { line1: '   ', line2: '' }],
      ['only line 2 filled', { line1: '', line2: 'SAM' }],
    ])('%s: not exportable, default preview, note, no throw', (_name, lines) => {
      const card = build({ ...P0, ...lines }, assets, 'blade', { strokeCheck: false });
      expect(card.exportable).toBe(false);
      expect(card.notes.map((n) => n.message)).toContain(EMPTY_NOTE);
      expect(card.layout.lines).toEqual(['HAPPY BIRTHDAY', 'SAM']);
      expect(card.layout.steps.length).toBeGreaterThan(0);
      expect(card.checks.every((c) => c.ok)).toBe(true);
      expect(card.params.line1).toBe(lines.line1);
    });

    test('a filled card has no empty-message note', () => {
      expect(build(P0, assets, 'blade', { strokeCheck: false }).notes.map((n) => n.message)).not.toContain(EMPTY_NOTE);
    });
  });

  describe('A5 mat note', () => {
    const noteFor = (size: CardSize, target: 'blade' | 'laser' = 'blade') =>
      build(withSize(P0, size), assets, target, { strokeCheck: false }).notes.map((n) => n.message);

    test('A5 on the blade needs the big mat', () => expect(noteFor('a5')).toContain(MAT_NOTE));
    test('5 × 7 never does', () => expect(noteFor('5x7')).not.toContain(MAT_NOTE));
    test('A2 and A6 never do', () => {
      expect(noteFor('a2')).not.toContain(MAT_NOTE);
      expect(noteFor('a6')).not.toContain(MAT_NOTE);
    });
    test('the laser has no mat note', () => expect(noteFor('a5', 'laser')).not.toContain(MAT_NOTE));
  });

  describe('matrix: theme × size × spine × lines × font (R15)', () => {
    // One test per theme and size, so no single test blocks the worker for long.
    for (const theme of THEMES) {
      const base = applyTheme(P0, theme, BIRTHDAY_DEFAULTS);
      const variants = [...new Set([`${base.line1}|${base.line2}`, `${base.line1}|`, `${base.line1}|ALEXANDRA`])];
      for (const size of Object.keys(CARD_SIZES) as CardSize[]) {
        test(`${theme.id} ${size}: every combination folds and cuts cleanly with no fixes`, () => {
          const bad: string[] = [];
          for (const spine of ['long', 'short'] as const) {
            for (const v of variants) {
              // R15: every theme with its own font; all three bundled fonts only for Birthday and Blank.
              for (const font of theme.id === 'birthday' || theme.id === 'blank' ? FONTS : [base.font]) {
                const [line1, line2] = v.split('|');
                const label = `${theme.id} ${size} ${spine} "${line1}" / "${line2}" ${font}`;
                const card = build({ ...withSize(base, size), spine, line1, line2, font }, assets, 'blade', { strokeCheck: false });
                const failed = card.checks.filter((c) => !c.ok).map((c) => `${c.id} (${c.detail})`);
                if (failed.length || card.fixes.length || !card.exportable) {
                  bad.push(`${label}: checks [${failed.join('; ')}] fixes [${card.fixes.map((f) => f.id).join(', ')}]`);
                }
              }
            }
          }
          expect(bad).toEqual([]);
        }, 60_000);
      }
    }
  });
});
