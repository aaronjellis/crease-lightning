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
const TABLOID = { w: 279.4, h: 431.8 };
const A4 = { w: 210, h: 297 };
const A3 = { w: 297, h: 420 };
const A2 = { w: 420, h: 594 };
/** Paper by size, smallest first (R19: Letter for 5x7 and A2, A4 for A6, A3 for A5). */
const PAPER: Record<Params['size'], { w: number; h: number }[]> = {
  '5x7': [LETTER, TABLOID, A3, A2],
  a2: [LETTER, TABLOID, A3, A2],
  a6: [A4, A3, A2],
  a5: [A3, A2],
};
const CHECK_MM = 50;
export const MARGIN = 8;
/** Space kept clear at the top of each page for the title and legend. */
export const HEADER_MM = 17;

export interface Page {
  w: number;
  h: number;
}

/**
 * The R19 paper for the size, landscape when the piece is wider than tall. When the piece does not
 * fit with the margins and header clear (short-spine cards are twice as wide as they are tall),
 * the next paper up is used rather than clamping.
 */
export function pageFor(size: Params['size'], widthMm: number, heightMm: number): Page {
  const land = widthMm > heightMm;
  const orient = (b: { w: number; h: number }): Page => (land ? { w: b.h, h: b.w } : b);
  const papers = PAPER[size];
  const page = papers.map(orient).find((q) => widthMm + 2 * MARGIN <= q.w && heightMm + HEADER_MM + MARGIN <= q.h);
  return page ?? orient(papers[papers.length - 1]);
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

/** The title and legend, in the top margin (above the sheet; mapPoint keeps the sheet below HEADER_MM). */
function drawHeader(doc: Doc, title: string) {
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
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
    doc.setLineWidth(0.2);
    doc.setDrawColor(grey);
    doc.setLineDashPattern(dash, 0);
    doc.line(x, 13, x + 16, 13);
    doc.setLineDashPattern([], 0);
    doc.text(label, x + 18, 14);
    x += 18 + doc.getTextWidth(label) + 8;
  }
}

/** Page 1: title, legend, the 50 mm check square, and the print instruction. Nothing here touches a sheet. */
function drawCheckPage(doc: Doc, page: Page) {
  drawHeader(doc, 'Crease Lightning: print check');
  const sx = (page.w - CHECK_MM) / 2;
  const sy = HEADER_MM + 20;
  doc.setLineWidth(0.2);
  doc.setDrawColor(0, 0, 0);
  doc.setLineDashPattern([], 0);
  doc.rect(sx, sy, CHECK_MM, CHECK_MM);
  doc.setFontSize(11);
  doc.text('Print at 100%. This square must measure 50 mm.', page.w / 2, sy + CHECK_MM + 12, { align: 'center' });
}

/** Page 1 is the check page; then one page per piece (inner, then jacket), geometry at 100%. */
export function printPdf(card: Card): Uint8Array {
  const { size } = card.params;
  const pieces = [card.inner, card.jacket];
  const check = pageFor(size, 0, 1);
  const doc = new jsPDF({ unit: 'mm', format: [check.w, check.h], orientation: 'portrait' });
  drawCheckPage(doc, check);
  for (const piece of pieces) {
    const page = pageFor(size, piece.widthMm, piece.heightMm);
    doc.addPage([page.w, page.h], page.w > page.h ? 'landscape' : 'portrait');
    drawPiece(doc, piece, page);
    drawHeader(doc, `Crease Lightning: ${piece.id === 'inner' ? 'inner sheet' : 'jacket'}`);
  }
  return new Uint8Array(doc.output('arraybuffer'));
}

const plain = (s: string, name: string) => s.replace(/`/g, '').replace(/<name>/g, name);

/** Page 1: the target's steps, then the folding steps. Optional PNGs (by fold step id) add one page each. */
export function howToPdf(card: Card, target: Target, images: { step: string; png: Uint8Array }[] = [], name: string = slugName(card.params.line1)): Uint8Array {
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
