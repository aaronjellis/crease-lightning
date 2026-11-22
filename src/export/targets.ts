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
  /** Machine steps for the how-to PDF. `<name>` stands for the file name slug; backticks mark file names. */
  steps: string[];
}

const CREASE = 'Crease every score with the edge of a credit card.';

const SVGS: TargetFile[] = ['inner-svg', 'jacket-svg', 'both-svg'];

/** The spec's "Fold lines by machine" table. */
export const TARGETS: Record<TargetId, Target> = {
  cricut: { id: 'cricut', label: 'Cricut', kind: 'blade', fold: 'score', palette: 'paper', files: [...SVGS, 'howto-pdf', 'json'], steps: ['Upload `<name>-both.svg` in Design Space.', 'Select the Score layer and change Operation to Score.', 'Select all and click Attach.', 'Click Make it. A5 cards need a 12 × 24 in mat.', CREASE] },
  'xtool-c1': { id: 'xtool-c1', label: 'xTool C1', kind: 'blade', fold: 'score', palette: 'paper', files: [...SVGS, 'howto-pdf', 'json'], steps: ["Open `<name>-both.svg` in xTool's software.", 'Set the Score layer to Score and the Cut layer to Cut.', 'Cut the inner sheet and the jacket on their own card colours.', CREASE] },
  'xtool-laser': { id: 'xtool-laser', label: 'xTool laser', kind: 'laser', fold: 'perforate', palette: 'atomm', files: [...SVGS, 'howto-pdf', 'json'], steps: ['Open the SVGs in xTool Studio. Red lines cut, including the short fold perforations.', 'Run a test cut on scrap card first.', CREASE] },
  silhouette: { id: 'silhouette', label: 'Silhouette', kind: 'blade', fold: 'score', palette: 'paper', files: [...SVGS, 'dxf', 'howto-pdf', 'json'], steps: ['Open `<name>.dxf` in Silhouette Studio.', 'Set the SCORE layer to a light pass or the scoring tool.', CREASE] },
  other: { id: 'other', label: 'Other cutter', kind: 'blade', fold: 'score', palette: 'paper', files: [...SVGS, 'dxf', 'howto-pdf', 'json'], steps: [CREASE] },
  print: { id: 'print', label: 'Print and cut by hand', kind: 'print', fold: 'score', palette: 'paper', files: ['print-pdf', 'howto-pdf', 'json'], steps: ['Print `<name>-print.pdf` at 100%. Check the 50 mm square.', 'Cut solid lines with a craft knife. Score dashed lines with a dry pen and a ruler.', CREASE] },
};
