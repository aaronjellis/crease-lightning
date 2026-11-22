/**
 * Print-at-100% PDF (cut by hand) and the how-to PDF. jsPDF is y-down, so flat points are flipped
 * like the SVG export (y_out = heightMm - y), which keeps text reading correctly. (DXF is y-up and
 * writes raw y.)
 */
import { jsPDF } from 'jspdf';
import type { Pt } from '@kerfuffle/engine/geom';
import type { Card } from '../core/build';
import { FOLD_STEPS } from '../core/foldSteps';
import type { Piece } from '../core/flatten';
import type { Params } from '../core/model';
import { slugName } from './slug';
import { perforate } from './perforate';
import type { Target } from './targets';

const LETTER = { w: 215.9, h: 279.4 };
const A4 = { w: 210, h: 297 };
const A3 = { w: 297, h: 420 };
const CHECK_MM = 50;
const MARGIN = 8;
/** Space kept clear at the top of each page for the title and legend. */
const HEADER_MM = 17;

export interface Page {
  w: number;
  h: number;
}

/** Letter for 5x7 and A2, A4 for A6, A3 for A5; landscape when the piece is wider than tall. */
export function pageFor(size: Params['size'], widthMm: number, heightMm: number): Page {
  const base = size === 'a6' ? A4 : size === 'a5' ? A3 : LETTER;
  return widthMm > heightMm ? { w: base.h, h: base.w } : base;
}

/** A flat point on the page: 1 mm = 1 mm, centred (nudged down to clear the header when tight), y flipped. */
export function mapPoint(piece: Pick<Piece, 'widthMm' | 'heightMm'>, page: Page, p: Pt): Pt {
  const top = Math.max((page.h - piece.heightMm) / 2, Math.min(HEADER_MM, page.h - piece.heightMm - MARGIN));
  return { x: (page.w - piece.widthMm) / 2 + p.x, y: top + (piece.heightMm - p.y) };
}

type Doc = jsPDF;
const open = (doc: Doc, pts: Pt[]) => {
  pts.slice(1).forEach((p, i) => doc.line(pts[i].x, pts[i].y, p.x, p.y));
};
const closed = (doc: Doc, pts: Pt[]) => open(doc, [...pts, pts[0]]);

function drawPiece(doc: Doc, piece: Piece, page: Page) {
  const m = (pts: Pt[]) => pts.map((p) => mapPoint(piece, page, p));
  doc.setLineWidth(0.2);
  doc.setDrawColor(0, 0, 0);
  doc.setLineDashPattern([], 0);
  for (const h of piece.holes) for (const c of h) closed(doc, m(c));
  for (const c of piece.openCuts) open(doc, m(c));
  for (const c of piece.outline) closed(doc, m(c));
  doc.setDrawColor(70, 70, 70);
  for (const f of piece.folds) {
    // Valley: dashed 3/2. Mountain: dash-dot 3/1.5/0.6/1.5.
    doc.setLineDashPattern(f.kind === 'valley' ? [3, 2] : [3, 1.5, 0.6, 1.5], 0);
    open(doc, m(f.path));
  }
  doc.setLineDashPattern([], 0);
}

/** Points along every drawn path (about every 2 mm), in page mm. */
function samples(piece: Piece, page: Page): Pt[] {
  const paths: Pt[][] = [
    ...piece.outline.map((c) => [...c, c[0]]),
    ...piece.holes.flatMap((h) => h.map((c) => [...c, c[0]])),
    ...piece.openCuts,
    ...piece.folds.map((f) => f.path),
  ];
  const out: Pt[] = [];
  for (const path of paths) {
    const pts = path.map((p) => mapPoint(piece, page, p));
    for (let i = 1; i < pts.length; i++) {
      const n = Math.max(1, Math.ceil(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / 2));
      for (let k = 0; k <= n; k++) out.push({ x: pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * k) / n, y: pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * k) / n });
    }
  }
  return out;
}

