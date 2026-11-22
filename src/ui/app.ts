/**
 * The shared app: theme rail, canvas, settings rail, and (labs) the export modal, save, and link.
 *
 * Builds: a typed change waits 150 ms of quiet, other changes go straight through, and either way the
 * build runs once per animation frame after the fonts it needs have loaded. Those builds skip the slow
 * stroke check; 600 ms after the last one, a single rebuild runs it so Checks shows the real result.
 * Export always builds with the stroke check.
 */
import './app.css';
import { build, EMPTY_MESSAGE_NOTE, type Card } from '../core/build';
import { decodeLink } from '../core/codec';
import { loadFont as realLoadFont, type LoadedFont } from '../core/fonts';
import { defaultParams, type Params } from '../core/model';
import { CardScene } from '../view3d/scene';
import { createCanvas } from './canvas';
import { advancedCard } from './cards/advanced';
import { cardCard } from './cards/card';
import { checksCard } from './cards/checks';
import { decorationsCard } from './cards/decorations';
import { fontCard } from './cards/font';
import { messageCard } from './cards/message';
import { FontLoader, setAnalytics, type BuildState, type Ctx, type Host, type SceneLike, type View } from './context';
import { h, svgFrom } from './dom';
import { exportModal } from './exportModal';
import { exportNote } from './exportState';
import { themeRail } from './rail';
import { downloadBlob, fileActions, readAutosave, safeStorage, writeAutosave } from './saveLink';
import { ACTIONS, APP_NAME, APP_TAGLINE, BUILD_ERROR, DISMISS, FONTS_ERROR, LINK_ERROR } from './strings';

export type { SceneLike } from './context';

export const TYPING_DEBOUNCE_MS = 150;
export const STROKE_IDLE_MS = 600;
const AUTOSAVE_MS = 400;
/** A hidden page gets no animation frames; build anyway after this long so the card stays current. */
const FRAME_FALLBACK_MS = 100;

export interface AppHooks {
  /** Atomm: called with an export-ready card (stroke-checked) when someone clicks Export. */
  onExportRequest?: (card: Card) => void;
}

export interface AppDeps {
  loadFont: (family: string, text: string) => Promise<LoadedFont>;
  createScene: (canvas: HTMLCanvasElement) => SceneLike;
  /** Autosave storage; null turns autosave off. Labs defaults to local storage, Atomm to none. */
  storage: Storage | null;
  locale: string;
  saveBlob: (filename: string, blob: Blob) => void;
}

export interface AppApi {
  getCard(): Card;
  getParams(): Params;
  setParams(p: Params): void;
  /** Resolves once no rebuild is waiting (the stroke-check rebuild aside). */
  whenIdle(): Promise<void>;
  /** The current design built with the stroke check, for exporting. */
  prepareExport(kind?: 'blade' | 'laser'): Promise<Card>;
  /** One PNG per fold step from the 3D view, for the how-to PDF; empty without 3D. */
  stepImages(): Promise<{ step: string; png: Uint8Array }[]>;
  destroy(): void;
}

/** A bolt folded from paper: two faces of one zigzag. */
const BRAND_MARK =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false">' +
  '<path d="M19 2 6 18h9l-3 12 14-17h-9z" fill="var(--brand-a)"/><path d="M19 2 15 18H6zM17 13h9L12 30z" fill="var(--brand-b)"/></svg>';

/** The opening design: a link wins, then the autosave, then the defaults. */
function initialParams(d: AppDeps): { params: Params; linkError: boolean } {
  const hash = location.hash;
  if (hash.startsWith('#d=')) {
    const p = decodeLink(hash);
    // The link has done its job; edits from here on belong to the autosave, not a stale fragment.
    history.replaceState(history.state, '', location.pathname + location.search);
    return p ? { params: p, linkError: false } : { params: defaultParams(d.locale), linkError: true };
  }
  return { params: readAutosave(d.storage) ?? defaultParams(d.locale), linkError: false };
}

