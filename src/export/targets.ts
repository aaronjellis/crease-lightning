import { MAT_NOTE, needsBigMat, type Card } from '../core/build';
import type { FoldStyle } from '../core/model';

export type TargetId = 'cricut' | 'xtool-c1' | 'xtool-laser' | 'silhouette' | 'other' | 'print';

export type TargetFile = 'inner-svg' | 'jacket-svg' | 'both-svg' | 'dxf' | 'print-pdf' | 'howto-pdf' | 'json';

export interface Target {
  id: TargetId;
  label: string;
  kind: 'blade' | 'laser' | 'print';
  /** The default fold-line style; `Params.advanced.foldStyle` other than `auto` overrides it. */
  fold: 'score' | 'perforate';
  /** `paper` strokes use the card colours; `atomm` uses the two laser colours. */
  palette: 'paper' | 'atomm';
  files: TargetFile[];
}

const SVGS: TargetFile[] = ['inner-svg', 'jacket-svg', 'both-svg'];

/** The spec's "Fold lines by machine" table. */
export const TARGETS: Record<TargetId, Target> = {
  cricut: { id: 'cricut', label: 'Cricut', kind: 'blade', fold: 'score', palette: 'paper', files: [...SVGS, 'howto-pdf', 'json'] },
  'xtool-c1': { id: 'xtool-c1', label: 'xTool C1', kind: 'blade', fold: 'score', palette: 'paper', files: [...SVGS, 'howto-pdf', 'json'] },
  'xtool-laser': { id: 'xtool-laser', label: 'xTool laser', kind: 'laser', fold: 'perforate', palette: 'atomm', files: [...SVGS, 'howto-pdf', 'json'] },
  silhouette: { id: 'silhouette', label: 'Silhouette', kind: 'blade', fold: 'score', palette: 'paper', files: [...SVGS, 'dxf', 'howto-pdf', 'json'] },
  other: { id: 'other', label: 'Other cutter', kind: 'blade', fold: 'score', palette: 'paper', files: [...SVGS, 'dxf', 'howto-pdf', 'json'] },
  print: { id: 'print', label: 'Print and cut by hand', kind: 'print', fold: 'score', palette: 'paper', files: ['print-pdf', 'howto-pdf', 'json'] },
};

/** The target with `foldStyle` applied: `auto` keeps the target's own style. */
export function withFoldStyle(target: Target, foldStyle: FoldStyle): Target {
  return foldStyle === 'auto' || foldStyle === target.fold ? target : { ...target, fold: foldStyle };
}

/**
 * The machine steps for this card on this target, after Advanced → Fold lines (M1). `<name>` stands for
 * the file name slug; backticks mark file names. Creasing is a folding step (`FOLD_STEPS`), not a
 * machine step, so it isn't repeated here (M10).
 *
 * - Perforated folds have no Score layer, so no step changes or attaches one.
 * - A card wider or taller than the 12 × 12 in mat's cutting area says so on blade machines (M9).
 */
export function stepsFor(target: Target, card: Card): string[] {
  const t = withFoldStyle(target, card.params.advanced.foldStyle);
  const score = t.fold === 'score';
  const mat = needsBigMat(card) ? ` ${MAT_NOTE}` : '';
  switch (t.id) {
    case 'cricut':
      // Attach keeps each sheet's score with its own cut; the two sheets still cut on their own mats (R32).
      return score
        ? [
            'Upload `<name>-both.svg` in Design Space.',
            'Change Inner-Score and Jacket-Score to Score.',
            'Select Inner-Cut and Inner-Score and click Attach. Do the same for Jacket-Cut and Jacket-Score.',
            `Click Make it.${mat}`,
          ]
        : ['Upload `<name>-both.svg` in Design Space.', `Click Make it.${mat}`];
    case 'xtool-c1':
      return [
        "Open `<name>-both.svg` in xTool's software.",
        ...(score ? ['Set the Score layer to Score and the Cut layer to Cut.'] : []),
        `Cut the inner sheet and the jacket on their own card colours.${mat}`,
      ];
    case 'xtool-laser':
      return [
        score
          ? 'Open the SVGs in xTool Studio. Blue lines score and red lines cut.'
          : 'Open the SVGs in xTool Studio. Red lines cut, including the short fold perforations.',
        'Run a test cut on scrap card first.',
      ];
    case 'silhouette':
      return [
        'Open `<name>.dxf` in Silhouette Studio. Units: millimetres.',
        ...(score ? ['Set the SCORE layer to a light pass or the scoring tool.'] : []),
        ...(mat ? [MAT_NOTE] : []),
      ];
    case 'other':
      return [
        score
          ? 'Cut the inner sheet and the jacket from your files; the cut and score layers are separated.'
          : 'Cut the inner sheet and the jacket from your files; the fold perforations are on the cut layer.',
      ];
    case 'print':
      return [
        'Print `<name>-print.pdf` at 100%. Check the 50 mm square.',
        'Cut solid lines with a craft knife. Score dashed lines with a dry pen and a ruler.',
      ];
  }
}
