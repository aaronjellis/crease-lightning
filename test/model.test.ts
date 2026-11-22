import { describe, expect, test } from 'vitest';
import {
  CARD_SIZES,
  applyTheme,
  BIRTHDAY_DEFAULTS,
  cardDims,
  defaultParams,
  withSize,
  type ThemeDefaults,
} from '../src/core/model';
import {
  addItem,
  decorFromStyle,
  moveItem,
  nextItemId,
  removeItem,
  resizeItem,
  shuffle,
  unpinAll,
} from '../src/core/decor/model';
import type { Decor } from '../src/core/decor/types';
import { iconById, themeById } from '../src/themes';

const christmasStub: ThemeDefaults = {
  id: 'christmas',
  lines: ['MERRY CHRISTMAS', ''],
  font: 'Alfa Slab One',
  colours: { inner: '#ffffff', jacket: '#1f7a3a' },
  styles: [],
};

describe('model', () => {
  test('5x7 short spine swaps W and L', () => {
    expect(cardDims({ ...defaultParams('en-US'), spine: 'short' })).toEqual({ W: 178, L: 127 });
  });
  test('5x7 long spine keeps W and L', () => {
    expect(cardDims(defaultParams('en-US'))).toEqual({ W: 127, L: 178 });
  });
  test('card sizes match the spec', () => {
    expect(CARD_SIZES.a2).toMatchObject({ closedW: 108, closedL: 140 });
    expect(CARD_SIZES.a6).toMatchObject({ closedW: 105, closedL: 148 });
    expect(CARD_SIZES.a5).toMatchObject({ closedW: 148, closedL: 210 });
  });
  test('locale picks the default size', () => {
    expect(defaultParams('en-US').size).toBe('5x7');
    expect(defaultParams('de-DE').size).toBe('a6');
  });
  test('defaults', () => {
    const p = defaultParams('en-US');
    expect(p).toMatchObject({
      version: 2,
      theme: 'birthday',
      spacing: 'tight',
      allCaps: true,
      autoSplit: true,
      spine: 'long',
      overrides: {},
    });
    expect(p.decor).toEqual(decorFromStyle(themeById('birthday'), 'confetti', 1));
    expect('accents' in p).toBe(false);
    expect('motifs' in p).toBe(false);
    expect(p.advanced).toMatchObject({ overhangMm: 3, railMm: 5, clearanceMm: 2, foldStyle: 'auto' });
  });
  test('theme switch keeps typed text, replaces untouched defaults', () => {
    const p = { ...defaultParams('en-US'), line2: 'GRANDMA' };
    expect(applyTheme(p, christmasStub, BIRTHDAY_DEFAULTS).line2).toBe('GRANDMA');
    expect(applyTheme(defaultParams('en-US'), christmasStub, BIRTHDAY_DEFAULTS).line1).toBe(christmasStub.lines[0]);
  });
  test('theme switch applies theme id, font and colours', () => {
    const q = applyTheme(defaultParams('en-US'), christmasStub, BIRTHDAY_DEFAULTS);
    expect(q.theme).toBe('christmas');
    expect(q.font).toBe('Alfa Slab One');
    expect(q.colours.jacket).toBe('#1f7a3a');
  });
  test('typed line 1 survives a theme switch', () => {
    const p = { ...defaultParams('en-US'), line1: 'CONGRATS' };
    expect(applyTheme(p, christmasStub, BIRTHDAY_DEFAULTS).line1).toBe('CONGRATS');
  });
  test('size change keeps text and drops advanced dims', () => {
    const p = defaultParams('en-US');
    p.line1 = 'HELLO';
    p.advanced.line1 = { d: 30, h: 40 };
    p.advanced.line2 = { s: 10 };
    const q = withSize(p, 'a5');
    expect(q.size).toBe('a5');
    expect(q.line1).toBe('HELLO');
    expect(q.advanced.line1).toBeUndefined();
    expect(q.advanced.line2).toBeUndefined();
    expect(q.advanced.overhangMm).toBe(3);
  });
  test('theme or size change drops undone fixes for steps that no longer exist', () => {
    const p = { ...defaultParams('en-US'), line2: '', overrides: { 'fit:l2': true, 'accent:hide': true } as Record<string, true> };
    expect(applyTheme(p, christmasStub, BIRTHDAY_DEFAULTS).overrides).toEqual({});
    expect(withSize(p, 'a6').overrides).toEqual({});
  });
  const weddingStub: ThemeDefaults = {
    id: 'wedding',
    lines: ['CONGRATULATIONS', 'MR AND MRS'],
    font: 'Arvo',
    colours: { inner: '#ffffff', jacket: '#d9c7a3' },
    styles: [],
  };
  test('non-birthday switch replaces untouched prev defaults', () => {
    const p = applyTheme(defaultParams('en-US'), christmasStub, BIRTHDAY_DEFAULTS);
    const q = applyTheme({ ...p, line2: christmasStub.lines[1] }, weddingStub, christmasStub);
    expect(q.theme).toBe('wedding');
    expect(q.line1).toBe('CONGRATULATIONS');
    expect(q.line2).toBe('MR AND MRS');
  });
  test('explicit prev decides what is untouched', () => {
    const p = { ...defaultParams('en-US'), line1: 'MERRY CHRISTMAS' };
    expect(applyTheme(p, weddingStub, BIRTHDAY_DEFAULTS).line1).toBe('MERRY CHRISTMAS');
    expect(applyTheme(p, weddingStub, christmasStub).line1).toBe('CONGRATULATIONS');
  });
  test('a cleared line stays empty on theme switch', () => {
    const p = { ...defaultParams('en-US'), line1: '', line2: '' };
    const q = applyTheme(p, weddingStub, BIRTHDAY_DEFAULTS);
    expect(q.line1).toBe('');
    expect(q.line2).toBe('');
  });
  test('mixed: untouched line 1 replaced, typed line 2 kept', () => {
    const p = { ...defaultParams('en-US'), line2: 'GRANDMA' };
    const q = applyTheme(p, weddingStub, BIRTHDAY_DEFAULTS);
    expect(q.line1).toBe('CONGRATULATIONS');
    expect(q.line2).toBe('GRANDMA');
  });
  test('Birthday to Christmas gives Christmas its first style and keeps the seed', () => {
    const christmas = themeById('christmas');
    const p = defaultParams('en-US');
    const q = applyTheme({ ...p, decor: { ...p.decor, seed: 77 } }, christmas, themeById('birthday'));
    expect(q.decor).toEqual(decorFromStyle(christmas, christmas.styles[0].id, 77));
    expect(q.decor.style).toBe('holly');
  });
  test('a theme with no styles clears the decor but keeps the seed', () => {
    const p = defaultParams('en-US');
    expect(applyTheme({ ...p, decor: { ...p.decor, seed: 9 } }, themeById('blank'), themeById('birthday')).decor).toEqual({
      style: null,
      border: null,
      seed: 9,
      items: [],
    });
  });
});

