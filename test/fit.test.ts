import { describe, expect, test } from 'vitest';
import { bounds } from '@kerfuffle/engine/geom';
import { CAP_FLOOR_MM, fitLayout, splitBalanced, windowY0, type Layout } from '../src/core/fit';
import { cardDims, CARD_SIZES, defaultParams, type CardSize, type Params } from '../src/core/model';
import { closedReach } from '../src/core/linkage';
import { measureLine } from '../src/core/text';
import { CLEARANCE_MM, FRONT_GAP_MM, MARGIN_MM, RAIL_MM, STRONG_CAP_MM, WARN_CAP_MM, WEB_MM } from '../src/core/constants';
import { ACCENTS_HIDDEN, LINE2_DROPPED } from '../src/core/fixes';
import { THEMES, themeById } from '../src/themes';
import { arvo, rokkitt, testFonts } from './helpers/fonts';
import type { FontSet } from '../src/core/fonts';

const EPS = 1e-6;
const fonts = testFonts();
const birthday = themeById('birthday');
const blank = themeById('blank');
const base = (over: Partial<Params> = {}): Params => ({ ...defaultParams('en-US'), ...over });
const withAdvanced = (p: Params, adv: Partial<Params['advanced']>): Params => ({ ...p, advanced: { ...p.advanced, ...adv } });
const step = (l: Layout, id: string) => l.steps.find((s) => s.id === id);
const fixIds = (l: Layout) => l.fixes.map((f) => f.id);

/**
 * Every constraint the spec puts on a layout: tread room, closed reach, child heights and front view,
 * strips inside the card ends, siblings apart, children inside the parent's rails, windows inside strips.
 */
function expectConstraints(l: Layout, p: Params, label: string, railOf?: (id: string) => number) {
  const { W, L } = cardDims(p);
  const c = p.advanced.clearanceMm;
  const rail = (id: string) => railOf?.(id) ?? Math.max(RAIL_MM, p.advanced.railMm);
  const root = l.steps.find((s) => s.parentId === null);
  expect(root, label).toBeDefined();
  for (const s of l.steps) {
    const at = `${label} ${s.id}`;
    for (const v of [s.d, s.h, s.s, s.y0, s.y1, l.blocks[s.id]?.capMm]) expect(Number.isFinite(v), at).toBe(true);
    if (s.role !== 'accent') expect(l.blocks[s.id].capMm, at).toBeGreaterThanOrEqual(CAP_FLOOR_MM - EPS);
    if (s.role !== 'accent' && l.blocks[s.id].capMm < STRONG_CAP_MM) {
      expect(l.notes.some((n) => n.level === 'strong'), `${at} strong note`).toBe(true);
    }
    expect(s.d, at).toBeGreaterThan(0);
    expect(s.h, at).toBeGreaterThan(0);
    expect(s.s, at).toBeGreaterThan(0);
    expect(s.s, at).toBeLessThanOrEqual(s.d - c - WEB_MM + EPS);
    expect(closedReach(s, l.steps), at).toBeLessThanOrEqual(W - MARGIN_MM + EPS);
    expect(s.y0, at).toBeGreaterThanOrEqual(MARGIN_MM - EPS);
    expect(s.y1, at).toBeLessThanOrEqual(L - MARGIN_MM + EPS);
    const b = l.blocks[s.id];
    expect(b, at).toBeDefined();
    expect(b.s, at).toBeCloseTo(s.s, 9);
    // The window sits inside the strip with a full rail on each side.
    const ww = bounds(b.window)!.w;
    const wy = windowY0(s, b);
    expect(wy, at).toBeGreaterThanOrEqual(s.y0 + rail(s.id) - EPS);
    expect(wy + ww, at).toBeLessThanOrEqual(s.y1 - rail(s.id) + EPS);
    if (s.parentId !== null) {
      const parent = step(l, s.parentId)!;
      expect(s.h + WEB_MM, at).toBeLessThanOrEqual(parent.h + EPS);
      expect(s.h + s.s + FRONT_GAP_MM, at).toBeLessThanOrEqual(parent.h + EPS);
      expect(s.y0, at).toBeGreaterThanOrEqual(parent.y0 + rail(parent.id) - EPS);
      expect(s.y1, at).toBeLessThanOrEqual(parent.y1 - rail(parent.id) + EPS);
    }
  }
  const children = l.steps.filter((s) => s.parentId !== null);
  for (const a of children) {
    for (const b of children) {
      if (a === b || a.parentId !== b.parentId) continue;
      const gap = Math.max(b.y0 - a.y1, a.y0 - b.y1);
      expect(gap, `${label} ${a.id}/${b.id}`).toBeGreaterThanOrEqual(WEB_MM - EPS);
    }
  }
}

