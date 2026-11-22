/**
 * The shared app: theme rail, canvas, settings rail, and (labs) the export modal, save, and link.
 *
 * Builds: a typed change waits 150 ms of quiet, other changes go straight through, and either way the
 * build is requested once per animation frame. Builds run in a Web Worker (R30; on the page in tests
 * and old browsers), one preview at a time; changes that arrive meanwhile are built next. Previews skip
 * the slow stroke check; 600 ms after the last one, a single rebuild runs it so Checks shows the real
 * result. A change that leaves the geometry alone (a colour) reuses the card without a rebuild.
 * Export always builds with the stroke check.
 */
import './app.css';
import { EMPTY_MESSAGE_NOTE, type Card } from '../core/build';
import { decodeLink } from '../core/codec';
import { loadFont as realLoadFont, type LoadedFont } from '../core/fonts';
import type { Decor } from '../core/decor/types';
import { defaultParams, type Params } from '../core/model';
import { mainThreadBuilder, moduleWorkersSupported, workerBuilder, type Builder } from './builder';
import { takeLinkFragment } from './linkFragment';
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
  /** Build in a Web Worker. Default: when module workers exist and `loadFont` isn't replaced (tests). */
  useWorker: boolean;
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

/** Two designs that build the same geometry: they differ at most in their colours, which only paint. */
export function sameGeometry(a: Params, b: Params): boolean {
  return JSON.stringify({ ...a, colours: null }) === JSON.stringify({ ...b, colours: null });
}

