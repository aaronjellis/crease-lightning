/**
 * One piece as ASCII DXF (R12): millimetres, layers `CUT` and `SCORE`, POLYLINE/VERTEX entities.
 * DXF is y-up, so this writes the raw flat y (the SVG export flips it). Folds go on `SCORE`, or on
 * `CUT` as perforations when the target perforates.
 */
import type { Pt } from '@kerfuffle/engine/geom';
import type { Card } from '../core/build';
import type { Piece } from '../core/flatten';
import { perforate } from './perforate';
import type { Target } from './targets';

const num = (v: number): string => String(Number(v.toFixed(4)));

export function pieceDxf(piece: Piece, target: Target): string {
  const out: string[] = [];
  const g = (code: number | string, value: string | number) => out.push(String(code), String(value));
  const layer = (name: string, colour: number) => {
    g(0, 'LAYER');
    g(2, name);
    g(70, 0);
    g(62, colour);
    g(6, 'CONTINUOUS');
  };

  g(0, 'SECTION');
  g(2, 'HEADER');
  g(9, '$ACADVER');
  g(1, 'AC1009');
  g(9, '$INSUNITS');
  g(70, 4);
  g(0, 'ENDSEC');
  g(0, 'SECTION');
  g(2, 'TABLES');
  g(0, 'TABLE');
  g(2, 'LAYER');
  g(70, 2);
  layer('CUT', 1);
  layer('SCORE', 5);
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  g(0, 'SECTION');
  g(2, 'ENTITIES');

  const poly = (name: string, pts: Pt[], closed: boolean) => {
    g(0, 'POLYLINE');
    g(8, name);
    g(66, 1);
    g(70, closed ? 1 : 0);
    for (const p of pts) {
      g(0, 'VERTEX');
      g(8, name);
      g(10, num(p.x));
      g(20, num(p.y));
      g(30, 0);
    }
    g(0, 'SEQEND');
    g(8, name);
  };

  // Holes, then strip cuts, then the outline last, as in the SVG.
  for (const h of piece.holes) for (const c of h) poly('CUT', c, true);
  for (const c of piece.openCuts) poly('CUT', c, false);
  if (target.fold === 'perforate') {
    for (const f of piece.folds) for (const d of perforate(f.path)) poly('CUT', d, false);
  } else {
    for (const f of piece.folds) poly('SCORE', f.path, false);
  }
  for (const c of piece.outline) poly('CUT', c, true);

  g(0, 'ENDSEC');
  g(0, 'EOF');
  return out.join('\n') + '\n';
}

const shift = (pts: Pt[], dx: number): Pt[] => pts.map((p) => ({ x: p.x + dx, y: p.y }));
const GAP_MM = 10;

/** The inner sheet and the jacket in one DXF, side by side with a 10 mm gap (as in the both-SVG). */
export function cardDxf(card: Card, target: Target): string {
  const { inner, jacket } = card;
  const dx = inner.widthMm + GAP_MM;
  const moved: Piece = {
    ...jacket,
    outline: jacket.outline.map((c) => shift(c, dx)),
    holes: jacket.holes.map((h) => h.map((c) => shift(c, dx))),
    openCuts: jacket.openCuts.map((c) => shift(c, dx)),
    folds: jacket.folds.map((f) => ({ ...f, path: shift(f.path, dx) })),
  };
  return pieceDxf(
    {
      ...inner,
      widthMm: dx + jacket.widthMm,
      heightMm: Math.max(inner.heightMm, jacket.heightMm),
      outline: [...inner.outline, ...moved.outline],
      holes: [...inner.holes, ...moved.holes],
      openCuts: [...inner.openCuts, ...moved.openCuts],
      folds: [...inner.folds, ...moved.folds],
    },
    target
  );
}
