// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { LoadedFont } from '../src/core/fonts';
import { defaultParams, type Params } from '../src/core/model';
import { undone } from '../src/core/fixes';
import { EMPTY_MESSAGE_NOTE } from '../src/core/build';
import { mountApp, type AppDeps, type AppApi, type SceneLike } from '../src/ui/app';
import { TARGETS } from '../src/export/targets';
import { build, type Card } from '../src/core/build';
import { exportModal } from '../src/ui/exportModal';
import { testFonts } from './helpers/fonts';
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

  test('a colour change repaints without rebuilding the geometry (I1)', async () => {
    const a = await mount();
    const before = a.getCard();
    a.setParams({ ...a.getParams(), colours: { inner: '#123456', jacket: '#abcdef' } });
    await a.whenIdle();
    const after = a.getCard();
    expect(after.params).toBe(a.getParams());
    expect(after.params.colours).toEqual({ inner: '#123456', jacket: '#abcdef' });
    expect(after.layout).toBe(before.layout);
    expect(after.inner).toBe(before.inner);
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

  test('a link the head snippet moved off the URL still opens (I4)', async () => {
    const { encodeLink } = await import('../src/core/codec');
    const { LINK_FRAGMENT_SNIPPET, LINK_STASH } = await import('../src/ui/linkFragment');
    const p: Params = { ...defaultParams('en-US'), line1: 'PRIVATE WORDS', line2: '' };
    history.replaceState(null, '', '/crease-lightning/?x=1' + encodeLink(p));
    // Run the snippet as the wrapper's <head> would, before analytics loads.
    new Function(LINK_FRAGMENT_SNIPPET.replace(/^<script>|<\/script>$/g, ''))();
    expect(location.hash).toBe('');
    expect(location.pathname + location.search).toBe('/crease-lightning/?x=1');
    expect((window as unknown as Record<string, unknown>)[LINK_STASH]).toBe(encodeLink(p));
    const a = await mount();
    expect(a.getParams()).toEqual(p);
    expect((window as unknown as Record<string, unknown>)[LINK_STASH]).toBeUndefined();
  });

  test('the export modal steps follow Advanced → Fold lines (M1)', async () => {
    const a = await mount();
    const p = a.getParams();
    a.setParams({ ...p, advanced: { ...p.advanced, foldStyle: 'perforate' } });
    await a.whenIdle();
    $<HTMLButtonElement>('button.export').click();
    $<HTMLButtonElement>('[data-ph-capture-attribute-target="cricut"]').click();
    const steps = [...root.querySelectorAll('.export-steps li')].map((li) => li.textContent);
    expect(steps).toEqual(['Upload happy-birthday-both.svg in Design Space.', 'Click Make it.']);
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
    expect(steps).toEqual([
      'Upload happy-birthday-both.svg in Design Space.',
      'Change Inner-Score and Jacket-Score to Score.',
      'Select Inner-Cut and Inner-Score and click Attach. Do the same for Jacket-Cut and Jacket-Score.',
      'Click Make it.',
    ]);
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

  test('the Flat preview follows Advanced → Fold lines: Perforate shows perforations (R25)', async () => {
    const a = await mount();
    expect(root.querySelector('.flat-view [data-part="fold"]')).toBeTruthy();
    expect(root.querySelector('.flat-view [data-part="perforation"]')).toBeNull();
    const p = a.getParams();
    a.setParams({ ...p, advanced: { ...p.advanced, foldStyle: 'perforate' } });
    await a.whenIdle();
    expect(root.querySelector('.flat-view [data-part="perforation"]')).toBeTruthy();
    expect(root.querySelector('.flat-view [data-part="fold"]')).toBeNull();
  });

  test('prepareExport builds from the params current once fonts load, not a stale snapshot (R24)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = async (family: string) => {
      if (family === 'Ultra') await gate;
      return loadFont(family);
    };
    const a = await mount({ loadFont: slow });
    a.setParams({ ...a.getParams(), font: 'Ultra' });
    const pending = a.prepareExport();
    a.setParams({ ...a.getParams(), line1: 'CHANGED' });
    release();
    const card = await pending;
    expect(card.params).toBe(a.getParams());
    expect(card.params.line1).toBe('CHANGED');
  });
});