/** The opening design: a link wins, then the autosave, then the defaults. */
function initialParams(d: AppDeps): { params: Params; linkError: boolean } {
  // The labs wrapper's head snippet may already have moved the fragment off the URL (I4).
  const hash = takeLinkFragment();
  if (hash.startsWith('#d=')) {
    const p = decodeLink(hash);
    // The link has done its job; edits from here on belong to the autosave, not a stale fragment.
    if (location.hash) history.replaceState(history.state, '', location.pathname + location.search);
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
    useWorker: !deps.loadFont && moduleWorkersSupported(),
    ...deps,
  };
  setAnalytics(host !== 'atomm');
  const previewTarget = host === 'atomm' ? 'laser' : 'blade';
  const fonts = new FontLoader(d.loadFont);
  const builder: Builder = d.useWorker
    ? workerBuilder(fonts, {
        base: new URL(import.meta.env.BASE_URL, location.href).href,
        spawn: () => new Worker(new URL('../worker/build.worker.ts', import.meta.url), { type: 'module', name: 'crease-lightning-build' }),
      })
    : mainThreadBuilder(fonts);
  const start = initialParams(d);

  let params = start.params;
  let card: Card | null = null;
  let state: BuildState = { strokeChecked: false, strokeSkipped: false };
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
  /** A preview build is out; changes made meanwhile are built when it's back. */
  let building = false;
  /** Request ids: a result older than the card on show is dropped (fonts can make builds finish out of order). */
  let requestSeq = 0;
  let shownSeq = 0;

  /** The selected decoration; Flat view editing and the chips share it. */
  let selected: string | null = null;
  /** The decor from before the last theme change or style pick, for Undo; not in params or the link. */
  let decorStash: Decor | null = null;

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
  const ctx: Ctx = {
    host,
    params: () => params,
    update: (next, opts = {}) => update(next, opts.typing ?? false, opts.undoable ?? false),
    selection: () => (selected !== null && params.decor.items.some((i) => i.id === selected) ? selected : null),
    select(id) {
      if (id === selected) return;
      selected = id;
      renderAll();
    },
    decorUndo() {
      const restore = decorStash;
      if (restore) update({ ...params, decor: restore }, false, false);
    },
    canDecorUndo: () => decorStash !== null,
    fonts,
  };
  const rail = themeRail(ctx);
  const cards = [messageCard(ctx), cardCard(ctx), fontCard(ctx), decorationsCard(ctx), checksCard(ctx), advancedCard(ctx)];
  const views: View[] = [rail, ...cards];
  const canvas = createCanvas(d.createScene);

  /** Builds from the params current when the build finishes, never a snapshot from before a change. */
  const prepareExport = async (kind: 'blade' | 'laser' = previewTarget): Promise<Card> => {
    for (;;) {
      const p = params;
      const r = await builder.build({ params: p, target: kind, strokeCheck: true, kind: 'export' });
      if (p !== params || (!r.ok && r.reason === 'stale')) continue;
      if (r.ok) return r.card;
      throw new Error(r.reason === 'fonts' ? FONTS_ERROR : BUILD_ERROR);
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
    // A live region: rewrite it only when the words change, or each render announces it again (M12).
    const note = exportNote(card);
    if (exportNoteEl.textContent !== note) exportNoteEl.textContent = note;
  };
  exportBtn.addEventListener('click', async () => {
    if (modal) return modal.open();
    exportBtn.disabled = true;
    try {
      const c = await prepareExport();
      // Never hand over or show geometry the person has since changed (R24).
      if (c.params !== params) return;
      if (c.exportable) hooks.onExportRequest?.(c);
      else showCard(c, false, { strokeChecked: true, strokeSkipped: false }, ++requestSeq);
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
    if (!destroyed && (typingTimer || framePending || building || builtVersion !== version)) return;
    const w = waiters;
    waiters = [];
    w.forEach((r) => r());
  };

  builder.onLoading = (on) => canvas.setLoading(on);

  function showCard(next: Card, geometry: boolean, s: BuildState, seq: number) {
    card = next;
    state = s;
    shownSeq = seq;
    canvas.show(next, geometry);
    canvas.setPlaceholder(next.notes.some((n) => n.message === EMPTY_MESSAGE_NOTE));
    renderAll();
  }

  function update(next: Params, typing: boolean, undoable = false) {
    if (destroyed) return;
    if (next.decor !== params.decor && JSON.stringify(next.decor) !== JSON.stringify(params.decor)) decorStash = undoable ? params.decor : null;
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
    if (destroyed || builtVersion === version || building) return settle();
    const v = version;
    const p = params;
    // A colour changes only the paint: keep the card's geometry and checks, and skip the build.
    if (card && sameGeometry(card.params, p)) {
      showCard({ ...card, params: p }, false, state, shownSeq);
      builtVersion = v;
      if (!state.strokeChecked && !state.strokeSkipped) strokeTimer = setTimeout(strokeBuild, STROKE_IDLE_MS);
      return settle();
    }
    building = true;
    const seq = ++requestSeq;
    void builder.build({ params: p, target: previewTarget, strokeCheck: false, kind: 'preview' }).then((r) => {
      building = false;
      if (destroyed) return settle();
      if (r.ok && seq > shownSeq) {
        // Same params object means only the checks can differ, so the 3D scene keeps its meshes. A card
        // for params since changed still shows (it's the newest there is); the next build follows.
        showCard(r.card, card?.params !== p, { strokeChecked: false, strokeSkipped: false }, seq);
        if (p === params) strokeTimer = setTimeout(strokeBuild, STROKE_IDLE_MS);
      } else if (!r.ok && r.reason === 'fonts') {
        notify(FONTS_ERROR, 'error');
      } else if (!r.ok && r.reason !== 'stale') {
        notify(BUILD_ERROR, 'error');
      }
      builtVersion = v;
      if (version !== v) schedule();
      settle();
    });
  }

  /** The one slow rebuild after changes stop, so Checks shows the real stroke result. */
  function strokeBuild() {
    strokeTimer = undefined;
    if (destroyed || builtVersion !== version || building) return;
    const p = params;
    const seq = ++requestSeq;
    void builder.build({ params: p, target: previewTarget, strokeCheck: true, kind: 'stroke' }).then((r) => {
      // A result for params since changed is stale: the next preview's own stroke check follows.
      if (destroyed || p !== params || seq < shownSeq) return;
      if (r.ok) showCard(r.card, card?.params !== p, { strokeChecked: true, strokeSkipped: false }, seq);
      else if (r.reason === 'timeout' || r.reason === 'error') {
        // A stuck check was stopped: Checks says it didn't run rather than waiting forever.
        state = { strokeChecked: false, strokeSkipped: true };
        renderAll();
      }
    });
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
      builder.destroy();
      settle();
      root.replaceChildren();
    },
  };
}