describe('fitLayout', () => {
  test('Birthday 5x7 defaults: two lines, zero fixes, caps over 9 mm', () => {
    const l = fitLayout(defaultParams('en-US'), testFonts(), themeById('birthday'), 'blade');
    expect(l.fixes).toEqual([]);
    expect(l.lines).toEqual(['HAPPY BIRTHDAY', 'SAM']);
    expect(l.blocks.l1.capMm).toBeGreaterThanOrEqual(9);
    expect(l.blocks.l2.capMm).toBeGreaterThanOrEqual(9);
    // Accents stand as children of line 1, flanking line 2.
    expect(l.steps.map((s) => s.id)).toEqual(['l1', 'l2', 'a1', 'a2']);
    expect(l.steps.slice(1).every((s) => s.parentId === 'l1')).toBe(true);
    expect(step(l, 'a1')!.y1).toBeLessThanOrEqual(step(l, 'l2')!.y0 - WEB_MM + EPS);
    expect(step(l, 'a2')!.y0).toBeGreaterThanOrEqual(step(l, 'l2')!.y1 - WEB_MM + EPS);
    expectConstraints(l, defaultParams('en-US'), 'birthday default');
  });

  test('strips are centred on L / 2', () => {
    const p = defaultParams('en-US');
    const l = fitLayout(p, fonts, birthday, 'blade');
    const { L } = cardDims(p);
    for (const id of ['l1', 'l2']) {
      const s = step(l, id)!;
      expect((s.y0 + s.y1) / 2).toBeCloseTo(L / 2, 6);
    }
  });

  test(
    'every step obeys the spec constraints',
    () => {
      const sizes = Object.keys(CARD_SIZES) as CardSize[];
      const families = ['Alfa Slab One', 'Arvo', 'Rokkitt'];
      let n = 0;
      for (const theme of THEMES) {
        for (const size of sizes) {
          for (const spine of ['long', 'short'] as const) {
            for (const lines of [1, 2]) {
              for (const font of families) {
                const p = base({
                  theme: theme.id,
                  size,
                  spine,
                  font,
                  line1: theme.lines[0],
                  line2: lines === 2 ? theme.lines[1] || 'ALEXANDRA' : '',
                });
                // The stroke check has its own test; skipping it here keeps the matrix fast.
                const l = fitLayout(p, fonts, theme, 'blade', { strokeCheck: false });
                expectConstraints(l, p, `${theme.id} ${size} ${spine} ${lines} ${font}`);
                // Hidden accents are a note, not a fix (R10), so every default builds with zero fixes.
                expect(l.fixes, `${theme.id} ${size} ${spine} ${lines} ${font}`).toEqual([]);
                n++;
              }
            }
          }
        }
      }
      expect(n).toBe(THEMES.length * 4 * 2 * 2 * 3);
    },
    120_000
  );

  test('auto-split happens below 9 mm when a space exists', () => {
    const long = 'HAPPY BIRTHDAY TO YOU SAM';
    const one = fitLayout(base({ line1: long, line2: '', autoSplit: false }), fonts, blank, 'blade');
    expect(one.lines).toEqual([long]);
    expect(one.blocks.l1.capMm).toBeLessThan(WARN_CAP_MM);
    expect(one.notes.some((n) => n.level === 'warn' || n.level === 'strong')).toBe(true);

    const two = fitLayout(base({ line1: long, line2: '' }), fonts, blank, 'blade');
    expect(two.lines).toHaveLength(2);
    expect(two.lines.join(' ')).toBe(long);
    expect(two.steps.map((s) => s.id)).toEqual(['l1', 'l2']);
    expect(two.blocks.l1.capMm).toBeGreaterThan(one.blocks.l1.capMm);
    expect(two.blocks.l2.capMm).toBeGreaterThan(one.blocks.l1.capMm);
    expect(two.fixes).toEqual([]);
  });

  test('no auto-split when one line stays at 9 mm or more', () => {
    const l = fitLayout(base({ line1: 'HAPPY BIRTHDAY', line2: '' }), fonts, blank, 'blade');
    expect(l.lines).toEqual(['HAPPY BIRTHDAY']);
    expect(l.blocks.l1.capMm).toBeGreaterThanOrEqual(WARN_CAP_MM);
  });

  test('a | in line 1 is the saved line break', () => {
    const l = fitLayout(base({ line1: 'HAPPY|BIRTHDAY', line2: '' }), fonts, blank, 'blade');
    expect(l.lines).toEqual(['HAPPY', 'BIRTHDAY']);
  });

  test('one long word cannot split, still fits, warns strong', () => {
    // The brief's 20-letter word fits Rokkitt on 5 x 7 at about 9 mm, so it needs no split and earns
    // no note; the full word is what Review Focus 3 is about.
    const short = fitLayout({ ...defaultParams('en-US'), line1: 'SUPERCALIFRAGILISTIC', line2: '' }, testFonts(), themeById('blank'), 'blade', {
      strokeCheck: false,
    });
    expect(short.lines).toHaveLength(1);
    expect(short.steps.every((s) => s.d > 0 && s.h > 0 && s.s > 0)).toBe(true);
    expectConstraints(short, defaultParams('en-US'), 'short word');

    const word = 'SUPERCALIFRAGILISTICEXPIALIDOCIOUS';
    for (const size of Object.keys(CARD_SIZES) as CardSize[]) {
      const p = { ...defaultParams('en-US'), size, line1: word, line2: '' };
      const l = fitLayout(p, testFonts(), themeById('blank'), 'blade', { strokeCheck: false });
      expect(l.lines).toHaveLength(1);
      expect(l.notes.some((n) => n.level === 'strong')).toBe(true);
      expect(l.steps.every((s) => s.d > 0 && s.h > 0 && s.s > 0)).toBe(true);
      expect(l.blocks.l1.capMm).toBeGreaterThan(0);
      expectConstraints(l, p, `long word ${size}`);
    }
  }, 60_000);

  test('advanced dims that poke out produce fit:l1 and shrink s, then h, then d', () => {
    const p = withAdvanced(base({ size: 'a6' }), { line1: { d: 60, h: 60 } });
    const { W } = cardDims(p);
    const l = fitLayout(p, fonts, birthday, 'blade');
    expect(fixIds(l)).toContain('fit:l1');
    const l1 = step(l, 'l1')!;
    expect(closedReach(l1, l.steps)).toBeLessThanOrEqual(W - MARGIN_MM + EPS);
    // h gave way before d: d is untouched, h shrank.
    expect(l1.d).toBe(60);
    expect(l1.h).toBeLessThan(60);
    expectConstraints(l, p, 'd60 h60 a6');

    // A requested s that doesn't fit the tread shrinks first; d and h stay.
    const ps = withAdvanced(base(), { line1: { s: 40 } });
    const ls = fitLayout(ps, fonts, birthday, 'blade');
    expect(fixIds(ls)).toContain('fit:l1');
    const s1 = step(ls, 'l1')!;
    expect(s1.d).toBeCloseTo(30, 9);
    expect(s1.h).toBeCloseTo(45, 9);
    expect(s1.s).toBeLessThanOrEqual(30 - CLEARANCE_MM - WEB_MM + EPS);

    // When h can't give enough, d gives the rest.
    const pd = withAdvanced(base({ size: 'a6' }), { line1: { d: 90, h: 90 } });
    const ld = fitLayout(pd, fonts, birthday, 'blade');
    const d1 = step(ld, 'l1')!;
    expect(fixIds(ld)).toContain('fit:l1');
    expect(d1.d).toBeLessThan(90);
    expect(d1.h).toBeLessThan(90);
    expectConstraints(ld, pd, 'd90 h90 a6');
  });

  test('degenerate saved dims are clamped under fit:<id> and never yield zero sizes', () => {
    const p = withAdvanced(base(), { line1: { d: 0, h: 0, s: 0 }, line2: { d: 0, h: 0 } });
    const l = fitLayout(p, fonts, birthday, 'blade');
    expect(fixIds(l)).toEqual(expect.arrayContaining(['fit:l1', 'fit:l2']));
    expect(l.steps.every((s) => s.d > 0 && s.h > 0 && s.s > 0)).toBe(true);
    expectConstraints(l, p, 'degenerate');
  });

  test('overriding fit:l1 keeps the user dims and adds a warn note', () => {
    const p = { ...withAdvanced(base({ size: 'a6' }), { line1: { d: 60, h: 60 } }), overrides: { 'fit:l1': true as const } };
    const l = fitLayout(p, fonts, birthday, 'blade');
    expect(fixIds(l)).not.toContain('fit:l1');
    const l1 = step(l, 'l1')!;
    expect(l1.d).toBe(60);
    expect(l1.h).toBe(60);
    expect(l1.s).toBeGreaterThan(0);
    expect(l.notes.some((n) => n.level === 'warn' && /line 1/i.test(n.message))).toBe(true);
  });

  test('accents hide with an info note, not a fix, when the riser is too narrow (R10)', () => {
    const hidden = (l: Layout) => l.notes.filter((n) => n.message === ACCENTS_HIDDEN);
    const p = base({ size: 'a2', line2: 'ALEXANDRA JONES' });
    const l = fitLayout(p, fonts, birthday, 'blade');
    expect(l.steps.some((s) => s.role === 'accent')).toBe(false);
    expect(l.blocks.a1).toBeUndefined();
    expect(l.blocks.a2).toBeUndefined();
    expect(l.fixes.filter((f) => f.id.startsWith('accent'))).toEqual([]);
    expect(hidden(l)).toEqual([{ level: 'info', message: ACCENTS_HIDDEN }]);
    // Hidden accents give line 2 all the room it would have with accents off.
    const off = fitLayout({ ...p, accents: false }, fonts, birthday, 'blade');
    expect(l.blocks.l2.capMm).toBeCloseTo(off.blocks.l2.capMm, 6);
    expect(hidden(off)).toEqual([]);
    expectConstraints(l, p, 'a2 long line 2');

    // A short spine can't hold the default accents beside SAM either: still zero fixes.
    const short = fitLayout(base({ spine: 'short' }), fonts, birthday, 'blade');
    expect(short.steps.some((s) => s.role === 'accent')).toBe(false);
    expect(short.fixes).toEqual([]);
    expect(hidden(short)).toHaveLength(1);

    // The 5 x 7 default keeps them, with no note.
    expect(hidden(fitLayout(defaultParams('en-US'), fonts, birthday, 'blade'))).toEqual([]);
  });

  test('one-line accents sit at the riser ends, clear of the text in front view', () => {
    const p = base({ line2: '' });
    const l = fitLayout(p, fonts, birthday, 'blade');
    expect(l.lines).toEqual(['HAPPY BIRTHDAY']);
    expect(l.fixes).toEqual([]);
    const [l1, a1, a2] = ['l1', 'a1', 'a2'].map((id) => step(l, id)!);
    expect(a1.y0).toBeCloseTo(l1.y0 + RAIL_MM, 6);
    expect(a2.y1).toBeCloseTo(l1.y1 - RAIL_MM, 6);
    expectConstraints(l, p, 'one line accents');
  });

  test('accents off, or a theme without accents, adds no accent steps and no fix', () => {
    const off = fitLayout(base({ accents: false }), fonts, birthday, 'blade');
    expect(off.steps.map((s) => s.id)).toEqual(['l1', 'l2']);
    expect(off.fixes).toEqual([]);
    const none = fitLayout(base({ theme: 'blank', line1: 'HELLO', line2: '' }), fonts, blank, 'blade');
    expect(none.steps.map((s) => s.id)).toEqual(['l1']);
  });

  test('accent icons stand at least their minimum height', () => {
    for (const size of Object.keys(CARD_SIZES) as CardSize[]) {
      const l = fitLayout(base({ size }), fonts, birthday, 'blade');
      for (const id of ['a1', 'a2']) {
        if (!l.blocks[id]) continue;
        expect(l.blocks[id].capMm, `${size} ${id}`).toBeGreaterThanOrEqual(18 - EPS);
      }
    }
  });

  test('rails below 5 mm are widened with rail:<id>', () => {
    const p = withAdvanced(base(), { railMm: 3 });
    const l = fitLayout(p, fonts, birthday, 'blade');
    expect(fixIds(l)).toEqual(expect.arrayContaining(['rail:l1', 'rail:l2']));
    expectConstraints(l, p, 'thin rails');
    const kept = fitLayout({ ...p, overrides: { 'rail:l1': true } }, fonts, birthday, 'blade');
    expect(fixIds(kept)).not.toContain('rail:l1');
    expect(kept.notes.some((n) => n.level === 'warn')).toBe(true);
  });

  test('a character only the fallback draws uses the fallback font with font:<id>', () => {
    const set: FontSet = { get: (f) => (f === 'Arvo' ? arvo : undefined), fallback: rokkitt };
    const p = base({ font: 'Arvo', line1: 'HAPPY 40 €', line2: 'SAM' });
    const l = fitLayout(p, set, birthday, 'blade');
    expect(fixIds(l)).toContain('font:l1');
    expect(fixIds(l)).not.toContain('font:l2');
    expect(l.lines[0]).toBe('HAPPY 40 €');
    // Undone: the user's font, without the character it lacks.
    const kept = fitLayout({ ...p, overrides: { 'font:l1': true } }, set, birthday, 'blade');
    expect(fixIds(kept)).not.toContain('font:l1');
    expect(kept.lines[0]).toBe('HAPPY 40');
    expect(kept.notes.some((n) => n.level === 'warn')).toBe(true);
  });

  test('a family missing from the FontSet falls back with an info note, not a fix', () => {
    const l = fitLayout(base({ font: 'Ultra' }), fonts, birthday, 'blade');
    expect(l.fixes).toEqual([]);
    expect(l.notes.some((n) => n.level === 'info' && n.message.includes('Ultra'))).toBe(true);
  });

  test('characters no font can draw are dropped with a note', () => {
    const l = fitLayout(base({ line2: 'SAM 🎉' }), fonts, birthday, 'blade');
    expect(l.lines).toEqual(['HAPPY BIRTHDAY', 'SAM']);
    expect(l.notes.some((n) => n.message.includes('🎉'))).toBe(true);
  });

  test('an empty message builds nothing and never throws', () => {
    const l = fitLayout(base({ line1: '   ', line2: '' }), fonts, birthday, 'blade');
    expect(l.steps).toEqual([]);
    expect(l.lines).toEqual([]);
    const only2 = fitLayout(base({ line1: '', line2: 'SAM' }), fonts, birthday, 'blade');
    expect(only2.lines).toEqual(['SAM']);
  });

  test('cap notes: warn under 9 mm, strong under 7 mm', () => {
    const warn = fitLayout(base({ size: 'a2' }), fonts, birthday, 'blade');
    const cap = warn.blocks.l1.capMm;
    expect(cap).toBeLessThan(WARN_CAP_MM);
    expect(cap).toBeGreaterThanOrEqual(STRONG_CAP_MM);
    expect(warn.notes.some((n) => n.level === 'warn')).toBe(true);
    expect(warn.notes.some((n) => n.level === 'strong')).toBe(false);
    const strong = fitLayout(base({ size: 'a2', spine: 'short' }), fonts, birthday, 'blade');
    expect(strong.blocks.l1.capMm).toBeLessThan(STRONG_CAP_MM);
    expect(strong.notes.some((n) => n.level === 'strong')).toBe(true);
  });

  test('the stroke check flags thin text, and strokeCheck: false skips it', () => {
    // Rokkitt's @ ring is under 1.5 mm at a small size.
    const p = base({ line1: '@@@@@@@@@@@@@@@@@@@@@@@@', line2: '', autoSplit: false });
    const checked = fitLayout(p, fonts, blank, 'blade');
    expect(checked.notes.some((n) => n.level === 'strong' && /stroke|thin/i.test(n.message))).toBe(true);
    const skipped = fitLayout(p, fonts, blank, 'blade', { strokeCheck: false });
    expect(skipped.notes.some((n) => /stroke|thin/i.test(n.message))).toBe(false);
  });

  test('the laser target checks strokes at 1.0 mm: a ring thin for a blade passes', () => {
    // Rokkitt's @ ring is about 1.1 mm at a 12 mm cap; ten of them fit 5 x 7 at about 12.4 mm.
    const p = base({ line1: '@'.repeat(10), line2: '', autoSplit: false, spacing: 'normal' });
    const thin = (l: Layout) => l.notes.some((n) => n.level === 'strong' && /thinner than/.test(n.message));
    const blade = fitLayout(p, fonts, blank, 'blade');
    const laser = fitLayout(p, fonts, blank, 'laser');
    expect(blade.blocks.l1.capMm).toBeCloseTo(laser.blocks.l1.capMm, 9);
    expect(thin(blade)).toBe(true);
    expect(blade.notes.some((n) => n.message.includes('1.5 mm'))).toBe(true);
    expect(thin(laser)).toBe(false);
  });

  test('bridge:<n> numbers bridges across line 1 then line 2; undoing one keeps it with a warning', () => {
    const p = base({ line1: 'WHY?', line2: 'HAPPY 40TH!', spacing: 'normal' });
    const l = fitLayout(p, fonts, birthday, 'blade', { strokeCheck: false });
    const n1 = l.blocks.l1.bridges;
    const n2 = l.blocks.l2.bridges;
    expect(n1).toBeGreaterThanOrEqual(1);
    expect(n2).toBeGreaterThanOrEqual(1);
    const bridges = l.fixes.filter((f) => f.id.startsWith('bridge:'));
    expect(bridges.map((f) => f.id)).toEqual(Array.from({ length: n1 + n2 }, (_, i) => `bridge:${i + 1}`));
    expect(bridges[0].message).toContain('line 1');
    expect(bridges[n1].message).toContain('line 2');

    const kept = fitLayout({ ...p, overrides: { 'bridge:1': true } }, fonts, birthday, 'blade', { strokeCheck: false });
    expect(fixIds(kept)).not.toContain('bridge:1');
    expect(fixIds(kept)).toContain(`bridge:${n1 + n2}`);
    expect(kept.blocks.l1.bridges).toBe(n1);
    expect(kept.notes.some((n) => n.level === 'warn' && /bridge/.test(n.message))).toBe(true);
  });

  describe('clear:l2', () => {
    test('a tall line 2 grows line 1', () => {
      const p = withAdvanced(base(), { line2: { h: 40 } });
      const l = fitLayout(p, fonts, birthday, 'blade', { strokeCheck: false });
      expect(fixIds(l)).toContain('clear:l2');
      expect(step(l, 'l1')!.h).toBeGreaterThan(45);
      expect(step(l, 'l2')!.h).toBe(40);
      expectConstraints(l, p, 'grow h1');
    });

    test('when line 1 can grow no further, line 2 lowers', () => {
      const p = withAdvanced(base(), { line1: { d: 60, h: 45 }, line2: { h: 40, d: 12 } });
      const { W } = cardDims(p);
      const l = fitLayout(p, fonts, birthday, 'blade', { strokeCheck: false });
      expect(fixIds(l)).toContain('clear:l2');
      const [l1, l2] = [step(l, 'l1')!, step(l, 'l2')!];
      expect(l1.h).toBeGreaterThan(45);
      expect(l1.d + l1.h + l1.s).toBeLessThanOrEqual(W - MARGIN_MM + EPS);
      expect(l2.h).toBeLessThan(40);
      expectConstraints(l, p, 'lower h2');
    });

    test('undone, both heights stay, line 2 keeps its hinge on line 1, with a warning', () => {
      const p = { ...withAdvanced(base(), { line2: { h: 40 } }), overrides: { 'clear:l2': true as const } };
      const l = fitLayout(p, fonts, birthday, 'blade', { strokeCheck: false });
      expect(fixIds(l)).not.toContain('clear:l2');
      const [l1, l2] = [step(l, 'l1')!, step(l, 'l2')!];
      expect(l1.h).toBeCloseTo(45, 9);
      expect(l2.h).toBe(40);
      expect(l2.h + WEB_MM).toBeLessThanOrEqual(l1.h + EPS);
      expect(l.notes.some((n) => n.level === 'warn' && /hide part of line 1/.test(n.message))).toBe(true);
    });

    test('undone with a very short line 1, line 2 never drops under 4 mm', () => {
      const p = {
        ...withAdvanced(base(), { line1: { h: 5 } }),
        overrides: { 'clear:l2': true as const, 'fit:l1': true as const },
      };
      const l = fitLayout(p, fonts, birthday, 'blade', { strokeCheck: false });
      expect(step(l, 'l1')!.h).toBe(5);
      expect(step(l, 'l2')!.h).toBeGreaterThanOrEqual(WEB_MM + 1);
      expect(l.steps.every((s) => s.d > 0 && s.h > 0 && s.s > 0)).toBe(true);
    });
  });

  describe('wide rails and clearance (codec-valid Advanced values)', () => {
    const wide = (size: CardSize, railMm: number, clearanceMm: number, over: Partial<Params> = {}) =>
      withAdvanced(base({ size, spine: 'short', ...over }), { railMm, clearanceMm });
    /** Rails listed as narrowed are 5 mm (accents always use at least 5 mm); the rest keep the user's width. */
    const railsOf = (p: Params, narrowed: string[]) => (id: string) =>
      narrowed.includes(id) || id.startsWith('a') ? RAIL_MM : p.advanced.railMm;

    // Before this fix: A6 → line 2 cap −2.36 mm, A2 → −1.35 mm, A6 clearance 6 → line 2 0.37 mm.
    test.each([
      ['a6', 20, 10, ['l1']],
      ['a2', 20, 10, ['l2']],
      ['a6', 20, 6, ['l2']],
    ] as const)('%s, rail %d, clearance %d: rails narrow under rail:<id>, every size positive', (size, rail, c, narrowed) => {
      const p = wide(size, rail, c);
      const l = fitLayout(p, fonts, birthday, 'blade', { strokeCheck: false });
      expect(l.lines).toEqual(['HAPPY BIRTHDAY', 'SAM']);
      expect(fixIds(l).filter((id) => id.startsWith('rail:'))).toEqual(narrowed.map((id) => `rail:${id}`));
      expect(l.blocks.l2.capMm).toBeGreaterThanOrEqual(CAP_FLOOR_MM);
      expect(l.blocks.l1.capMm).toBeGreaterThanOrEqual(CAP_FLOOR_MM);
      expect(l.notes.some((n) => n.level === 'strong')).toBe(Math.min(l.blocks.l1.capMm, l.blocks.l2.capMm) < STRONG_CAP_MM);
      expectConstraints(l, p, `${size} rail ${rail} c ${c}`, railsOf(p, [...narrowed]));
    });

    test('undoing a needed narrowing still narrows, with a warning instead of the fix', () => {
      const p = { ...wide('a6', 20, 10), overrides: { 'rail:l1': true as const } };
      const l = fitLayout(p, fonts, birthday, 'blade', { strokeCheck: false });
      expect(fixIds(l)).not.toContain('rail:l1');
      expect(l.notes.some((n) => n.level === 'warn' && /stay narrowed/.test(n.message))).toBe(true);
      expect(l.blocks.l1.capMm).toBeGreaterThanOrEqual(CAP_FLOOR_MM);
      expectConstraints(l, p, 'undone narrowing', railsOf(p, ['l1']));
    });

    test('a line 2 that cannot fit even with 5 mm rails is left out with a strong note', () => {
      const p = wide('a6', 20, 10, { line2: 'ALEXANDRA THE MAGNIFICENT OF YORK' });
      const l = fitLayout(p, fonts, birthday, 'blade', { strokeCheck: false });
      expect(l.lines).toEqual(['HAPPY BIRTHDAY']);
      expect(step(l, 'l2')).toBeUndefined();
      expect(l.notes).toContainEqual({ level: 'strong', message: LINE2_DROPPED });
      expect(l.fixes.filter((f) => f.id.endsWith(':l2'))).toEqual([]);
      expectConstraints(l, p, 'line 2 dropped', railsOf(p, ['l1']));
    });
  });

  test('widths are measured at the chosen cap, so tight lines never overrun', () => {
    for (const size of Object.keys(CARD_SIZES) as CardSize[]) {
      const p = base({ size });
      const l = fitLayout(p, fonts, birthday, 'blade');
      const { L } = cardDims(p);
      const m = measureLine('HAPPY BIRTHDAY', rokkitt, 'tight', l.blocks.l1.capMm);
      expect(m.inkWPerCap * l.blocks.l1.capMm).toBeLessThanOrEqual(L - 2 * MARGIN_MM - 2 * RAIL_MM - 2 * CLEARANCE_MM + EPS);
    }
  });
});

describe('splitBalanced', () => {
  const len = (t: string) => t.length;
  test('picks the space that minimises the wider half', () => {
    expect(splitBalanced('HAPPY BIRTHDAY TO YOU', len)).toEqual(['HAPPY BIRTHDAY', 'TO YOU']);
    expect(splitBalanced('A BB CCC', len)).toEqual(['A BB', 'CCC']);
  });
  test('null when there is no space', () => {
    expect(splitBalanced('SUPERCALIFRAGILISTIC', len)).toBeNull();
  });
});
