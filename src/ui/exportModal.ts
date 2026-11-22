/**
 * The labs export modal: six machines; picking one shows its steps and **Download**. Download builds
 * with the stroke check, refuses when the card can't be exported (and says why), renders one still per
 * fold step from the 3D scene, zips the bundle, and saves it.
 */
import type { Card } from '../core/build';
import { slugName } from '../export/slug';
import { stepsFor, TARGETS, type Target, type TargetFile, type TargetId } from '../export/targets';
import { track } from './context';
import { h } from './dom';
import { blockingReasons, exportWarnings } from './exportState';
import { EXPORT } from './strings';

export interface ExportDeps {
  /** The current card built with the stroke check, for the target's machine kind. */
  prepare(kind: 'blade' | 'laser'): Promise<Card>;
  stepImages(): Promise<{ step: string; png: Uint8Array }[]>;
  saveBlob(filename: string, blob: Blob): void;
  /** The latest preview card, for the steps' file names. */
  current(): Card | null;
}

const FILE_KINDS: Partial<Record<TargetFile, string>> = { 'both-svg': 'SVG', dxf: 'DXF', 'print-pdf': 'PDF to print' };
const filesLine = (t: Target) => t.files.map((f) => FILE_KINDS[f]).filter(Boolean).join(' + ');

/** A step with `<name>` filled in and backticked file names as code. */
function stepItem(step: string, name: string): HTMLLIElement {
  const li = h('li');
  step
    .replace(/<name>/g, name)
    .split(/`([^`]*)`/)
    .forEach((part, i) => li.append(i % 2 ? h('code', { text: part }) : part));
  return li;
}

/** Lets the status line paint before the slow build; a hidden page gets no frame, so a timer backs it up. */
const nextPaint = () =>
  new Promise<void>((r) => {
    requestAnimationFrame(() => setTimeout(r, 0));
    setTimeout(r, 100);
  });

export function exportModal(deps: ExportDeps): { el: HTMLDialogElement; open(): void } {
  const ids = Object.keys(TARGETS) as TargetId[];
  let chosen: TargetId | null = null;
  let busy = false;
  /**
   * The last stroke-checked export card. Its verdict beats the preview card's (which may predate its
   * stroke check) until the target or the params change.
   */
  let verdict: Card | null = null;

  const targetButtons = ids.map((id) => {
    const t = TARGETS[id];
    const b = h(
      'button',
      { type: 'button', class: 'target', 'aria-pressed': 'false', 'data-ph-capture-attribute-target': id },
      h('span', { class: 'target-name', text: t.label }),
      h('span', { class: 'target-files', text: filesLine(t) })
    );
    b.addEventListener('click', () => choose(id));
    return b;
  });

  const stepsHead = h('h3', { class: 'sub-heading' });
  // Step text and the status line name files after line 1, so they stay out of analytics.
  const steps = h('ol', { class: 'export-steps ph-no-capture' });
  const stepsBox = h('div', { class: 'export-steps-box', hidden: true }, stepsHead, steps);
  const blocked = h('div', { class: 'export-blocked', hidden: true });
  const status = h('p', { class: 'export-status ph-no-capture', role: 'status' });
  // Thin strokes don't block export; they're shown beside Download (R23). The text can quote the message.
  const warning = h('p', { class: 'export-warning ph-no-capture', hidden: true });
  const download = h('button', { type: 'button', class: 'primary download', disabled: true }, EXPORT.download);
  const close = h('button', { type: 'button', class: 'ghost icon-button modal-close', 'aria-label': EXPORT.close }, '×');

  const el = h(
    'dialog',
    { class: 'export-modal', 'aria-labelledby': 'cl-export-title', 'data-ph-capture-attribute-section': 'export' },
    h(
      'div',
      { class: 'modal-body' },
      h('div', { class: 'modal-head' }, h('h2', { id: 'cl-export-title', text: EXPORT.title }), close),
      h('p', { class: 'hint', text: EXPORT.intro }),
      h('div', { class: 'targets', role: 'group', 'aria-label': 'Machine' }, ...targetButtons),
      blocked,
      stepsBox,
      h('div', { class: 'modal-foot' }, h('div', { class: 'modal-foot-text' }, status, warning), download)
    )
  );

  const showBlocked = (card: Card | null): boolean => {
    const reasons = card ? blockingReasons(card) : [];
    blocked.hidden = reasons.length === 0;
    blocked.replaceChildren(h('p', { text: EXPORT.blocked }), h('ul', {}, ...reasons.map((r) => h('li', { text: r }))));
    return reasons.length > 0;
  };

  const showWarnings = (card: Card | null) => {
    const w = card ? exportWarnings(card) : [];
    warning.hidden = w.length === 0;
    warning.textContent = w.join(' ');
  };

  const refresh = () => {
    const preview = deps.current();
    if (verdict && verdict.params !== preview?.params) verdict = null;
    const card = verdict ?? preview;
    const isBlocked = showBlocked(card);
    showWarnings(card);
    download.disabled = busy || !chosen || isBlocked;
    if (!chosen) return;
    const t = TARGETS[chosen];
    stepsHead.textContent = EXPORT.stepsHeading(t.label);
    // The steps follow the card: its fold style (M1) and whether it needs the big mat (M9).
    const name = slugName(card?.params.line1 ?? '');
    steps.replaceChildren(...(card ? stepsFor(t, card) : []).map((s) => stepItem(s, name)));
    stepsBox.hidden = false;
  };

  function choose(id: TargetId) {
    chosen = id;
    verdict = null;
    targetButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(ids[i] === id)));
    status.textContent = '';
    refresh();
  }

  download.addEventListener('click', async () => {
    if (!chosen || busy) return;
    const target = TARGETS[chosen];
    busy = true;
    download.disabled = true;
    status.textContent = EXPORT.working;
    try {
      await nextPaint();
      const card = await deps.prepare(target.kind === 'laser' ? 'laser' : 'blade');
      verdict = card;
      showWarnings(card);
      if (showBlocked(card)) {
        status.textContent = '';
        return;
      }
      status.textContent = EXPORT.rendering;
      const images = await deps.stepImages();
      // The zip and PDF code loads only when someone exports.
      const { exportBundle } = await import('../export/bundle');
      const { filename, blob } = exportBundle(card, target, { name: card.params.line1, images });
      deps.saveBlob(filename, blob);
      status.textContent = EXPORT.done(filename);
      track('card_exported', {
        target: target.id,
        theme: card.params.theme,
        size: card.params.size,
        font: card.params.font,
        lines: card.layout.lines.length,
        warnings: card.notes.filter((n) => n.level !== 'info').length,
      });
    } catch (e) {
      console.error(e);
      status.textContent = EXPORT.failed;
    } finally {
      busy = false;
      refresh();
    }
  });

  close.addEventListener('click', () => closeDialog());
  // A click on the backdrop (the dialog box itself, outside its content) closes it.
  el.addEventListener('click', (e) => e.target === el && closeDialog());

  function closeDialog() {
    if (typeof el.close === 'function') el.close();
    else el.removeAttribute('open');
  }

  return {
    el,
    open() {
      status.textContent = '';
      refresh();
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
      (chosen ? download : targetButtons[0]).focus();
    },
  };
}
