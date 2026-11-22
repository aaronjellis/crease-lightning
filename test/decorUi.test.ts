// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { LoadedFont } from '../src/core/fonts';
import { defaultParams } from '../src/core/model';
import { decorFromStyle } from '../src/core/decor/model';
import { iconById, themeById } from '../src/themes';
import { mountApp, type AppApi, type SceneLike } from '../src/ui/app';
import { alfa, arvo, rokkitt } from './helpers/fonts';

const FONTS: Record<string, LoadedFont['font']> = { 'Alfa Slab One': alfa, Arvo: arvo, Rokkitt: rokkitt };
const loadFont = async (family: string): Promise<LoadedFont> => ({ font: FONTS[family] ?? arvo, usedFamily: FONTS[family] ? family : 'Arvo' });
const noScene = (): SceneLike => ({
  ready: Promise.resolve({ ok: false, error: new Error('WebGL is not available') }),
  onTheta: null,
  setCard() {},
  setTheta() {},
  animateTo: async () => {},
  setFoldStep() {},
  renderPng: async () => {
    throw new Error('no 3D');
  },
  dispose() {},
});

const birthday = themeById('birthday');
let root: HTMLElement;
let app: AppApi;
let capture: ReturnType<typeof vi.fn>;

const $ = <E extends Element = HTMLElement>(sel: string) => root.querySelector<E>(sel)!;
const $$ = <E extends Element = HTMLElement>(sel: string) => [...root.querySelectorAll<E>(sel)];
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const byText = (text: string, sel = 'button') => $$(sel).find((b) => b.textContent?.trim() === text)!;
const undo = () => $('.decor-undo');
const events = () => capture.mock.calls.map((c) => c[0] as string);
const tile = (style: string) => $(`[data-ph-capture-attribute-style="${style}"]`);
const chips = () => $$('.decor-chip');
const seedDecor = (style: string, seed = 7) => decorFromStyle(birthday, style, seed);
const change = (el: HTMLInputElement | HTMLSelectElement, value?: string | boolean) => {
  if (typeof value === 'boolean') (el as HTMLInputElement).checked = value;
  else if (value !== undefined) el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

beforeEach(async () => {
  history.replaceState(null, '', '/');
  capture = vi.fn();
  (globalThis as { posthog?: unknown }).posthog = { capture };
  root = document.createElement('div');
  document.body.replaceChildren(root);
  app = mountApp(root, 'labs', {}, { loadFont, createScene: noScene, storage: null, locale: 'en-US' });
  await app.whenIdle();
  app.setParams({ ...defaultParams('en-US'), decor: seedDecor('confetti') });
});

afterEach(() => {
  app.destroy();
  (globalThis as { posthog?: unknown }).posthog = undefined;
});

describe('Decorations card', () => {
  test('picking a style applies it and Undo restores the previous decor', () => {
    const before = app.getParams().decor;
    click(byText('Balloons'));
    expect(app.getParams().decor).toEqual(seedDecor('balloons'));
    expect(undo().hidden).toBe(false);
    click(undo());
    expect(app.getParams().decor).toEqual(before);
    expect(undo().hidden).toBe(true);
  });

  test('switching theme stashes the decor; Undo brings it back', () => {
    const before = app.getParams().decor;
    click($('[data-ph-capture-attribute-theme="christmas"]'));
    expect(app.getParams().theme).toBe('christmas');
    expect(app.getParams().decor.style).toBe('holly');
    click(undo());
    expect(app.getParams().decor).toEqual(before);
    expect(undo().hidden).toBe(true);
  });

  test('any other decor change clears the stash', () => {
    click(byText('Balloons'));
    click(byText('Shuffle'));
    expect(undo().hidden).toBe(true);
  });

  test('the pressed tile reads custom after an edit', () => {
    expect(tile('confetti').getAttribute('aria-pressed')).toBe('true');
    expect(tile('confetti').textContent).toBe('Confetti');
    click(chips()[0].querySelector('.decor-chip-remove')!);
    expect(tile('confetti').textContent).toBe('Confetti (custom)');
  });

  test('a seed change alone is not an edit', () => {
    click(byText('Shuffle'));
    expect(tile('confetti').textContent).toBe('Confetti');
  });

  test('removing a chip removes that item', () => {
    const first = app.getParams().decor.items[0];
    const n = app.getParams().decor.items.length;
    const x = $(`[data-ph-capture-attribute-item="${first.id}"] .decor-chip-remove`);
    expect(x.getAttribute('aria-label')).toBe(`Remove ${iconById(first.icon).name}`);
    click(x);
    const items = app.getParams().decor.items;
    expect(items).toHaveLength(n - 1);
    expect(items.some((i) => i.id === first.id)).toBe(false);
  });

  test('Add lists the current theme first, and picking stork appends it', () => {
    click(byText('Add'));
    const dialog = $('.decor-add');
    expect(dialog.querySelector('h2')!.textContent).toBe('Add an illustration');
    expect(dialog.querySelector('.decor-group h3')!.textContent).toBe('Birthday');
    click(dialog.querySelector('[data-ph-capture-attribute-icon="stork"]')!);
    const items = app.getParams().decor.items;
    const last = items[items.length - 1];
    expect(last.icon).toBe('stork');
    expect([last.minMm, last.maxMm]).toEqual(iconById('stork').defaultMm);
  });

  test('Find narrows the Add list by name', () => {
    click(byText('Add'));
    const find = $<HTMLInputElement>('.decor-add input');
    find.value = 'cake';
    find.dispatchEvent(new Event('input', { bubbles: true }));
    const shown = $$('.decor-add .decor-pick').filter((b) => !b.closest('[hidden]'));
    expect(shown.length).toBeGreaterThan(0);
    for (const b of shown) expect(b.textContent!.toLowerCase()).toContain('cake');
  });

  test('the border switch turns the border off and on', () => {
    app.setParams({ ...app.getParams(), decor: seedDecor('candles') });
    const sw = $<HTMLInputElement>('input[name="decor-border"]');
    expect(sw.checked).toBe(true);
    change(sw, false);
    expect(app.getParams().decor.border).toBeNull();
    change(sw, true);
    expect(app.getParams().decor.border).toBe('dot-row');
  });

  test('the border switch on a borderless style uses the first pattern', () => {
    change($<HTMLInputElement>('input[name="decor-border"]'), true);
    expect(app.getParams().decor.border).toBe('dot-row');
  });

  test('the pattern select changes the border', () => {
    app.setParams({ ...app.getParams(), decor: seedDecor('candles') });
    change($<HTMLSelectElement>('select[name="decor-pattern"]'), 'star-row');
    expect(app.getParams().decor.border).toBe('star-row');
  });

  test('Shuffle changes the seed', () => {
    const seed = app.getParams().decor.seed;
    click(byText('Shuffle'));
    expect(app.getParams().decor.seed).not.toBe(seed);
  });

  test('Unpin all clears every pin', () => {
    const d = app.getParams().decor;
    app.setParams({ ...app.getParams(), decor: { ...d, items: d.items.map((i) => ({ ...i, at: { page: 'base' as const, u: 0.5, v: 0.5 } })) } });
    click(byText('Unpin all'));
    expect(app.getParams().decor.items.every((i) => !i.at)).toBe(true);
  });

  test('the Size slider appears for a selected chip and sets sizeMm', () => {
    const slider = $<HTMLInputElement>('input[name="decor-size"]');
    expect(slider.closest('[hidden]')).not.toBeNull();
    const item = app.getParams().decor.items[0];
    click($(`[data-ph-capture-attribute-item="${item.id}"] .decor-chip-select`));
    expect(slider.closest('[hidden]')).toBeNull();
    expect(slider.min).toBe(String(iconById(item.icon).minHeightMm));
    expect(slider.max).toBe('60');
    slider.value = '30';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(app.getParams().decor.items[0].sizeMm).toBe(30);
  });

  test('None empties the card and shows the empty note', () => {
    click(byText('None'));
    expect(app.getParams().decor.items).toEqual([]);
    expect($('.decor-empty').hidden).toBe(false);
  });

  test('tracks each decorations event', () => {
    click(byText('Balloons'));
    click($('input[name="decor-border"]'));
    click(byText('Add'));
    click($('.decor-add [data-ph-capture-attribute-icon="stork"]'));
    click(chips()[0].querySelector('.decor-chip-remove')!);
    click(byText('Shuffle'));
    expect(events()).toEqual(['decor_style_picked', 'decor_border_toggled', 'decor_item_added', 'decor_item_removed', 'decor_shuffled']);
    expect(capture).toHaveBeenCalledWith('decor_style_picked', { project: 'crease-lightning', theme: 'birthday', style: 'balloons' });
    expect(capture).toHaveBeenCalledWith('decor_item_added', { project: 'crease-lightning', icon: 'stork' });
  });
});
