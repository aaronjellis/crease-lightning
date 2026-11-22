/**
 * Per-machine SVG export. Output rules (globals): mm units and viewBox, plain hex colours, no
 * defs, use, transform, clipPath, mask, stroke-dasharray, or CSS; holes before the outline; folds
 * are never closed paths.
 *
 * Pieces are in flat coordinates (y up from the spine's start), so every point is written as
 * y_out = heightMm - y. The sheet is cut inside-face up and the SVG's y axis points down, so the
 * flip makes the text read correctly on the mat.
 *
 * Layers: every piece has a `Cut` group and a `Score` group, always both present. The Score
 * group is empty when folds are perforated (they go in Cut), so the layer structure is stable
 * across targets.
 */
import type { Poly, Pt } from '@kerfuffle/engine/geom';
import { polyToSvgPath } from '@kerfuffle/engine/geom';
import type { Card } from '../core/build';
import { ATOMM_CUT, ATOMM_ENGRAVE } from '../core/constants';
import type { Piece } from '../core/flatten';
import type { FoldStyle } from '../core/model';
import { perforate } from './perforate';
import type { Target } from './targets';

export interface Colours {
  cut: string;
  score: string;
}

const GAP_MM = 10;
const NEAR_WHITE_CUT = '#c8c8c8';
const STROKE_MM = 0.1;
const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"';

const num = (v: number): string => String(Number(v.toFixed(3)));

/** The target with `foldStyle` applied: `auto` keeps the target's own style. */
export function withFoldStyle(target: Target, foldStyle: FoldStyle): Target {
  return foldStyle === 'auto' || foldStyle === target.fold ? target : { ...target, fold: foldStyle };
}

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** The paper colour for cut (light grey when its HSL lightness exceeds 0.9), and that colour with its HSL lightness reduced by 35% (L x 0.65) for score. */
export function paperColours(card: Card, piece: 'inner' | 'jacket'): Colours {
  const paper = card.params.colours[piece].toLowerCase();
  const [h, s, l] = hexToHsl(paper);
  // Near-white strokes are invisible in Design Space, so those papers cut in light grey (R16).
  return { cut: l > 0.9 ? NEAR_WHITE_CUT : paper, score: hslToHex(h, s, l * 0.65) };
}

/** The stroke colours for a piece on a target: paper colours, or the two Atomm laser colours. */
export function pieceColours(card: Card, piece: 'inner' | 'jacket', target: Target): Colours {
  return target.palette === 'atomm' ? { cut: ATOMM_CUT, score: ATOMM_ENGRAVE } : paperColours(card, piece);
}

interface Frame {
  heightMm: number;
  dx: number;
}

const pt = (p: Pt, f: Frame): string => `${num(p.x + f.dx)} ${num(f.heightMm - p.y)}`;
const openPath = (pts: Pt[], f: Frame): string => `M${pts.map((p) => pt(p, f)).join('L')}`;
const closedPath = (poly: Poly, f: Frame): string =>
  polyToSvgPath(poly.map((c) => c.map((p) => ({ x: p.x + f.dx, y: f.heightMm - p.y }))), 3);

const path = (d: string, stroke: string): string =>
  `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${STROKE_MM}"/>`;

/** The Cut and Score groups of one piece. `prefix` keeps ids unique when a file holds two pieces. */
function layers(piece: Piece, target: Target, colours: Colours, f: Frame, prefix: string): string {
  const cut: string[] = [];
  // Holes first, then the strip cuts, then the outline last.
  for (const h of piece.holes) cut.push(path(closedPath(h, f), colours.cut));
  for (const c of piece.openCuts) cut.push(path(openPath(c, f), colours.cut));
  if (target.fold === 'perforate') {
    for (const fold of piece.folds) cut.push(path(perforate(fold.path).map((d) => openPath(d, f)).join(''), colours.cut));
  }
  cut.push(path(closedPath(piece.outline, f), colours.cut));

  const score = target.fold === 'score' ? piece.folds.map((fold) => path(openPath(fold.path, f), colours.score)) : [];
  const group = (id: string, items: string[]) =>
    `<g id="${prefix}${id}" inkscape:label="${prefix}${id}" inkscape:groupmode="layer">${items.join('')}</g>`;
  return group('Cut', cut) + group('Score', score);
}

const svgOpen = (w: number, h: number): string =>
  `<svg ${NS} width="${num(w)}mm" height="${num(h)}mm" viewBox="0 0 ${num(w)} ${num(h)}">`;

/** One piece as an SVG with `Cut` and `Score` layers. */
export function pieceSvg(piece: Piece, target: Target, colours: Colours): string {
  const f: Frame = { heightMm: piece.heightMm, dx: 0 };
  return `${svgOpen(piece.widthMm, piece.heightMm)}${layers(piece, target, colours, f, '')}</svg>\n`;
}

/** The inner sheet and jacket side by side with a 10 mm gap, each with its own paper colours and layers. */
export function bothSvg(card: Card, target: Target): string {
  const t = withFoldStyle(target, card.params.advanced.foldStyle);
  const { inner, jacket } = card;
  const w = inner.widthMm + GAP_MM + jacket.widthMm;
  const h = Math.max(inner.heightMm, jacket.heightMm);
  const innerF: Frame = { heightMm: inner.heightMm, dx: 0 };
  const jacketF: Frame = { heightMm: jacket.heightMm, dx: inner.widthMm + GAP_MM };
  return (
    svgOpen(w, h) +
    layers(inner, t, pieceColours(card, 'inner', t), innerF, 'Inner-') +
    layers(jacket, t, pieceColours(card, 'jacket', t), jacketF, 'Jacket-') +
    '</svg>\n'
  );
}
