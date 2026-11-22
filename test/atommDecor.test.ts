// @vitest-environment happy-dom
/**
 * The Atomm host with the real app: the Decorations card renders, Flat view dragging works with plain
 * pointer events, and analytics stay off (R27).
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { LoadedFont } from '../src/core/fonts';
import { defaultParams } from '../src/core/model';
import { decorFromStyle } from '../src/core/decor/model';
import { canPlace } from '../src/core/decor/place';
import { themeById } from '../src/themes';
import { mountApp, type AppApi, type SceneLike } from '../src/ui/app';
import { arvo } from './helpers/fonts';

const loadFont = async (): Promise<LoadedFont> => ({ font: arvo, usedFamily: 'Arvo' });
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

let root: HTMLElement;
let app: AppApi;
let capture: ReturnType<typeof vi.fn>;
let savedCtm: PropertyDescriptor | undefined;

beforeEach(async () => {
  history.replaceState(null, '', '/');
  capture = vi.fn();
  (globalThis as { posthog?: unknown }).posthog = { capture };
  savedCtm = Object.getOwnPropertyDescriptor(SVGSVGElement.prototype, 'getScreenCTM');
  Object.defineProperty(SVGSVGElement.prototype, 'getScreenCTM', { configurable: true, value: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) });
  root = document.createElement('div');
  document.body.replaceChildren(root);
  app = mountApp(root, 'atomm', {}, { loadFont, createScene: noScene, storage: null, locale: 'en-US' });
  await app.whenIdle();
  app.setParams({ ...defaultParams('en-US'), decor: decorFromStyle(themeById('birthday'), 'confetti', 7) });
  await app.whenIdle();
});

afterEach(() => {
  app.destroy();
  (globalThis as { posthog?: unknown }).posthog = undefined;
  if (savedCtm) Object.defineProperty(SVGSVGElement.prototype, 'getScreenCTM', savedCtm);
});

test('the Decorations card renders on Atomm', () => {
  expect(root.querySelector('[data-ph-capture-attribute-style="confetti"]')).toBeTruthy();
  expect(root.querySelectorAll('.decor-chip').length).toBeGreaterThan(0);
});

test('a pointer drag on the Flat view moves an illustration, and nothing is tracked', () => {
  root.querySelector<HTMLElement>('#cl-tab-flat')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const svg = root.querySelector<SVGSVGElement>('.sheet[data-sheet="inner"] svg')!;
  const { widthMm, heightMm } = app.getCard().inner;
  const W = widthMm / 2;
  const L = heightMm;
  const layout = app.getCard().decor;
  const item = layout.items[0];
  let to: { x: number; y: number } | null = null;
  for (let x = W - 10; x > 10 && !to; x -= 2)
    for (let y = 10; y < L - 10 && !to; y += 2)
      if (canPlace(layout, { ...item, page: 'base', centre: { x, y } }, W, L)) to = { x, y };
  const at = (p: { x: number; y: number }) => ({ clientX: p.x + W, clientY: L - p.y });
  const fire = (el: Element, type: string, p: { x: number; y: number }) =>
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, ...at(p) }));
  fire(svg.querySelector(`.decor-hit[data-item="${item.id}"]`)!, 'pointerdown', item.centre);
  fire(svg, 'pointermove', { x: (item.centre.x + to!.x) / 2, y: (item.centre.y + to!.y) / 2 });
  fire(svg, 'pointermove', to!);
  fire(svg, 'pointerup', to!);
  expect(app.getParams().decor.items.find((i) => i.id === item.id)!.at).toBeTruthy();
  window.dispatchEvent(new Event('pagehide'));
  expect(capture).not.toHaveBeenCalled();
});
