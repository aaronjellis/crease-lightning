/**
 * Editing decorations on the Flat view's inner sheet: select, drag, nudge, resize, and remove. The
 * jacket and the 3D view stay read-only.
 *
 * Each placed item gets a transparent hit target (its poly in sheet coordinates: x = u + W, y flipped
 * as `pieceSvg` does, R12). A drag tests each candidate with `canPlace` against the last build's
 * layout, the positions people see, and draws it as a ghost marked `data-state="ok|blocked"`. A drop
 * on ok pins the item at its drawn size; a drop on blocked changes nothing, so the item stays where
 * it was. Arrow keys move in screen directions (ArrowUp is +y, since the sheet is drawn flipped).
 *
 * A committed edit shows as an ok ghost until the next build lands, and further nudges start from it,
 * so quick key presses add up even while the build is still running.
 *
 * The selected item also gets a × button (a real HTML button over the sheet, placed in percentages of
 * it) that removes it, as Delete does.
 */
import { polyToSvgPath, type Poly, type Pt } from '@kerfuffle/engine/geom';
import type { Card } from '../core/build';
import { MAX_ITEM_MM } from '../core/codec';
import { atLeastMin, iconExtent, iconPoly, toPin } from '../core/decor/geometry';
import { moveItem, removeItem, resizeItem } from '../core/decor/model';
import { canPlace } from '../core/decor/place';
import type { Page } from '../core/decor/types';
import { iconById } from '../themes';
import { track, type Ctx } from './context';
import { h } from './dom';
import { DECORATIONS, FLAT } from './strings';

const SVG_NS = 'http://www.w3.org/2000/svg';
const NUDGE_MM = 1;
const NUDGE_SHIFT_MM = 5;
const RESIZE_STEP_MM = 0.5;
/** A press that moves less than this (CSS px) is a click, not a drag. */
const DRAG_SLOP_PX = 3;
const HANDLE_R_MM = 3;
export const FLAT_HINT_ID = 'cl-flat-hint';

/** An item at a spot and size: what the ghost draws and a commit stores. */
interface Pose {
  id: string;
  icon: string;
  page: Page;
  centre: Pt;
  sizeMm: number;
}

interface Drag {
  mode: 'move' | 'resize';
  pointerId: number;
  start: { x: number; y: number };
  /**
   * What the press grabbed minus the pointer, in flat mm (the item's centre for a move, its box
   * corner for a resize), so the item doesn't jump to the pointer.
   */
  offset: Pt;
  from: Pose;
  active: boolean;
  candidate: Pose | null;
  ok: boolean;
}

export interface DecorEditor {
  /** What to focus after the next render: an item id, the sheet, or nothing. */
  focused(): string | 'sheet' | null;
  /** Wires a freshly rendered (and mounted) inner sheet for `card`. */
  attach(svg: SVGSVGElement, card: Card, refocus: string | 'sheet' | null): void;
  /** Outlines the selected item (the rail may have changed it) and places its size handle. */
  showSelection(): void;
}

const pageOf = (u: number): Page => (u < 0 ? 'back' : 'base');