/** Where the 50 mm check square goes: the page position that touches the fewest drawn lines (none when there is room). */
export function checkSquareAt(piece: Piece, page: Page): Pt {
  const CELL = 5;
  const cols = Math.ceil(page.w / CELL);
  const marked = new Set<number>();
  for (const p of samples(piece, page)) marked.add(Math.floor(p.y / CELL) * cols + Math.floor(p.x / CELL));
  const span = CHECK_MM / CELL;
  let best: Pt = { x: MARGIN, y: HEADER_MM };
  let bestHits = Infinity;
  for (let y = HEADER_MM; y + CHECK_MM <= page.h - MARGIN; y += CELL) {
    for (let x = MARGIN; x + CHECK_MM <= page.w - MARGIN; x += CELL) {
      let hits = 0;
      for (let r = -1; r <= span; r++) for (let c = -1; c <= span; c++) if (marked.has((Math.floor(y / CELL) + r) * cols + Math.floor(x / CELL) + c)) hits++;
      if (hits < bestHits) {
        bestHits = hits;
        best = { x, y };
      }
    }
  }
  return best;
}

function drawChrome(doc: Doc, piece: Piece, page: Page, title: string) {
  const { x: sx, y: sy } = checkSquareAt(piece, page);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setLineDashPattern([], 0);
  doc.setLineWidth(0.2);
  doc.setDrawColor(0, 0, 0);
  doc.rect(sx, sy, CHECK_MM, CHECK_MM);
  doc.setFontSize(8);
  doc.text(['Check square', '50 \u00d7 50 mm', 'Print at 100%'], sx + CHECK_MM / 2, sy + CHECK_MM / 2 - 3, { align: 'center' });

  // Title and legend on one header band at the top.
  doc.setFontSize(10);
  doc.text(title, MARGIN, 8);
  doc.setFontSize(8);
  const rows: [string, number[], number][] = [
    ['Cut', [], 0],
    ['Valley fold', [3, 2], 70],
    ['Mountain fold', [3, 1.5, 0.6, 1.5], 70],
  ];
  let x = MARGIN;
  for (const [label, dash, grey] of rows) {
    doc.setDrawColor(grey);
    doc.setLineDashPattern(dash, 0);
    doc.line(x, 13, x + 16, 13);
    doc.setLineDashPattern([], 0);
    doc.text(label, x + 18, 14);
    x += 18 + doc.getTextWidth(label) + 8;
  }
}

/** One page per piece (inner, then jacket), geometry at 100%. */
export function printPdf(card: Card): Uint8Array {
  const { size } = card.params;
  const pieces = [card.inner, card.jacket];
  const first = pageFor(size, pieces[0].widthMm, pieces[0].heightMm);
  const doc = new jsPDF({ unit: 'mm', format: [first.w, first.h], orientation: first.w > first.h ? 'landscape' : 'portrait' });
  pieces.forEach((piece, i) => {
    const page = pageFor(size, piece.widthMm, piece.heightMm);
    if (i > 0) doc.addPage([page.w, page.h], page.w > page.h ? 'landscape' : 'portrait');
    drawPiece(doc, piece, page);
    drawChrome(doc, piece, page, `Crease Lightning: ${piece.id === 'inner' ? 'inner sheet' : 'jacket'} (print at 100%)`);
  });
  return new Uint8Array(doc.output('arraybuffer'));
}

const plain = (s: string, name: string) => s.replace(/`/g, '').replace(/<name>/g, name);

/** Page 1: the target's steps, then the folding steps. Optional PNGs (by fold step id) add one page each. */
export function howToPdf(card: Card, target: Target, images: { step: string; png: Uint8Array }[] = []): Uint8Array {
  const name = slugName(card.params.line1);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const left = 20;
  const width = 170;
  let y = 24;
  const heading = (t: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(t, left, y);
    y += 9;
  };
  const item = (n: number, t: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(`${n}. ${t}`, width) as string[];
    doc.text(lines, left, y);
    y += lines.length * 5.5 + 2;
  };
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Make your pop-up card', left, y);
  y += 12;
  heading(`Cut it: ${target.label}`);
  target.steps.forEach((s, i) => item(i + 1, plain(s, name)));
  y += 6;
  heading('Fold it');
  FOLD_STEPS.forEach((s, i) => item(i + 1, s.text));

  for (const s of FOLD_STEPS) {
    const img = images.find((i) => i.step === s.id);
    if (!img) continue;
    doc.addPage('a4', 'portrait');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    const lines = doc.splitTextToSize(s.text, width) as string[];
    doc.text(lines, left, 24);
    doc.addImage(img.png, 'PNG', left, 24 + lines.length * 6 + 4, width, width * 0.75);
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
