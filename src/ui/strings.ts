/** Every word the UI shows, in one place. Google developer documentation style, sentence case. */
import type { CheckResult } from '../core/checks';
import type { CardSize, FoldStyle, Spacing } from '../core/model';

export const APP_NAME = 'Crease Lightning';
export const APP_TAGLINE = 'Pop-up card maker';

export const LINK_ERROR = "That link couldn't be opened.";
export const FILE_ERROR: Record<'not-json' | 'not-a-card' | 'newer-version', string> = {
  'not-json': "That file couldn't be opened. It isn't a Crease Lightning card.",
  'not-a-card': "That file couldn't be opened. It isn't a Crease Lightning card.",
  'newer-version': "That file couldn't be opened. It was saved by a newer version of Crease Lightning.",
};
export const NO_3D = "3D preview isn't available in this browser.";
export const LOADING_FONTS = 'Loading the font…';
export const PLACEHOLDER_PREVIEW = "Showing the theme's words until you type yours.";
export const DISMISS = 'Dismiss';
export const FONTS_ERROR = "The fonts couldn't load. Check your connection and reload the page.";
export const BUILD_ERROR = 'Something went wrong drawing this card. Try a different message or size.';

export const ACTIONS = {
  save: 'Save',
  saveLabel: 'Save the design as a file',
  open: 'Open',
  openLabel: 'Open a saved design file',
  copyLink: 'Copy link',
  copied: 'Link copied.',
  copyFallback: "Your browser blocked copying. Select the link and copy it yourself.",
  linkField: 'Link to this card',
  export: 'Export',
  surprise: 'Surprise me',
};

export const THEMES_HEADING = 'Theme';

export const TABS = { threeD: '3D', flat: 'Flat' };

export const VIEW = {
  angle: 'Open angle',
  open: 'Open',
  close: 'Close',
  foldIt: 'Fold it',
  foldDone: 'Done',
  stepBack: 'Previous step',
  stepNext: 'Next step',
  stepOf: (i: number, n: number) => `Step ${i} of ${n}`,
  sceneLabel: '3D preview of the card. Drag to turn it.',
};

export const FLAT = {
  inner: 'Inner sheet',
  jacket: 'Jacket',
  cut: 'Cut',
  mountain: 'Mountain fold',
  valley: 'Valley fold',
  perforated: 'Perforated fold',
  showThrough: 'Jacket shows through',
  label: (what: string, w: number, h: number) => `${what}, ${Math.round(w)} × ${Math.round(h)} mm`,
  editHint: 'Drag an illustration to move it. Select one, then use the arrow keys to move it, + and − to resize it, or Delete to remove it.',
  resize: 'Resize illustration',
};

export const MESSAGE = {
  title: 'Message',
  line1: 'Line 1',
  line2: 'Line 2',
  optional: 'optional',
  autoSplit: 'Split a long line onto two lines',
  allCaps: 'All caps',
};

export const CARD = {
  title: 'Card',
  size: 'Size',
  colours: 'Colours',
  inner: 'Inner sheet',
  jacket: 'Jacket',
};

/** Tile name, closed size in mm, and in inches (the spec's card size table). */
export const SIZE_TILES: Record<CardSize, { name: string; mm: string; inches: string }> = {
  '5x7': { name: '5 × 7', mm: '127 × 178 mm', inches: '5 × 7 in' },
  a2: { name: 'A2', mm: '108 × 140 mm', inches: '4.25 × 5.5 in' },
  a6: { name: 'A6', mm: '105 × 148 mm', inches: '4.1 × 5.8 in' },
  a5: { name: 'A5', mm: '148 × 210 mm', inches: '5.8 × 8.3 in' },
};

export const FONT = {
  title: 'Font',
  spacing: 'Letter spacing',
  fellBack: (family: string) => `${family} didn't load, so the card uses Arvo.`,
};

export const SPACING: Record<Spacing, string> = { tight: 'Tight', normal: 'Normal', loose: 'Loose' };

export const DECORATIONS = {
  title: 'Decorations',
  style: 'Style', none: 'None', custom: (name: string) => `${name} (custom)`, customLabel: 'Custom',
  border: 'Border', borderPattern: 'Pattern',
  items: 'Illustrations', add: 'Add', addTitle: 'Add an illustration',
  addFull: (max: number) => `A card holds up to ${max} illustrations. Remove one to add another.`,
  shuffle: 'Shuffle', unpinAll: 'Unpin all', undo: 'Undo',
  size: 'Size', remove: (name: string) => `Remove ${name}`,
  empty: 'No illustrations. Add one, or pick a style.',
  find: 'Find',
  everyday: 'Everyday',
  noMatch: 'No illustrations match.',
};

export const CHECKS = {
  title: 'Checks',
  fixes: 'What we changed',
  undo: 'Undo',
  undoLabel: (message: string) => `Undo: ${message}`,
  restore: 'Restore',
  restoreLabel: 'Restore the fix you undid',
  useFont: (family: string) => `Use ${family}`,
  undoneFix: (id: string) => `You undid fix ${id}.`,
  pending: 'Checking stroke widths…',
  notRun: "Stroke widths weren't checked. Change the card to try again.",
  ready: 'Ready to export.',
  readyWithWarning: 'Ready to export, but some strokes may tear.',
  notReady: 'Not ready to export yet.',
};

export const CHECK_NAMES: Record<CheckResult['id'], { ok: string; fail: string }> = {
  closed: { ok: 'Closes flat', fail: "Doesn't close flat" },
  'one-piece': { ok: 'Cuts as one piece', fail: 'A piece would fall out' },
  layout: { ok: 'Cuts keep their spacing', fail: 'Some cuts are too close' },
  stroke: { ok: 'Strokes are thick enough', fail: 'Some strokes are too thin' },
  'front-view': { ok: "Line 2 doesn't hide line 1", fail: 'Line 2 hides part of line 1' },
};

export const ADVANCED = {
  title: 'Advanced',
  intro: 'Leave a size empty to let the card choose it.',
  lineDims: (n: 1 | 2) => `Line ${n} step`,
  depth: 'Depth (d)',
  height: 'Height (h)',
  letters: 'Letters (s)',
  overhang: 'Jacket overhang',
  rails: 'Rails',
  clearance: 'Clearance',
  foldStyle: 'Fold lines',
  spine: 'Spine',
  mm: 'mm',
  auto: 'auto',
};

export const FOLD_STYLE: Record<FoldStyle, string> = { auto: 'Machine default', score: 'Score', perforate: 'Perforate' };
export const SPINE = { long: 'Long side', short: 'Short side' };

export const EXPORT = {
  title: 'Export',
  intro: 'Pick the machine you cut with. You get one zip with everything it needs.',
  close: 'Close',
  download: 'Download',
  working: 'Preparing your files…',
  rendering: 'Drawing the folding steps…',
  done: (file: string) => `Downloaded ${file}.`,
  failed: "Something went wrong and the files weren't made. Try again.",
  blocked: 'Fix these before you export:',
  stepsHeading: (label: string) => `Cut it: ${label}`,
  notExportable: 'Fix the problems in Checks to export.',
};