export function decorEditor(ctx: Ctx): DecorEditor {
  let svg: SVGSVGElement | null = null;
  let card: Card | null = null;
  let layer: SVGGElement | null = null;
  let outline: SVGPathElement | null = null;
  let handle: SVGCircleElement | null = null;
  let ghost: SVGPathElement | null = null;
  const removeBtn = h('button', { type: 'button', class: 'decor-remove' }, '×');
  const hits = new Map<string, SVGPathElement>();
  let drag: Drag | null = null;
  /** The last committed edit, until a build of the current params replaces the card. */
  let pending: Pose | null = null;

  const size = () => ({ W: card!.inner.widthMm / 2, L: card!.inner.heightMm });
  const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] => {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const sheetPath = (poly: Poly): string => {
    const { W, L } = size();
    return polyToSvgPath(poly.map((c) => c.map((p) => ({ x: p.x + W, y: L - p.y }))), 3);
  };
  const posePath = (p: Pose) => sheetPath(iconPoly(p.icon, p.page, p.centre, atLeastMin(p.icon, p.sizeMm)));

  /** Where the item is now: its committed-but-unbuilt pose, else where the last build put it. */
  const poseOf = (id: string): Pose | null => {
    if (pending?.id === id) return pending;
    const it = card?.decor.items.find((i) => i.id === id);
    return it ? { id, icon: it.icon, page: it.page, centre: it.centre, sizeMm: it.sizeMm } : null;
  };

  const fits = (p: Pose) => {
    const { W, L } = size();
    return canPlace(card!.decor, p, W, L);
  };

  const drawGhost = (p: Pose | null, ok: boolean) => {
    if (!p || !layer) {
      ghost?.remove();
      ghost = null;
      return;
    }
    ghost ??= layer.appendChild(el('path', { class: 'decor-ghost', 'vector-effect': 'non-scaling-stroke', 'aria-hidden': 'true' }));
    ghost.setAttribute('d', posePath(p));
    ghost.dataset.state = ok ? 'ok' : 'blocked';
  };
  const redrawGhost = () => {
    if (drag?.active) drawGhost(drag.candidate, drag.ok);
    else drawGhost(pending, true);
  };

  /**
   * Stores a pose the check passed, pinned where it is drawn: a move at its drawn size, a resize at
   * its new size. An unpinned resize would re-run the scatter at the new size, where an earlier
   * candidate can win and the item jumps.
   */
  const commit = (p: Pose, kind: 'move' | 'resize') => {
    const { W, L } = size();
    const params = ctx.params();
    const pin = toPin(p.page, p.centre, W, L);
    const decor =
      kind === 'move' ? moveItem(params.decor, p.id, pin, p.sizeMm) : moveItem(resizeItem(params.decor, p.id, p.sizeMm), p.id, pin);
    pending = p;
    if (kind === 'move') ctx.noteMove();
    ctx.update({ ...params, decor });
    redrawGhost();
  };

  // ---------------------------------------------------------------- pointer
  const toFlat = (e: PointerEvent): Pt | null => {
    const m = svg?.getScreenCTM();
    if (!m) return null;
    const det = m.a * m.d - m.b * m.c;
    if (!det) return null;
    const X = e.clientX - m.e;
    const Y = e.clientY - m.f;
    const { W, L } = size();
    return { x: (m.d * X - m.c * Y) / det - W, y: L - (-m.b * X + m.a * Y) / det };
  };

  const candidateAt = (d: Drag, p: Pt): Pose => {
    if (d.mode === 'move') {
      const centre = { x: p.x + d.offset.x, y: p.y + d.offset.y };
      return { ...d.from, page: pageOf(centre.x), centre };
    }
    // Resize from the box corner: the size whose box corner sits where the press put it.
    const corner = { x: p.x + d.offset.x, y: p.y + d.offset.y };
    const aspect = iconExtent(d.from.icon, 1).w;
    const raw = Math.max(2 * Math.abs(corner.x - d.from.centre.x), (2 * Math.abs(corner.y - d.from.centre.y)) / aspect);
    const sizeMm = Math.min(MAX_ITEM_MM, Math.max(iconById(d.from.icon).minHeightMm, Math.round(raw / RESIZE_STEP_MM) * RESIZE_STEP_MM));
    return { ...d.from, sizeMm };
  };

  const endDrag = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    svg?.removeAttribute('data-dragging');
    drag = null;
  };
  const cancelDrag = () => {
    if (!drag) return;
    endDrag();
    redrawGhost();
  };

  function onMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    // The button came up where we didn't hear it (outside the window, capture lost to a rebuild).
    if (e.pointerType === 'mouse' && e.buttons === 0) return cancelDrag();
    follow(e);
  }

  /** Moves the candidate to the pointer and checks it. */
  function follow(e: PointerEvent) {
    if (!drag || !card) return;
    if (!drag.active && Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) < DRAG_SLOP_PX) return;
    const p = toFlat(e);
    if (!p) return;
    drag.active = true;
    svg?.setAttribute('data-dragging', '');
    drag.candidate = candidateAt(drag, p);
    drag.ok = fits(drag.candidate);
    drawGhost(drag.candidate, drag.ok);
  }

  function onUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    // The release point counts, wherever the last move event left the candidate.
    follow(e);
    const d = drag;
    endDrag();
    if (d.active && d.ok && d.candidate) commit(d.candidate, d.mode);
    // Blocked, or only a click: the params stay, and the item stays where it was.
    else redrawGhost();
  }

  function onCancel(e: PointerEvent) {
    if (drag && e.pointerId === drag.pointerId) cancelDrag();
  }

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || drag || !svg || !card) return;
    const target = e.target as Element;
    const hitEl = target.closest('.decor-hit');
    const resize = !hitEl && target.closest('.decor-handle');
    const id = hitEl?.getAttribute('data-item') ?? (resize ? ctx.selection() : null);
    if (!id) return;
    const from = poseOf(id);
    const p = toFlat(e);
    if (!from || !p) return;
    ctx.select(id);
    // A resize grabs the box's bottom-right corner as drawn, where the handle sits.
    const { h: bh, w: bw } = iconExtent(from.icon, atLeastMin(from.icon, from.sizeMm));
    const grab = resize ? { x: from.centre.x + bh / 2, y: from.centre.y - bw / 2 } : from.centre;
    drag = {
      mode: resize ? 'resize' : 'move',
      pointerId: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      offset: { x: grab.x - p.x, y: grab.y - p.y },
      from,
      active: false,
      candidate: null,
      ok: false,
    };
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      // Not a live pointer (a synthetic event): the window listeners still see every move.
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  // ---------------------------------------------------------------- keyboard
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cancelDrag();
      ctx.select(null);
      svg?.focus();
      e.preventDefault();
      return;
    }
    const id = ctx.selection();
    const from = id && card ? poseOf(id) : null;
    if (!id || !from || drag) return;
    const step = e.shiftKey ? NUDGE_SHIFT_MM : NUDGE_MM;
    // Screen directions: the sheet's x is +u; its y is flipped, so up on screen is +y.
    const delta: Record<string, Pt> = { ArrowRight: { x: step, y: 0 }, ArrowLeft: { x: -step, y: 0 }, ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step } };
    const d = delta[e.key];
    if (d) {
      e.preventDefault();
      const centre = { x: from.centre.x + d.x, y: from.centre.y + d.y };
      const next = { ...from, page: pageOf(centre.x), centre };
      if (fits(next)) commit(next, 'move');
      return;
    }
    const grow = e.key === '+' || e.key === '=' ? 1 : e.key === '-' || e.key === '_' ? -1 : 0;
    if (grow) {
      e.preventDefault();
      const stored = ctx.params().decor.items.find((i) => i.id === id)?.sizeMm;
      const base = pending?.id === id ? pending.sizeMm : (stored ?? from.sizeMm);
      const sizeMm = Math.min(MAX_ITEM_MM, Math.max(iconById(from.icon).minHeightMm, base + grow * RESIZE_STEP_MM));
      // Like the handle: only a size that fits where the item is drawn.
      const next = { ...from, sizeMm };
      if (sizeMm !== base && fits(next)) commit(next, 'resize');
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(id);
    }
  };

  /** Removes the item and clears the selection; focus goes to the sheet, since the item is going. */
  function remove(id: string) {
    const params = ctx.params();
    const icon = poseOf(id)?.icon;
    pending = null;
    if (document.activeElement !== svg) svg?.focus();
    ctx.update({ ...params, decor: removeItem(params.decor, id) });
    ctx.select(null);
    redrawGhost();
    if (icon) track('decor_item_removed', { icon });
  }
  removeBtn.addEventListener('click', () => {
    const id = ctx.selection();
    if (id) remove(id);
  });

  const onFocus = (e: FocusEvent) => {
    const id = (e.target as Element).getAttribute?.('data-item');
    if (id) ctx.select(id);
  };

  // ---------------------------------------------------------------- selection
  const showSelection = () => {
    if (!svg || !layer || !card) return;
    const selected = ctx.selection();
    for (const [id, hit] of hits) hit.setAttribute('aria-pressed', String(id === selected));
    const pose = selected ? card.decor.items.find((i) => i.id === selected) : undefined;
    if (!pose || !selected) {
      outline?.remove();
      handle?.remove();
      removeBtn.remove();
      outline = handle = null;
      return;
    }
    outline ??= el('path', { class: 'decor-outline', 'vector-effect': 'non-scaling-stroke', 'aria-hidden': 'true' });
    outline.setAttribute('d', sheetPath(pose.poly));
    // Under the hit targets, so it never takes a press.
    layer.insertBefore(outline, layer.firstChild);
    // The size handle sits on the box's bottom-right corner as drawn (the sheet's y is flipped).
    const { W, L } = size();
    const { h, w } = iconExtent(pose.icon, atLeastMin(pose.icon, pose.sizeMm));
    handle ??= el('circle', {
      class: 'decor-handle',
      r: String(HANDLE_R_MM),
      'vector-effect': 'non-scaling-stroke',
      'aria-label': FLAT.resize,
      'data-ph-capture-attribute-control': 'decor-resize-handle',
    });
    handle.setAttribute('cx', String(pose.centre.x + h / 2 + W));
    handle.setAttribute('cy', String(L - (pose.centre.y - w / 2)));
    layer.appendChild(handle);
    // The × sits on the box's top-right corner as drawn, over the sheet's wrapper (same box as the SVG).
    const icon = iconById(pose.icon);
    removeBtn.setAttribute('aria-label', DECORATIONS.remove(icon.name));
    removeBtn.setAttribute('data-ph-capture-attribute-item', pose.id);
    removeBtn.setAttribute('data-ph-capture-attribute-icon', icon.id);
    removeBtn.style.left = `${((pose.centre.x + h / 2 + W) / (2 * W)) * 100}%`;
    removeBtn.style.top = `${((L - (pose.centre.y + w / 2)) / L) * 100}%`;
    if (removeBtn.parentElement !== svg.parentElement) svg.parentElement?.appendChild(removeBtn);
  };

  return {
    focused() {
      const active = document.activeElement;
      if (!svg || !active || !svg.contains(active)) return null;
      return active === svg ? 'sheet' : (active.getAttribute('data-item') ?? 'sheet');
    },

    attach(next, nextCard, refocus) {
      svg = next;
      card = nextCard;
      // A card built from the current params shows every committed edit.
      if (nextCard.params === ctx.params()) pending = null;
      hits.clear();
      outline = handle = ghost = null;
      if (drag && !nextCard.decor.items.some((i) => i.id === drag!.from.id)) endDrag();
      // The old sheet held the pointer capture and is gone: the new one takes it, so the release
      // still reaches us even outside the window.
      if (drag) {
        try {
          next.setPointerCapture(drag.pointerId);
        } catch {
          // The pointer is no longer active (or synthetic): the buttons check in onMove catches it.
        }
      }

      const items = nextCard.decor.items;
      if (items.length) {
        next.setAttribute('role', 'group');
        next.setAttribute('tabindex', '0');
        next.setAttribute('aria-describedby', FLAT_HINT_ID);
      }
      layer = el('g', { class: 'decor-edit' });
      for (const it of items) {
        const icon = iconById(it.icon);
        const hit = el('path', {
          class: 'decor-hit',
          d: sheetPath(it.poly),
          'data-item': it.id,
          tabindex: '0',
          role: 'button',
          'aria-label': icon.name,
          'aria-pressed': 'false',
          'vector-effect': 'non-scaling-stroke',
          'data-ph-capture-attribute-item': it.id,
          'data-ph-capture-attribute-icon': icon.id,
        });
        hits.set(it.id, hit);
        layer.appendChild(hit);
      }
      next.appendChild(layer);
      next.addEventListener('pointerdown', onDown);
      next.addEventListener('keydown', onKey);
      next.addEventListener('focusin', onFocus);
      if (drag) next.setAttribute('data-dragging', '');

      showSelection();
      redrawGhost();
      if (refocus) (hits.get(refocus) ?? (items.length ? next : null))?.focus({ preventScroll: true });
    },

    showSelection,
  };
}