export function mountApp(root: HTMLElement, host: Host, hooks: AppHooks = {}, deps: Partial<AppDeps> = {}): AppApi {
  const d: AppDeps = {
    loadFont: realLoadFont,
    createScene: (canvas) => new CardScene(canvas),
    storage: host === 'labs' ? safeStorage() : null,
    locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
    saveBlob: downloadBlob,
    ...deps,
  };
  setAnalytics(host !== 'atomm');
  const previewTarget = host === 'atomm' ? 'laser' : 'blade';
  const fonts = new FontLoader(d.loadFont);
  const start = initialParams(d);

  let params = start.params;
  let card: Card | null = null;
  let state: BuildState = { strokeChecked: false };
  let version = 0;
  let builtVersion = -1;
  let typingTimer: ReturnType<typeof setTimeout> | undefined;
  let strokeTimer: ReturnType<typeof setTimeout> | undefined;
  let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  let bannerTimer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  let frameTimer: ReturnType<typeof setTimeout> | undefined;
  let framePending = false;
  let destroyed = false;
  let waiters: (() => void)[] = [];

  // ---------------------------------------------------------------- notices
  const bannerText = h('p', { class: 'banner-text' });
  const bannerClose = h('button', { type: 'button', class: 'ghost icon-button', 'aria-label': DISMISS }, '×');
  const banner = h('div', { class: 'banner', role: 'status', hidden: true }, bannerText, bannerClose);
  const notify = (message: string, kind: 'info' | 'error') => {
    bannerText.textContent = message;
    banner.dataset.kind = kind;
    banner.hidden = false;
    clearTimeout(bannerTimer);
    // Errors stay until dismissed; confirmations go on their own.
    bannerTimer = kind === 'info' ? setTimeout(() => (banner.hidden = true), 3000) : undefined;
  };
  bannerClose.addEventListener('click', () => (banner.hidden = true));

  // ---------------------------------------------------------------- parts
  const ctx: Ctx = { host, params: () => params, update: (next, opts = {}) => update(next, opts.typing ?? false), fonts };
  const rail = themeRail(ctx);
  const cards = [messageCard(ctx), cardCard(ctx), fontCard(ctx), decorationsCard(ctx), checksCard(ctx), advancedCard(ctx)];
  const views: View[] = [rail, ...cards];
  const canvas = createCanvas(d.createScene);

  /** Builds from the params current when the fonts are ready, never a snapshot from before the wait. */
  const prepareExport = async (kind: 'blade' | 'laser' = previewTarget): Promise<Card> => {
    for (;;) {
      const p = params;
      const set = await fonts.ensure(p);
      if (p === params) return build(p, { fonts: set }, kind, { strokeCheck: true });
    }
  };

  // ---------------------------------------------------------------- export
  const exportBtn = h('button', { type: 'button', class: 'primary export', 'aria-describedby': 'cl-export-note' }, ACTIONS.export);
  const exportNoteEl = h('p', { class: 'export-note', id: 'cl-export-note', 'aria-live': 'polite' });
  const exportBar = h('div', { class: 'export-bar' }, exportNoteEl, exportBtn);
  const modal =
    host === 'labs'
      ? exportModal({ prepare: prepareExport, stepImages: () => canvas.stepImages(), saveBlob: d.saveBlob, current: () => card })
      : null;
  // Atomm's own export button drives the export (Task 14); ours shows only when a hook takes it.
  if (host === 'atomm' && !hooks.onExportRequest) exportBar.hidden = true;

  const renderExport = () => {
    exportBtn.disabled = !card?.exportable;
    exportNoteEl.textContent = exportNote(card);
  };
  exportBtn.addEventListener('click', async () => {
    if (modal) return modal.open();
    exportBtn.disabled = true;
    try {
      const c = await prepareExport();
      // Never hand over or show geometry the person has since changed (R24).
      if (c.params !== params) return;
      if (c.exportable) hooks.onExportRequest?.(c);
      else showCard(c, false, { strokeChecked: true });
    } finally {
      renderExport();
    }
  });

  // ---------------------------------------------------------------- layout
  const files = fileActions({ host, params: () => params, open: (p) => update(p, false), notify, saveBlob: d.saveBlob });
  const brand = h(
    'div',
    { class: 'brand' },
    h('span', { class: 'brand-mark' }, svgFrom(BRAND_MARK)),
    h('span', { class: 'brand-text' }, h('h1', { class: 'brand-name', text: APP_NAME }), h('span', { class: 'brand-tagline', text: APP_TAGLINE }))
  );
  const settings = h('aside', { class: 'settings', 'aria-label': 'Card settings' }, ...cards.map((c) => c.el));
  root.replaceChildren(
    h(
      'div',
      { class: 'cl-app', 'data-host': host },
      h('header', { class: 'topbar' }, brand, files.el, exportBar),
      banner,
      files.linkField,
      h('main', { class: 'workspace' }, rail.el, canvas.el, settings),
      modal?.el
    )
  );
  if (start.linkError) notify(LINK_ERROR, 'error');

  // ---------------------------------------------------------------- builds
  const renderAll = () => {
    for (const v of views) v.render(params, card, state);
    renderExport();
  };

  const settle = () => {
    if (!destroyed && (typingTimer || framePending || builtVersion !== version)) return;
    const w = waiters;
    waiters = [];
    w.forEach((r) => r());
  };

  function showCard(next: Card, geometry: boolean, s: BuildState) {
    card = next;
    state = s;
    canvas.show(next, geometry);
    canvas.setPlaceholder(next.notes.some((n) => n.message === EMPTY_MESSAGE_NOTE));
    renderAll();
  }

  function update(next: Params, typing: boolean) {
    if (destroyed) return;
    params = next;
    version++;
    clearTimeout(strokeTimer);
    clearTimeout(autosaveTimer);
    if (d.storage) autosaveTimer = setTimeout(() => writeAutosave(d.storage, params), AUTOSAVE_MS);
    renderAll();
    clearTimeout(typingTimer);
    typingTimer = undefined;
    if (!typing) return schedule();
    typingTimer = setTimeout(() => {
      typingTimer = undefined;
      schedule();
    }, TYPING_DEBOUNCE_MS);
  }

  function schedule() {
    if (framePending || destroyed) return;
    framePending = true;
    frame = requestAnimationFrame(runFrame);
    frameTimer = setTimeout(runFrame, FRAME_FALLBACK_MS);
  }

  function runFrame() {
    cancelAnimationFrame(frame);
    clearTimeout(frameTimer);
    framePending = false;
    if (destroyed || builtVersion === version) return settle();
    const set = fonts.setFor(params);
    if (!set) {
      canvas.setLoading(true);
      fonts.ensure(params).then(schedule, (e) => {
        console.error(e);
        canvas.setLoading(false);
        notify(FONTS_ERROR, 'error');
        builtVersion = version;
        settle();
      });
      return;
    }
    canvas.setLoading(false);
    const v = version;
    try {
      // Same params object means only the checks can differ, so the 3D scene keeps its meshes.
      const geometry = card?.params !== params;
      showCard(build(params, { fonts: set }, previewTarget, { strokeCheck: false }), geometry, { strokeChecked: false });
      strokeTimer = setTimeout(strokeBuild, STROKE_IDLE_MS);
    } catch (e) {
      console.error(e);
      notify(BUILD_ERROR, 'error');
    }
    builtVersion = v;
    settle();
  }

  /** The one slow rebuild after changes stop, so Checks shows the real stroke result. */
  function strokeBuild() {
    strokeTimer = undefined;
    if (destroyed || builtVersion !== version) return;
    const set = fonts.setFor(params);
    if (!set) return;
    try {
      showCard(build(params, { fonts: set }, previewTarget, { strokeCheck: true }), false, { strokeChecked: true });
    } catch (e) {
      console.error(e);
    }
  }

  renderAll();
  schedule();

  return {
    getCard: () => {
      if (!card) throw new Error('The card has not been built yet; await whenIdle() first.');
      return card;
    },
    getParams: () => params,
    setParams: (p) => update(p, false),
    whenIdle: () =>
      new Promise<void>((resolve) => {
        waiters.push(resolve);
        settle();
      }),
    prepareExport,
    stepImages: () => canvas.stepImages(),
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      [typingTimer, strokeTimer, autosaveTimer, bannerTimer, frameTimer].forEach((t) => clearTimeout(t));
      canvas.destroy();
      settle();
      root.replaceChildren();
    },
  };
}
