/**
 * The Flat tab: the inner sheet and the jacket as they'll be cut, drawn by the exporter's own
 * `pieceSvg` in preview mode. Each sheet sits on its paper colour; holes show the jacket colour, as
 * they will in the finished card. Cuts are solid, valley folds dashed, mountain folds dash-dot (the
 * print PDF's convention).
 */
import type { Card } from '../core/build';
import type { Piece } from '../core/flatten';
import { pieceSvg } from '../export/svg';
import { TARGETS } from '../export/targets';
import { h, svgFrom } from './dom';
import { FLAT } from './strings';

/** Score folds so every fold is drawn as its own line; the colours come from the paper. */
const PREVIEW_TARGET = TARGETS.cricut;

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
export function sheetSvg(piece: Piece, paper: string): string {
  const ink = inkOn(paper);
  const svg = pieceSvg(piece, PREVIEW_TARGET, { cut: ink, score: ink }, { preview: true });
  // Our own markup: put the paper behind every line, just inside the opening tag.
  const at = svg.indexOf('>') + 1;
  const sheet = `<rect width="${piece.widthMm}" height="${piece.heightMm}" fill="${paper}" data-part="paper"/>`;
  return svg.slice(0, at) + sheet + svg.slice(at);
}

const legendLine = (kind: string, label: string) =>
  h('li', {}, svgFrom(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 6" aria-hidden="true"><line x1="1" y1="3" x2="27" y2="3" data-legend="${kind}"/></svg>`), label);

export function flatView(): { el: HTMLElement; render(card: Card): void } {
  const sheets = h('div', { class: 'flat-sheets' });
  const legend = h(
    'ul',
    { class: 'flat-legend', 'aria-label': 'Line key' },
    legendLine('cut', FLAT.cut),
    legendLine('valley', FLAT.valley),
    legendLine('mountain', FLAT.mountain),
    h('li', {}, h('span', { class: 'swatch-hole', 'aria-hidden': 'true' }), FLAT.showThrough)
  );
  const el = h('div', { class: 'flat-view' }, sheets, legend);

  return {
    el,
    render(card) {
      const { inner, jacket } = card.params.colours;
      const figure = (piece: Piece, paper: string, label: string) => {
        const svg = svgFrom(sheetSvg(piece, paper));
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', FLAT.label(label, piece.widthMm, piece.heightMm));
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        return h('figure', { class: 'sheet' }, svg, h('figcaption', { text: FLAT.label(label, piece.widthMm, piece.heightMm) }));
      };
      el.style.setProperty('--show-through', jacket);
      sheets.replaceChildren(figure(card.inner, inner, FLAT.inner), figure(card.jacket, jacket, FLAT.jacket));
    },
  };
}
