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
  /** Machine steps for the how-to PDF; Task 11 fills these in. */
  steps: string[];
}

const SVGS: TargetFile[] = ['inner-svg', 'jacket-svg', 'both-svg'];

/** The spec's "Fold lines by machine" table. */
export const TARGETS: Record<TargetId, Target> = {
  cricut: { id: 'cricut', label: 'Cricut', kind: 'blade', fold: 'score', palette: 'paper', files: [...SVGS, 'howto-pdf', 'json'], steps: [] },
  'xtool-c1': { id: 'xtool-c1', label: 'xTool C1', kind: 'blade', fold: 'score', palette: 'paper', files: [...SVGS, 'howto-pdf', 'json'], steps: [] },
  'xtool-laser': { id: 'xtool-laser', label: 'xTool laser', kind: 'laser', fold: 'perforate', palette: 'atomm', files: [...SVGS, 'howto-pdf', 'json'], steps: [] },
  silhouette: { id: 'silhouette', label: 'Silhouette', kind: 'blade', fold: 'score', palette: 'paper', files: [...SVGS, 'dxf', 'howto-pdf', 'json'], steps: [] },
  other: { id: 'other', label: 'Other cutter', kind: 'blade', fold: 'score', palette: 'paper', files: [...SVGS, 'dxf', 'howto-pdf', 'json'], steps: [] },
  print: { id: 'print', label: 'Print and cut by hand', kind: 'print', fold: 'score', palette: 'paper', files: ['print-pdf', 'howto-pdf', 'json'], steps: [] },
};