describe('decor model', () => {
  const birthday = themeById('birthday');
  const base: Decor = decorFromStyle(birthday, 'confetti', 1);

  test("a style expands by count into items i1, i2, … with the style's sizes", () => {
    const style = birthday.styles.find((s) => s.id === 'confetti')!;
    const expected = style.items.flatMap((it) => Array.from({ length: it.count }, () => ({ icon: it.icon, minMm: it.minMm, maxMm: it.maxMm })));
    expect(base.items.map(({ id: _id, ...rest }) => rest)).toEqual(expected);
    expect(base.items.map((i) => i.id)).toEqual(expected.map((_, k) => `i${k + 1}`));
    expect(base).toMatchObject({ style: 'confetti', border: style.border, seed: 1 });
  });
  test('no style, or one the theme lacks, is an empty decor', () => {
    expect(decorFromStyle(birthday, null, 5)).toEqual({ style: null, border: null, seed: 5, items: [] });
    expect(decorFromStyle(birthday, 'holly', 5)).toEqual({ style: null, border: null, seed: 5, items: [] });
  });
  test('nextItemId is one past the largest', () => {
    expect(nextItemId([])).toBe('i1');
    expect(nextItemId([{ id: 'i3', icon: 'star', minMm: 9, maxMm: 13 }, { id: 'i10', icon: 'star', minMm: 9, maxMm: 13 }])).toBe('i11');
  });
  test("addItem appends the icon at its default size range", () => {
    const d = addItem(base, 'balloon');
    const [lo, hi] = iconById('balloon').defaultMm;
    expect(d.items).toHaveLength(base.items.length + 1);
    expect(d.items.at(-1)).toEqual({ id: `i${base.items.length + 1}`, icon: 'balloon', minMm: lo, maxMm: hi });
    expect(base.items).toHaveLength(10);
  });
  test('removeItem drops only that item', () => {
    const d = removeItem(base, 'i2');
    expect(d.items.map((i) => i.id)).not.toContain('i2');
    expect(d.items).toHaveLength(base.items.length - 1);
  });
  test('moveItem pins, resizeItem fixes the size, unpinAll unpins and keeps sizes', () => {
    const moved = moveItem(base, 'i1', { page: 'base', u: 0.3, v: 0.6 });
    expect(moved.items[0].at).toEqual({ page: 'base', u: 0.3, v: 0.6 });
    expect(moved.items[1].at).toBeUndefined();
    const sized = resizeItem(moved, 'i1', 12);
    expect(sized.items[0].sizeMm).toBe(12);
    const free = unpinAll(sized);
    expect(free.items.every((i) => !('at' in i))).toBe(true);
    expect(free.items[0].sizeMm).toBe(12);
    expect(base.items[0].at).toBeUndefined();
  });
  test('shuffle picks a new 32-bit seed and keeps the items', () => {
    const d = shuffle(base);
    expect(d.seed).not.toBe(base.seed);
    expect(Number.isInteger(d.seed) && d.seed >= 0 && d.seed < 2 ** 32).toBe(true);
    expect(d.items).toEqual(base.items);
  });
  test('shuffle draws from the source it is given, and never keeps the seed', () => {
    expect(shuffle(base, () => 0.25).seed).toBe(2 ** 30);
    expect(shuffle({ ...base, seed: 2 ** 30 }, () => 0.25).seed).toBe(2 ** 30 + 1);
    expect(shuffle(base, () => 0.25)).toEqual(shuffle(base, () => 0.25));
  });
  test('moveItem stores the size it was dropped at, within the item range and the icon minimum', () => {
    const [i1] = base.items;
    const at = { page: 'base' as const, u: 0.5, v: 0.5 };
    expect(moveItem(base, 'i1', at, i1.minMm + 1).items[0].sizeMm).toBe(i1.minMm + 1);
    expect(moveItem(base, 'i1', at, 999).items[0].sizeMm).toBe(i1.maxMm);
    expect(moveItem(base, 'i1', at, 0).items[0].sizeMm).toBe(Math.max(i1.minMm, iconById(i1.icon).minHeightMm));
    // A size the user set stays.
    expect(moveItem(resizeItem(base, 'i1', 40), 'i1', at, 12).items[0].sizeMm).toBe(40);
    expect(moveItem(base, 'i1', at).items[0].sizeMm).toBeUndefined();
  });
  test('moveItem clamps the pin to the usable rectangle', () => {
    const moved = moveItem(base, 'i1', { page: 'back', u: 1.4, v: -0.2 });
    expect(moved.items[0].at).toEqual({ page: 'back', u: 1, v: 0 });
  });
});
