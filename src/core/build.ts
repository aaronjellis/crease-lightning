/**
 * The single pure entry point: params → fitted layout → flattened pieces and panels → checks.
 * Every exporter, the 3D view and the UI call `build`.
 */
import { pathLength } from '@kerfuffle/engine/geom';
import { runChecks, type CheckResult } from './checks';
import { MAT_USABLE_MM } from './constants';
import { fitLayout, type Fix, type Layout, type Note } from './fit';
import { flatten, type Panel, type Piece } from './flatten';
import type { FontSet } from './fonts';
import type { Params } from './model';
import { themeById } from '../themes';

export interface Card {
  params: Params;
  layout: Layout;
  inner: Piece;
  jacket: Piece;
  panels: Panel[];
  checks: CheckResult[];
  fixes: Fix[];
  notes: Note[];
  exportable: boolean;
  stats: { cutMm: number; scoreMm: number };
}

export interface BuildOptions {
  /** Run fit's stroke check (slow). Default true; the UI turns it off per keystroke. */
  strokeCheck?: boolean;
}

export const EMPTY_MESSAGE_NOTE = 'Type a message to make your card.';
export const MAT_NOTE = 'This card needs a 12 × 24 in mat.';

const cutLength = (piece: Piece): number =>
  piece.outline.reduce((t, c) => t + pathLength(c, true), 0) +
  piece.holes.reduce((t, h) => t + h.reduce((s, c) => s + pathLength(c, true), 0), 0) +
  piece.openCuts.reduce((t, c) => t + pathLength(c, false), 0);

const scoreLength = (piece: Piece): number => piece.folds.reduce((t, f) => t + pathLength(f.path, false), 0);

export function build(
  p: Params,
  assets: { fonts: FontSet },
  target: 'blade' | 'laser' = 'blade',
  opts: BuildOptions = {}
): Card {
  const theme = themeById(p.theme);
  const strokeCheck = opts.strokeCheck ?? true;
  // A blank line 1 previews the theme's own text; export stays off until the user types.
  const blankMessage = p.line1.trim() === '';
  const shown: Params = blankMessage ? { ...p, line1: theme.lines[0], line2: theme.lines[1] } : p;

  const layout = fitLayout(shown, assets.fonts, theme, target, { strokeCheck });
  const { inner, jacket, panels } = flatten(layout, shown, theme);

  const notes: Note[] = [...layout.notes];
  if (blankMessage) notes.unshift({ level: 'warn', message: EMPTY_MESSAGE_NOTE });
  if (target === 'blade' && Math.max(inner.widthMm, jacket.widthMm) > MAT_USABLE_MM) {
    notes.push({ level: 'info', message: MAT_NOTE });
  }

  const partial = {
    params: p,
    layout,
    inner,
    jacket,
    panels,
    fixes: layout.fixes,
    notes,
    stats: {
      cutMm: cutLength(inner) + cutLength(jacket),
      scoreMm: scoreLength(inner) + scoreLength(jacket),
    },
    exportable: false,
  };
  const checks = runChecks(partial, shown, { strokeCheck });
  const exportable = !blankMessage && layout.steps.length > 0 && checks.every((c) => c.ok);
  return { ...partial, checks, exportable };
}
