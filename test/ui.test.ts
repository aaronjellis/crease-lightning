// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { LoadedFont } from '../src/core/fonts';
import { defaultParams, type Params } from '../src/core/model';
import { undone } from '../src/core/fixes';
import { EMPTY_MESSAGE_NOTE } from '../src/core/build';
import { mountApp, type AppDeps, type AppApi, type SceneLike } from '../src/ui/app';
import { TARGETS } from '../src/export/targets';
import { alfa, arvo, rokkitt } from './helpers/fonts';

const FONTS: Record<string, LoadedFont['font']> = { 'Alfa Slab One': alfa, Arvo: arvo, Rokkitt: rokkitt };

/** Bundled fonts load; any other family falls back to Arvo with loadFont's note. */
const loadFont = async (family: string): Promise<LoadedFont> =>
  FONTS[family]
    ? { font: FONTS[family], usedFamily: family }
    : { font: arvo, usedFamily: 'Arvo', note: `We couldn't load ${family}, so we used Arvo.` };

/** happy-dom has no WebGL: the scene reports it can't run, like CardScene does. */
const noScene = (): SceneLike => ({
  ready: Promise.resolve({ ok: false, error: new Error('WebGL is not available') }),
  onTheta: null,
  setCard() {},
  setTheta() {},
  animateTo: async () => {},
  setFoldStep() {},
  renderPng: async () => {
    throw new Error("3D preview isn't available in this browser");
  },
  dispose() {},
});

let root: HTMLElement;
let app: AppApi | null = null;

const mount = async (deps: Partial<AppDeps> = {}, host: 'labs' | 'atomm' = 'labs') => {
  app = mountApp(root, host, {}, { loadFont, createScene: noScene, storage: null, locale: 'en-US', ...deps });
  await app.whenIdle();
  return app;
};

