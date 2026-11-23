/**
 * The canvas: **3D** (default) and **Flat** tabs. 3D holds the scene, the open-angle slider, Open,
 * Close, and Fold it. When the scene can't run, 3D says so and the canvas switches to Flat.
 */
import type { Card } from '../core/build';
import { FOLD_STEPS } from '../core/foldSteps';
import type { Ctx, SceneLike } from './context';
import { h } from './dom';
import { flatView } from './flatView';
import { LOADING_FONTS, NO_3D, PLACEHOLDER_PREVIEW, TABS, VIEW } from './strings';

type Tab = '3d' | 'flat';

export interface CanvasApi {
  el: HTMLElement;
  /** Shows a card. `geometry` false means only checks changed, so the scene isn't rebuilt. */
  show(card: Card, geometry: boolean): void;
  setLoading(on: boolean): void;
  /** Greys the preview while it shows the theme's words in place of an empty message. */
  setPlaceholder(on: boolean): void;
  /** One PNG per fold step, from the 3D scene; empty when 3D isn't available. */
  stepImages(): Promise<{ step: string; png: Uint8Array }[]>;
  /** Shows the current decoration selection on the Flat view (the rail may have changed it). */
  showSelection(): void;
  destroy(): void;
}

export function createCanvas(createScene: (canvas: HTMLCanvasElement) => SceneLike, ctx: Ctx): CanvasApi {
  // Tabs.
  const tabButton = (tab: Tab, text: string) =>
    h('button', { type: 'button', role: 'tab', id: `cl-tab-${tab}`, 'aria-controls': `cl-panel-${tab}`, 'aria-selected': 'false', class: 'tab' }, text);
  const tab3d = tabButton('3d', TABS.threeD);
  const tabFlat = tabButton('flat', TABS.flat);
  const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Preview' }, tab3d, tabFlat);

  // 3D panel.
  const canvas = h('canvas', { class: 'scene', 'aria-label': VIEW.sceneLabel, role: 'img' });
  const slider = h('input', { type: 'range', min: 0, max: 180, step: 1, value: 90, name: 'angle', 'aria-label': VIEW.angle, class: 'angle' });
  const closeBtn = h('button', { type: 'button', class: 'ghost' }, VIEW.close);
  const openBtn = h('button', { type: 'button', class: 'ghost' }, VIEW.open);
  const foldBtn = h('button', { type: 'button', class: 'ghost fold-it', 'aria-pressed': 'false' }, VIEW.foldIt);
  const controls = h('div', { class: 'view-controls' }, closeBtn, slider, openBtn, foldBtn);

  const stepBack = h('button', { type: 'button', class: 'ghost icon-button', 'aria-label': VIEW.stepBack }, '‹');
  const stepNext = h('button', { type: 'button', class: 'ghost icon-button', 'aria-label': VIEW.stepNext }, '›');
  const stepCount = h('span', { class: 'step-count' });
  const stepText = h('span', { class: 'step-text' });
  const stepDone = h('button', { type: 'button', class: 'ghost' }, VIEW.foldDone);
  const stepBar = h('div', { class: 'fold-steps', hidden: true, 'aria-live': 'polite' }, stepBack, h('p', { class: 'step-copy' }, stepCount, stepText), stepNext, stepDone);

  const no3d = h('p', { class: 'no-3d', hidden: true, text: NO_3D });
  const panel3d = h('div', { class: 'view-3d', role: 'tabpanel', id: 'cl-panel-3d', 'aria-labelledby': 'cl-tab-3d' }, canvas, no3d, h('div', { class: 'view-bar' }, controls, stepBar));

  // Flat panel.
  const flat = flatView(ctx);
  const panelFlat = h('div', { class: 'view-flat', role: 'tabpanel', id: 'cl-panel-flat', 'aria-labelledby': 'cl-tab-flat', hidden: true }, flat.el);

  const loading = h('div', { class: 'stage-loading', hidden: true, role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), LOADING_FONTS);
  const placeholder = h('p', { class: 'stage-placeholder', hidden: true, text: PLACEHOLDER_PREVIEW });
  const el = h('div', { class: 'stage', 'data-ph-capture-attribute-section': 'preview' }, tablist, h('div', { class: 'stage-views' }, panel3d, panelFlat, loading, placeholder));

  let card: Card | null = null;
  let flatDirty = true;
  let tab: Tab = '3d';
  let ok3d: boolean | null = null;
  let theta = 90;
  let lastSelection: string | null = null;

  const select = (next: Tab) => {
    tab = next;
    tab3d.setAttribute('aria-selected', String(next === '3d'));
    tabFlat.setAttribute('aria-selected', String(next === 'flat'));
    tab3d.tabIndex = next === '3d' ? 0 : -1;
    tabFlat.tabIndex = next === 'flat' ? 0 : -1;
    panel3d.hidden = next !== '3d';
    panelFlat.hidden = next !== 'flat';
    if (next === 'flat' && card && flatDirty) {
      flat.render(card);
      flatDirty = false;
    }
  };
  tab3d.addEventListener('click', () => select('3d'));
  tabFlat.addEventListener('click', () => select('flat'));
  tablist.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = tab === '3d' ? 'flat' : '3d';
    select(next);
    (next === '3d' ? tab3d : tabFlat).focus();
  });
  select('3d');

  const scene = createScene(canvas);
  scene.onTheta = (deg) => {
    theta = deg;
    slider.value = String(Math.round(deg));
  };
  slider.addEventListener('input', () => scene.setTheta(Number(slider.value)));
  openBtn.addEventListener('click', () => void scene.animateTo(90));
  closeBtn.addEventListener('click', () => void scene.animateTo(0));

  // Fold it: step through assembly, highlighting each part.
  let step = -1;
  const showStep = (i: number) => {
    step = Math.max(0, Math.min(FOLD_STEPS.length - 1, i));
    scene.setFoldStep(step);
    stepCount.textContent = VIEW.stepOf(step + 1, FOLD_STEPS.length);
    stepText.textContent = FOLD_STEPS[step].text;
    stepBack.disabled = step === 0;
    stepNext.disabled = step === FOLD_STEPS.length - 1;
  };
  const foldMode = (on: boolean) => {
    foldBtn.setAttribute('aria-pressed', String(on));
    controls.hidden = on;
    stepBar.hidden = !on;
    if (on) showStep(0);
    else {
      step = -1;
      scene.setFoldStep(null);
      void scene.animateTo(90);
    }
  };
  foldBtn.addEventListener('click', () => foldMode(true));
  stepDone.addEventListener('click', () => foldMode(false));
  stepBack.addEventListener('click', () => showStep(step - 1));
  stepNext.addEventListener('click', () => showStep(step + 1));

  void scene.ready.then((status) => {
    ok3d = status.ok;
    if (status.ok) return;
    canvas.hidden = true;
    controls.hidden = true;
    stepBar.hidden = true;
    no3d.hidden = false;
    select('flat');
  });

  return {
    el,
    show(next, geometry) {
      const prev = card;
      card = next;
      if (geometry) scene.setCard(next);
      else if (prev && prev.params.colours !== next.params.colours && JSON.stringify(prev.params.colours) !== JSON.stringify(next.params.colours)) {
        // Only the paint changed (no rebuild): recolour the scene.
        if (scene.setColours) scene.setColours(next.params.colours);
        else scene.setCard(next);
      }
      flatDirty = true;
      if (tab === 'flat') {
        flat.render(next);
        flatDirty = false;
      }
    },
    setLoading(on) {
      loading.hidden = !on;
      el.classList.toggle('is-loading', on);
    },
    setPlaceholder(on) {
      placeholder.hidden = !on;
      el.classList.toggle('is-placeholder', on);
    },
    async stepImages() {
      if (ok3d === false || !(await scene.ready).ok) return [];
      const saved = theta;
      const images: { step: string; png: Uint8Array }[] = [];
      try {
        for (const [i, s] of FOLD_STEPS.entries()) {
          scene.setFoldStep(i);
          // JPEG keeps the how-to PDF small (M13); the PDF embeds either kind.
          images.push({ step: s.id, png: await scene.renderPng(800, 600, s.theta, 'three-quarter', 'image/jpeg') });
        }
      } catch {
        return [];
      } finally {
        // Put the live view back as it was.
        scene.setFoldStep(step >= 0 ? step : null);
        scene.setTheta(step >= 0 ? FOLD_STEPS[step].theta : saved);
      }
      return images;
    },
    showSelection() {
      // A selection only shows, and can only be dragged, on the Flat view: picking or adding an
      // illustration from the rail goes there.
      // Only a new selection switches, so the 3D tab stays put once someone goes back to it.
      const sel = ctx.selection();
      if (sel && sel !== lastSelection && tab === '3d') select('flat');
      lastSelection = sel;
      if (!flatDirty) flat.showSelection();
    },
    destroy() {
      scene.onTheta = null;
      scene.dispose();
    },
  };
}