describe('Checks card', () => {
  test('a failed stroke check is a strong warning; Export stays on (R23)', async () => {
    const a = await mount();
    const p = a.getParams();
    a.setParams({ ...p, theme: 'blank', font: 'Rokkitt', line1: '@'.repeat(10), line2: '', autoSplit: false, spacing: 'normal' });
    await a.whenIdle();
    // The stroke check runs in the rebuild 600 ms after changes stop.
    await vi.waitFor(() => expect(root.querySelector('.check.is-warn')).toBeTruthy(), { timeout: 10_000 });
    expect(root.querySelector('.check-status')!.textContent).toContain('Ready to export, but some strokes may tear.');
    expect([...root.querySelectorAll('.checks .note-strong .note-text')].map((n) => n.textContent)).toContain(
      'Some strokes are thin enough to tear. Alfa Slab One has heavier strokes, or try a bigger card.'
    );
    expect(root.querySelector<HTMLButtonElement>('button.export')!.disabled).toBe(false);

    // Use Alfa Slab One (R31): one click switches the font, and the stroke check then passes.
    const use = root.querySelector<HTMLButtonElement>('.checks button[data-ph-capture-attribute-font="Alfa Slab One"]')!;
    expect(use.textContent).toBe('Use Alfa Slab One');
    use.click();
    expect(a.getParams().font).toBe('Alfa Slab One');
    await a.whenIdle();
    await vi.waitFor(() => expect(root.querySelector('.check-status')!.textContent).toContain('Ready to export.'), { timeout: 10_000 });
    expect(root.querySelector('.check.is-warn')).toBeNull();
  }, 30_000);

  test('bridge fixes have no Undo; other fixes do (M11)', async () => {
    const a = await mount();
    const p = a.getParams();
    a.setParams({ ...p, theme: 'blank', line1: 'WHY?', line2: 'HAPPY 40TH!', spacing: 'normal', advanced: { ...p.advanced, line1: { s: 40 } } });
    await a.whenIdle();
    const fixes = [...root.querySelectorAll('.checks .fix')];
    const bridge = fixes.filter((li) => /bridge/.test(li.textContent!));
    expect(bridge.length).toBeGreaterThan(0);
    for (const li of bridge) expect(li.querySelector('button')).toBeNull();
    expect(root.querySelector('button[data-ph-capture-attribute-fix="fit:l1"]')).toBeTruthy();
    expect(root.querySelector('button[data-ph-capture-attribute-fix^="bridge:"]')).toBeNull();
  });

  test('the status line and export note are rewritten only when their words change (M12)', async () => {
    const a = await mount();
    const status = root.querySelector('.check-status')!;
    const note = root.querySelector('.export-note')!;
    const writes: string[] = [];
    new MutationObserver((records) => records.forEach((r) => writes.push((r.target as Element).className ?? 'text'))).observe(status, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    const noteWrites: number[] = [];
    new MutationObserver((records) => noteWrites.push(records.length)).observe(note, { childList: true, characterData: true, subtree: true });
    // A change that keeps the card ready: the words stay, so nothing is announced again.
    a.setParams({ ...a.getParams(), line2: 'JO' });
    await a.whenIdle();
    await new Promise((r) => setTimeout(r, 0));
    expect(writes).toEqual([]);
    expect(noteWrites).toEqual([]);
  });
});

describe('exportModal', () => {
  const fonts = { fonts: testFonts() };
  const p = defaultParams('en-US');
  const preview = build(p, fonts, 'blade', { strokeCheck: false });

  const openModal = (prepared: Card) => {
    const saved: string[] = [];
    const m = exportModal({
      prepare: async () => prepared,
      stepImages: async () => [],
      saveBlob: (name) => void saved.push(name),
      current: () => preview,
    });
    root.append(m.el);
    m.open();
    root.querySelector<HTMLButtonElement>('[data-ph-capture-attribute-target="cricut"]')!.click();
    return { m, saved };
  };

  test('a refusal from the stroke-checked export card stays shown, even though the preview card was exportable', async () => {
    // Same params as the preview, but the export build found a real problem.
    const refused: Card = {
      ...preview,
      exportable: false,
      checks: preview.checks.map((c) => (c.id === 'closed' ? { ...c, ok: false, detail: 'Line 1 reaches 2 mm past the card.' } : c)),
    };
    const { m, saved } = openModal(refused);
    const download = root.querySelector<HTMLButtonElement>('button.download')!;
    expect(download.disabled).toBe(false);
    download.click();
    await vi.waitFor(() => expect(root.querySelector('.export-status')!.textContent).toBe(''));
    await new Promise((r) => setTimeout(r, 0));
    const blocked = root.querySelector('.export-blocked')!;
    expect(blocked.hasAttribute('hidden')).toBe(false);
    expect(blocked.textContent).toContain('Line 1 reaches 2 mm past the card.');
    expect(download.disabled).toBe(true);
    expect(saved).toEqual([]);
    // Reopening keeps the verdict while the params are the same.
    m.open();
    expect(root.querySelector('.export-blocked')!.hasAttribute('hidden')).toBe(false);
  });

  test('thin strokes show as a warning beside Download and still export (R23)', async () => {
    const thin = 'Some strokes in line 1 are thinner than 1.5 mm and may tear. Try a bolder font or a bigger card.';
    const warned: Card = { ...preview, checks: preview.checks.map((c) => (c.id === 'stroke' ? { ...c, ok: false, detail: thin } : c)) };
    const { saved } = openModal(warned);
    const download = root.querySelector<HTMLButtonElement>('button.download')!;
    download.click();
    await vi.waitFor(() => expect(saved).toEqual(['happy-birthday-cricut.zip']), { timeout: 20_000 });
    const warning = root.querySelector('.export-warning')!;
    expect(warning.hasAttribute('hidden')).toBe(false);
    expect(warning.textContent).toBe(thin);
    expect(root.querySelector('.export-blocked')!.hasAttribute('hidden')).toBe(true);
    expect(download.disabled).toBe(false);
  }, 30_000);
});
