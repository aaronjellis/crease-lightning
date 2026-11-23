/**
 * The Flat tab: the inner sheet and the jacket as they'll be cut, drawn by the exporter's own
 * `pieceSvg` in preview mode. Each sheet sits on its paper colour; holes show the jacket colour, as
 * they will in the finished card. Cuts are solid, valley folds dashed, mountain folds dash-dot (the
 * print PDF's convention).
 *
 * The inner sheet is where decorations are edited (`flatEdit.ts`); the jacket is read-only.
 */
import type { Card } from '../core/build';
import type { Piece } from '../core/flatten';
import type { FoldStyle } from '../core/model';
import { pieceSvg, withFoldStyle } from '../export/svg';
import { TARGETS } from '../export/targets';
import type { Ctx } from './context';
import { h, svgFrom } from './dom';
import { decorEditor, FLAT_HINT_ID } from './flatEdit';
import { FLAT } from './strings';

/**
 * A blade target, so folds score by default and each is drawn as its own line; Advanced → Fold lines
 * still applies, so Perforate shows the perforations (R25).
 */
const previewTarget = (foldStyle: FoldStyle) => withFoldStyle(TARGETS.cricut, foldStyle);

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Dark ink on light paper, light ink on dark paper. */
export const inkOn = (paper: string): string => (luminance(paper) > 0.18 ? '#1c1a17' : '#fbfaf7');

/** A sheet as preview SVG markup on its paper colour. */
export function sheetSvg(piece: Piece, paper: string, foldStyle: FoldStyle = 'auto'): string {
  const ink = inkOn(paper);
  const svg = pieceSvg(piece, previewTarget(foldStyle), { cut: ink, score: ink }, { preview: true });
  // Our own markup: put the paper behind every line, just inside the opening tag.
  const at = svg.indexOf('>') + 1;
  const sheet = `<rect width="${piece.widthMm}" height="${piece.heightMm}" fill="${paper}" data-part="paper"/>`;
  return svg.slice(0, at) + sheet + svg.slice(at);
}

const legendLine = (kind: string, label: string) =>
  h('li', {}, svgFrom(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 6" aria-hidden="true"><line x1="1" y1="3" x2="27" y2="3" data-legend="${kind}"/></svg>`), label);

export function flatView(ctx: Ctx): { el: HTMLElement; render(card: Card): void; showSelection(): void } {
  const sheets = h('div', { class: 'flat-sheets' });
  const legend = h(
    'ul',
    { class: 'flat-legend', 'aria-label': 'Line key' },
    legendLine('cut', FLAT.cut),
    legendLine('valley', FLAT.valley),
    legendLine('mountain', FLAT.mountain),
    legendLine('perforation', FLAT.perforated),
    h('li', {}, h('span', { class: 'swatch-hole', 'aria-hidden': 'true' }), FLAT.showThrough)
  );
  const el = h('div', { class: 'flat-view' }, sheets, legend);
  /** A phone or tablet without a mouse: the hint talks about taps, not keys. */
  const touchFirst = () => typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
  const editor = decorEditor(ctx);

  return {
    el,
    render(card) {
      const { inner, jacket } = card.params.colours;
      const perforated = previewTarget(card.params.advanced.foldStyle).fold === 'perforate';
      legend.dataset.folds = perforated ? 'perforate' : 'score';
      const figure = (piece: Piece, paper: string, label: string, sheet: 'inner' | 'jacket') => {
        const svg = svgFrom(sheetSvg(piece, paper, card.params.advanced.foldStyle));
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', FLAT.label(label, piece.widthMm, piece.heightMm));
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        const hint = sheet === 'inner' && card.decor.items.length ? h('span', { class: 'sheet-hint', id: FLAT_HINT_ID, text: touchFirst() ? FLAT.editHintTouch : FLAT.editHint }) : null;
        // The wrapper has the SVG's box, so the editor can place HTML controls over it in percentages.
        const fig = h('figure', { class: 'sheet', 'data-sheet': sheet }, h('div', { class: 'sheet-art' }, svg), h('figcaption', {}, h('span', { text: FLAT.label(label, piece.widthMm, piece.heightMm) }), hint));
        fig.style.setProperty('--sheet-ink', inkOn(paper));
        fig.style.setProperty('--sheet-paper', paper);
        return { fig, svg };
      };
      el.style.setProperty('--show-through', jacket);
      const innerSheet = figure(card.inner, inner, FLAT.inner, 'inner');
      const refocus = editor.focused();
      sheets.replaceChildren(innerSheet.fig, figure(card.jacket, jacket, FLAT.jacket, 'jacket').fig);
      editor.attach(innerSheet.svg, card, refocus);
    },
    showSelection: () => editor.showSelection(),
  };
}