const type = (el: HTMLInputElement, value: string) => {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

const $ = <E extends Element = HTMLElement>(sel: string) => root.querySelector<E>(sel)!;

beforeEach(() => {
  history.replaceState(null, '', '/');
  root = document.createElement('div');
  document.body.replaceChildren(root);
});

afterEach(() => {
  vi.useRealTimers();
  app?.destroy();
  app = null;
});

describe('mountApp', () => {
  test('typing in line 1 rebuilds within one animation frame, after a 150 ms debounce', async () => {
    const a = await mount();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    type($<HTMLInputElement>('input[name="line1"]'), 'HI JO');
    expect(a.getParams().line1).toBe('HI JO');

    await vi.advanceTimersByTimeAsync(149);
    expect(a.getCard().params.line1).not.toBe('HI JO');
    await vi.advanceTimersByTimeAsync(1);
    // The debounce has fired; the build waits for the next frame.
    expect(a.getCard().params.line1).not.toBe('HI JO');
    await vi.advanceTimersByTimeAsync(17);
    expect(a.getCard().params.line1).toBe('HI JO');
  });

  test('a hidden page (no animation frames) still rebuilds, so the card stays current', async () => {
    const a = await mount();
    vi.stubGlobal('requestAnimationFrame', () => 0);
    try {
      a.setParams({ ...a.getParams(), line1: 'HELLO' });
      await a.whenIdle();
      expect(a.getCard().params.line1).toBe('HELLO');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('the size tiles show four sizes, each labelled in mm and inches', async () => {
    await mount();
    const tiles = [...root.querySelectorAll('[data-ph-capture-attribute-size]')];
    expect(tiles.map((t) => t.getAttribute('data-ph-capture-attribute-size'))).toEqual(['5x7', 'a2', 'a6', 'a5']);
    for (const t of tiles) {
      expect(t.textContent).toMatch(/\d+ × \d+ mm/);
      expect(t.textContent).toMatch(/[\d.]+ × [\d.]+ in/);
    }
  });

  test('the rail runs Message, Card, Font, Decorations, Checks, Advanced', async () => {
    await mount();
    const titles = [...root.querySelectorAll('.settings > section .card-title')].map((h) => h.textContent);
    expect(titles).toEqual(['Message', 'Card', 'Font', 'Decorations', 'Checks', 'Advanced']);
    expect(root.querySelector('[data-ph-capture-attribute-spacing="tight"]')?.closest('section')?.querySelector('.card-title')?.textContent).toBe('Font');
  });

  test('every text input has class ph-no-capture', async () => {
    await mount();
    const inputs = [
      ...root.querySelectorAll<HTMLElement>(
        'input:not([type]), input[type="text"], input[type="number"], input[type="search"], input[type="url"], textarea'
      ),
    ];
    expect(inputs.length).toBeGreaterThanOrEqual(3);
    for (const el of inputs) expect(el.classList.contains('ph-no-capture'), el.outerHTML).toBe(true);
  });

  test('with an empty message, the export button is disabled and shows the note', async () => {
    const a = await mount();
    type($<HTMLInputElement>('input[name="line1"]'), '');
    type($<HTMLInputElement>('input[name="line2"]'), '');
    await a.whenIdle();
    const button = $<HTMLButtonElement>('button.export');
    expect(button.disabled).toBe(true);
    expect($('.export-note').textContent).toBe(EMPTY_MESSAGE_NOTE);
  });

  test('opening with #d=garbage shows the error and the defaults', async () => {
    history.replaceState(null, '', '/#d=garbage');
    const a = await mount();
    expect(root.textContent).toContain("That link couldn't be opened.");
    expect(a.getParams()).toEqual(defaultParams('en-US'));
  });

  test('undoing a fix sets overrides[id] and shows a warn note', async () => {
    const a = await mount();
    const p = defaultParams('en-US');
    a.setParams({ ...p, advanced: { ...p.advanced, line1: { s: 40 } } });
    await a.whenIdle();
    const undo = $<HTMLButtonElement>('button[data-ph-capture-attribute-fix="fit:l1"]');
    expect(undo).toBeTruthy();
    undo.click();
    expect(a.getParams().overrides['fit:l1']).toBe(true);
    await a.whenIdle();
    const warns = [...root.querySelectorAll('.checks .note-warn .note-text')].map((n) => n.textContent);
    expect(warns).toContain(undone('fit:l1').message);
  });

  test('without WebGL the 3D tab says so and the canvas switches to Flat', async () => {
    await mount();
    expect($('.view-3d').textContent).toContain("3D preview isn't available in this browser.");
    expect($('[role="tab"][aria-selected="true"]').textContent).toBe('Flat');
    expect($('.flat-view svg')).toBeTruthy();
  });

  test('a link round-trips: #d= from a saved card opens that card', async () => {
    const { encodeLink } = await import('../src/core/codec');
    const p: Params = { ...defaultParams('en-US'), line1: 'HELLO', line2: 'MO', size: 'a6' };
    history.replaceState(null, '', '/' + encodeLink(p));
    const a = await mount();
    expect(a.getParams()).toEqual(p);
    expect(root.textContent).not.toContain("That link couldn't be opened.");
  });

  test('labs export modal shows six targets, the chosen steps, and Download saves a zip', async () => {
    const saved: { filename: string; blob: Blob }[] = [];
    await mount({ saveBlob: (filename, blob) => void saved.push({ filename, blob }) });
    $<HTMLButtonElement>('button.export').click();
    const targets = [...root.querySelectorAll('[data-ph-capture-attribute-target]')];
    expect(targets.map((t) => t.getAttribute('data-ph-capture-attribute-target'))).toEqual(Object.keys(TARGETS));
    (targets[0] as HTMLButtonElement).click();
    const steps = [...root.querySelectorAll('.export-steps li')].map((li) => li.textContent);
    expect(steps).toHaveLength(TARGETS.cricut.steps.length);
    expect(steps[0]).toBe('Upload happy-birthday-both.svg in Design Space.');
    $<HTMLButtonElement>('button.download').click();
    await vi.waitFor(() => expect(saved).toHaveLength(1), { timeout: 20_000 });
    expect(saved[0].filename).toBe('happy-birthday-cricut.zip');
    expect(saved[0].blob.size).toBeGreaterThan(1000);
  }, 30_000);

  test('atomm host has no export modal and hands the export card to the hook', async () => {
    const seen: string[] = [];
    app = mountApp(root, 'atomm', { onExportRequest: (card) => void seen.push(card.params.line1) }, {
      loadFont,
      createScene: noScene,
      storage: null,
      locale: 'en-US',
    });
    await app.whenIdle();
    expect(root.querySelector('dialog.export-modal')).toBeNull();
    $<HTMLButtonElement>('button.export').click();
    await vi.waitFor(() => expect(seen).toEqual(['HAPPY BIRTHDAY']), { timeout: 20_000 });
  }, 30_000);
});
