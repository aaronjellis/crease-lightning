import { describe, expect, test } from 'vitest';
import { applyTheme, BIRTHDAY_DEFAULTS, CARD_SIZES, defaultParams, withSize, type CardSize, type Params } from '../src/core/model';
import { build } from '../src/core/build';
import { decorFromStyle } from '../src/core/decor/model';
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

  test('thin strokes fail the stroke check but stay exportable: a warning, not a refusal (R23)', () => {
    // Rokkitt's @ ring is about 1.1 mm at this size, under the blade's 1.5 mm (see fit.test).
    const p: Params = { ...P0, theme: 'blank', font: 'Rokkitt', line1: '@'.repeat(10), line2: '', autoSplit: false, spacing: 'normal' };
    const card = build(p, assets, 'blade', { strokeCheck: true });
    expect(card.checks.find((c) => c.id === 'stroke')!.ok).toBe(false);
    expect(card.checks.filter((c) => c.id !== 'stroke').every((c) => c.ok)).toBe(true);
    expect(card.notes.some((n) => n.level === 'strong' && n.kind === 'thin-stroke')).toBe(true);
    expect(card.exportable).toBe(true);
  });

  test('when Alfa Slab One would pass, the thin-stroke note says so and offers it (R31)', () => {
    const p: Params = { ...P0, theme: 'blank', font: 'Rokkitt', line1: '@'.repeat(10), line2: '', autoSplit: false, spacing: 'normal' };
    const card = build(p, assets, 'blade', { strokeCheck: true });
    const note = card.notes.find((n) => n.kind === 'thin-stroke')!;
    expect(note.message).toBe('Some strokes are thin enough to tear. Alfa Slab One has heavier strokes, or try a bigger card.');
    expect(note.action).toEqual({ kind: 'font', family: 'Alfa Slab One' });
    expect(card.checks.find((c) => c.id === 'stroke')!.detail).toBe(note.message);
    // And it's true: the same card in Alfa Slab One passes.
    const alfa = build({ ...p, font: 'Alfa Slab One' }, assets, 'blade', { strokeCheck: true });
    expect(alfa.checks.find((c) => c.id === 'stroke')!.ok).toBe(true);
  });

  test('when Alfa Slab One would be thin too, the note names the line and offers nothing', () => {
    // At A2 with a short spine, line 1 is about 6 mm tall: too small for any font.
    const p: Params = { ...withSize(P0, 'a2'), spine: 'short', theme: 'anniversary', line1: 'HAPPY ANNIVERSARY', line2: 'ALEX & SAM' };
    const card = build(p, assets, 'blade', { strokeCheck: true });
    const notes = card.notes.filter((n) => n.kind === 'thin-stroke');
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.message).toMatch(/^Some strokes in line \d are thinner than 1.5 mm/);
      expect(n.action).toBeUndefined();
    }
  }, 30_000);

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

    test.each([
      ['a pipe', '|'],
      ['pipes and spaces', ' | | '],
      ['emoji only', '😀🎉'],
      ['a script no bundled font has', 'こんにちは'],
    ])('a line 1 with nothing to draw (%s) counts as blank (M2)', (_name, line1) => {
      const card = build({ ...P0, line1, line2: '' }, assets, 'blade', { strokeCheck: false });
      expect(card.exportable).toBe(false);
      expect(card.notes.map((n) => n.message)).toContain(EMPTY_NOTE);
      expect(card.layout.lines).toEqual(['HAPPY BIRTHDAY', 'SAM']);
    });

    test('a line 1 with one drawable character among emoji is not blank', () => {
      const card = build({ ...P0, line1: '😀 A 😀', line2: '' }, assets, 'blade', { strokeCheck: false });
      expect(card.notes.map((n) => n.message)).not.toContain(EMPTY_NOTE);
      expect(card.layout.lines).toEqual(['A']);
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

  describe('matrix: theme × style × size × spine × line count (decorations)', () => {
    // One test per theme and style, so no single test blocks the worker for long (R21).
    for (const theme of THEMES) {
      const base = applyTheme(P0, theme, BIRTHDAY_DEFAULTS);
      const lines: [string, string][] = [[base.line1, base.line2 || 'SAM'], [base.line1, '']];
      for (const style of theme.styles) {
        test(`${theme.id} ${style.id}: every size, spine and line count builds with no fixes, one piece, clean layout`, () => {
          const bad: string[] = [];
          for (const size of Object.keys(CARD_SIZES) as CardSize[]) {
            for (const spine of ['long', 'short'] as const) {
              for (const [line1, line2] of lines) {
                const p: Params = { ...withSize(base, size), spine, line1, line2, decor: decorFromStyle(theme, style.id, 1) };
                const card = build(p, assets, 'blade', { strokeCheck: false });
                const failed = card.checks.filter((c) => (c.id === 'one-piece' || c.id === 'layout') && !c.ok).map((c) => `${c.id} (${c.detail})`);
                if (failed.length || card.fixes.length) {
                  bad.push(`${size} ${spine} "${line1}" / "${line2}": checks [${failed.join('; ')}] fixes [${card.fixes.map((f) => f.id).join(', ')}]`);
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
