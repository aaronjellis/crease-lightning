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

const christmasStub: ThemeDefaults = {
  id: 'christmas',
  lines: ['MERRY CHRISTMAS', ''],
  font: 'Alfa Slab One',
  colours: { inner: '#ffffff', jacket: '#1f7a3a' },
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
      version: 1,
      theme: 'birthday',
      spacing: 'tight',
      allCaps: true,
      autoSplit: true,
      accents: true,
      motifs: true,
      spine: 'long',
      overrides: {},
    });
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
});
