// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { LoadedFont } from '../src/core/fonts';
import { defaultParams } from '../src/core/model';
import { area, intersect } from '@kerfuffle/engine/geom';
import { MARGIN_MM } from '../src/core/constants';
import { iconExtent, toPin } from '../src/core/decor/geometry';
import { decorFromStyle, moveItem } from '../src/core/decor/model';
import { canPlace } from '../src/core/decor/place';
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

  const selectFirst = () => click($(`[data-ph-capture-attribute-item="${app.getParams().decor.items[1].id}"] .decor-chip-select`));
  const sizeHidden = () => $('input[name="decor-size"]').closest('[hidden]') !== null;

  test('a style pick, Undo, and None clear the selection', () => {
    selectFirst();
    expect(sizeHidden()).toBe(false);
    click(byText('Balloons'));
    expect(sizeHidden()).toBe(true);
    selectFirst();
    expect(sizeHidden()).toBe(false);
    click(undo());
    expect(sizeHidden()).toBe(true);
    selectFirst();
    click(byText('None'));
    expect(sizeHidden()).toBe(true);
  });

  test('a theme change clears the selection', () => {
    selectFirst();
    click($('[data-ph-capture-attribute-theme="christmas"]'));
    expect(sizeHidden()).toBe(true);
  });

  test('ordinary edits keep the selection', () => {
    selectFirst();
    click(byText('Shuffle'));
    expect(sizeHidden()).toBe(false);
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

describe('Flat view editing', () => {
  const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  let savedCtm: PropertyDescriptor | undefined;

  beforeEach(async () => {
    // happy-dom has no layout: map client pixels straight to sheet mm.
    savedCtm = Object.getOwnPropertyDescriptor(SVGSVGElement.prototype, 'getScreenCTM');
    Object.defineProperty(SVGSVGElement.prototype, 'getScreenCTM', { configurable: true, value: () => IDENTITY });
    await app.whenIdle();
    click($('#cl-tab-flat'));
  });

  afterEach(() => {
    if (savedCtm) Object.defineProperty(SVGSVGElement.prototype, 'getScreenCTM', savedCtm);
    else delete (SVGSVGElement.prototype as { getScreenCTM?: unknown }).getScreenCTM;
  });

  const innerSvg = () => $<SVGSVGElement>('.sheet[data-sheet="inner"] svg');
  const jacketSvg = () => $<SVGSVGElement>('.sheet[data-sheet="jacket"] svg');
  const hit = (id: string) => innerSvg().querySelector<SVGPathElement>(`.decor-hit[data-item="${id}"]`)!;
  const size = () => {
    const card = app.getCard();
    return { W: card.inner.widthMm / 2, L: card.inner.heightMm };
  };
  /** Client coordinates of a flat point: sheet x = u + W, y flipped (identity CTM). */
  const client = (p: { x: number; y: number }) => {
    const { W, L } = size();
    return { clientX: p.x + W, clientY: L - p.y };
  };
  const pointer = (el: Element, type: string, at: { clientX: number; clientY: number }) =>
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, ...at }));
  const key = (el: Element, k: string, shiftKey = false) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));
  const placedItem = (i = 0) => app.getCard().decor.items[i];
  /** A base-page spot where `item` fits, and fits 1 mm further from the spine too. */
  const freeSpot = (item: ReturnType<typeof placedItem>) => {
    const { W, L } = size();
    const layout = app.getCard().decor;
    for (let x = W - 10; x > 10; x -= 2) {
      for (let y = 10; y < L - 10; y += 2) {
        const at = (dx: number) => ({ ...item, page: 'base' as const, centre: { x: x + dx, y } });
        if (canPlace(layout, at(0), W, L) && canPlace(layout, at(1), W, L)) return { x, y };
      }
    }
    throw new Error('no free spot');
  };
  const drag = (id: string, from: { x: number; y: number }, to: { x: number; y: number }, release: Element = innerSvg()) => {
    pointer(hit(id), 'pointerdown', client(from));
    pointer(innerSvg(), 'pointermove', client({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }));
    pointer(release, 'pointermove', client(to));
    pointer(release, 'pointerup', client(to));
  };

  /** Pins item 0 at a base-page spot with room to its right, then focuses it (which selects it). */
  const pinFree = async () => {
    const item = placedItem();
    const { W, L } = size();
    const to = freeSpot(item);
    app.setParams({ ...app.getParams(), decor: moveItem(app.getParams().decor, item.id, toPin('base', to, W, L), item.sizeMm) });
    await app.whenIdle();
    hit(item.id).focus();
    return item.id;
  };

  test('every placed item on the inner sheet has a named hit target', () => {
    const items = app.getCard().decor.items;
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      const target = hit(it.id);
      expect(target.getAttribute('aria-label')).toBe(iconById(it.icon).name);
      expect(target.getAttribute('tabindex')).toBe('0');
    }
    expect(innerSvg().getAttribute('tabindex')).toBe('0');
    expect(innerSvg().getAttribute('aria-label')).toMatch(/^Inner sheet/);
  });

  test('the jacket figure has no hit targets', () => {
    expect(jacketSvg().querySelectorAll('.decor-hit, [tabindex]')).toHaveLength(0);
  });

  test('a drag to a free spot pins the item there at its drawn size', async () => {
    const item = placedItem();
    const to = freeSpot(item);
    const { W, L } = size();
    drag(item.id, item.centre, to);
    const stored = app.getParams().decor.items.find((i) => i.id === item.id)!;
    expect(stored.at).toEqual(toPin('base', to, W, L));
    expect(stored.sizeMm).toBe(item.sizeMm);
    await app.whenIdle();
    const moved = app.getCard().decor.items.find((i) => i.id === item.id)!;
    expect(moved.centre.x).toBeCloseTo(to.x, 6);
    expect(moved.centre.y).toBeCloseTo(to.y, 6);
    expect(moved.displaced).toBe(false);
  });

  test('pointerdown on an item selects it', () => {
    const item = placedItem(1);
    pointer(hit(item.id), 'pointerdown', client(item.centre));
    pointer(innerSvg(), 'pointerup', client(item.centre));
    expect(hit(item.id).getAttribute('aria-pressed')).toBe('true');
    expect($('input[name="decor-size"]').closest('[hidden]')).toBeNull();
  });

  describe('a blocked drop leaves the params alone and restores the item', () => {
    /** A base-page point inside a strip footprint, well clear of the spine. */
    const onStrip = () => {
      const { W, L } = size();
      const { keepOut } = app.getCard().decor;
      for (let x = 20; x < W - 10; x += 1) {
        for (let y = 10; y < L - 10; y += 1) {
          const sq = [[{ x, y }, { x: x + 0.5, y }, { x: x + 0.5, y: y + 0.5 }, { x, y: y + 0.5 }]];
          if (area(intersect(keepOut, sq)) > 0.2) return { x, y };
        }
      }
      throw new Error('no strip footprint');
    };
    const cases: [string, () => { to: { x: number; y: number }; release?: Element }][] = [
      ['onto a strip footprint', () => ({ to: onStrip() })],
      ['across the spine fold', () => ({ to: { x: 0, y: size().L / 2 } })],
      ['off the sheet', () => ({ to: { x: size().W + 30, y: size().L / 2 } })],
      // The jacket sits beside the inner sheet: a release over it is off the inner sheet.
      ['onto the jacket figure', () => ({ to: { x: size().W + 24 + size().W, y: size().L / 2 }, release: jacketSvg() })],
    ];
    for (const [name, where] of cases) {
      test(name, async () => {
        const before = structuredClone(app.getParams());
        const item = placedItem();
        const d = hit(item.id).getAttribute('d');
        const { to, release } = where();
        drag(item.id, item.centre, to, release);
        expect(app.getParams()).toEqual(before);
        expect(innerSvg().querySelector('.decor-ghost')).toBeNull();
        expect(hit(item.id).getAttribute('d')).toBe(d);
        await app.whenIdle();
        expect(app.getCard().decor.items.find((i) => i.id === item.id)!.centre).toEqual(item.centre);
      });
    }

    test('the ghost shows blocked while over a fold', () => {
      const item = placedItem();
      pointer(hit(item.id), 'pointerdown', client(item.centre));
      pointer(innerSvg(), 'pointermove', client({ x: 0, y: size().L / 2 }));
      expect(innerSvg().querySelector('.decor-ghost')!.getAttribute('data-state')).toBe('blocked');
      pointer(innerSvg(), 'pointerup', client({ x: 0, y: size().L / 2 }));
    });
  });

  describe('keyboard', () => {
    test('focusing an item selects it', async () => {
      const id = await pinFree();
      expect(hit(id).getAttribute('aria-pressed')).toBe('true');
    });

    test('ArrowRight moves the pin 1 mm away from the spine on the base page', async () => {
      const id = await pinFree();
      const { W } = size();
      const before = app.getParams().decor.items.find((i) => i.id === id)!.at!;
      key(hit(id), 'ArrowRight');
      const after = app.getParams().decor.items.find((i) => i.id === id)!.at!;
      expect(after.page).toBe('base');
      expect(after.u - before.u).toBeCloseTo(1 / (W - MARGIN_MM), 9);
      expect(after.v).toBeCloseTo(before.v, 9);
    });

    test('a nudge into a fold does nothing', async () => {
      const item = placedItem();
      const { W, L } = size();
      // Pinned right against the spine's keep-out: one more millimetre toward it is blocked.
      let x = freeSpot(item).x;
      while (canPlace(app.getCard().decor, { ...item, page: 'base', centre: { x: x - 1, y: freeSpot(item).y } }, W, L) && x > 0) x -= 1;
      const at = toPin('base', { x, y: freeSpot(item).y }, W, L);
      app.setParams({ ...app.getParams(), decor: moveItem(app.getParams().decor, item.id, at, item.sizeMm) });
      await app.whenIdle();
      const before = structuredClone(app.getParams());
      hit(item.id).focus();
      key(hit(item.id), 'ArrowLeft');
      expect(app.getParams()).toEqual(before);
    });

    test('+ and - resize by 0.5 mm', async () => {
      const id = await pinFree();
      const start = app.getParams().decor.items.find((i) => i.id === id)!.sizeMm!;
      key(hit(id), '+');
      expect(app.getParams().decor.items.find((i) => i.id === id)!.sizeMm).toBe(start + 0.5);
      key(hit(id), '-');
      key(hit(id), '-');
      expect(app.getParams().decor.items.find((i) => i.id === id)!.sizeMm).toBe(start - 0.5);
    });

    test('Delete removes the selected item', async () => {
      const id = await pinFree();
      key(hit(id), 'Delete');
      expect(app.getParams().decor.items.some((i) => i.id === id)).toBe(false);
      await app.whenIdle();
      expect(document.activeElement).toBe(innerSvg());
    });

    test('Escape clears the selection', async () => {
      const id = await pinFree();
      key(hit(id), 'Escape');
      expect(innerSvg().querySelector('.decor-hit[aria-pressed="true"]')).toBeNull();
      expect($('input[name="decor-size"]').closest('[hidden]')).not.toBeNull();
    });

    test('focus stays on the item across the rebuild', async () => {
      const id = await pinFree();
      key(hit(id), 'ArrowRight');
      await app.whenIdle();
      expect(document.activeElement).toBe(hit(id));
    });
  });

  test('dragging the size handle inward shrinks the item', async () => {
    const id = await pinFree();
    const it = app.getCard().decor.items.find((i) => i.id === id)!;
    const handle = innerSvg().querySelector('.decor-handle')!;
    const aspect = iconExtent(it.icon, 1).w;
    const corner = { x: it.centre.x + it.sizeMm / 2, y: it.centre.y - (aspect * it.sizeMm) / 2 };
    const to = { x: corner.x - 1, y: corner.y + aspect };
    pointer(handle, 'pointerdown', client(corner));
    // Out past the drag slop (1 px = 1 mm here) first, then to the spot.
    pointer(innerSvg(), 'pointermove', client({ x: corner.x + 10, y: corner.y - 10 }));
    pointer(innerSvg(), 'pointermove', client(to));
    pointer(innerSvg(), 'pointerup', client(to));
    const want = Math.max(iconById(it.icon).minHeightMm, Math.round((it.sizeMm - 2) * 2) / 2);
    expect(app.getParams().decor.items.find((i) => i.id === id)!.sizeMm).toBe(want);
  });

  test("the sheet's delete button removes the selected item and clears the selection", async () => {
    const id = await pinFree();
    const it = app.getParams().decor.items.find((i) => i.id === id)!;
    const x = $('.sheet[data-sheet="inner"] .decor-remove');
    expect(x.getAttribute('aria-label')).toBe(`Remove ${iconById(it.icon).name}`);
    expect(x.getAttribute('data-ph-capture-attribute-item')).toBe(id);
    click(x);
    expect(app.getParams().decor.items.some((i) => i.id === id)).toBe(false);
    expect($('input[name="decor-size"]').closest('[hidden]')).not.toBeNull();
    expect(root.querySelector('.decor-remove')).toBeNull();
    await app.whenIdle();
    expect(innerSvg().querySelector('.decor-hit[aria-pressed="true"]')).toBeNull();
    expect(document.activeElement).toBe(innerSvg());
  });

  test('no delete button without a selection', () => {
    expect(root.querySelector('.decor-remove')).toBeNull();
  });

  test('a selection made in the rail shows on the sheet', () => {
    const item = app.getParams().decor.items[1];
    click($(`.decor-chip[data-ph-capture-attribute-item="${item.id}"] .decor-chip-select`));
    expect(hit(item.id).getAttribute('aria-pressed')).toBe('true');
    expect(innerSvg().querySelector('.decor-handle')).not.toBeNull();
  });
});
