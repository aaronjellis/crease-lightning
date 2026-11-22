import { CLEARANCE_MM, OVERHANG_DEFAULT_MM, RAIL_MM } from './constants';

export type CardSize = '5x7' | 'a2' | 'a6' | 'a5';
export type ThemeId =
  | 'birthday'
  | 'anniversary'
  | 'wedding'
  | 'graduation'
  | 'baby-girl'
  | 'baby-boy'
  | 'christmas'
  | 'new-year'
  | 'thank-you'
  | 'love'
  | 'blank';
export type Spacing = 'tight' | 'normal' | 'loose';
export type FoldStyle = 'auto' | 'score' | 'perforate';

export const THEME_IDS: readonly ThemeId[] = [
  'birthday', 'anniversary', 'wedding', 'graduation', 'baby-girl', 'baby-boy',
  'christmas', 'new-year', 'thank-you', 'love', 'blank',
];

export interface StepDims {
  d?: number;
  h?: number;
  s?: number;
}

export interface Params {
  version: 1;
  theme: ThemeId;
  line1: string;
  line2: string;
  autoSplit: boolean;
  allCaps: boolean;
  font: string;
  spacing: Spacing;
  size: CardSize;
  spine: 'long' | 'short';
  colours: { inner: string; jacket: string };
  accents: boolean;
  motifs: boolean;
  advanced: {
    line1?: StepDims;
    line2?: StepDims;
    overhangMm: number;
    railMm: number;
    clearanceMm: number;
    foldStyle: FoldStyle;
  };
  overrides: Record<string, true>;
}

/** The slice of a theme that the model needs. Task 5's `Theme` is a superset. */
export interface ThemeDefaults {
  id: ThemeId;
  lines: [string, string];
  font: string;
  colours: { inner: string; jacket: string };
}

/** Placeholder until Task 5 re-points this at the Birthday theme data. */
export const BIRTHDAY_DEFAULTS: ThemeDefaults = {
  id: 'birthday',
  lines: ['HAPPY BIRTHDAY', 'SAM'],
  font: 'Arvo',
  colours: { inner: '#ffffff', jacket: '#e8453c' },
};

export const CARD_SIZES: Record<CardSize, { closedW: number; closedL: number; label: string }> = {
  '5x7': { closedW: 127, closedL: 178, label: '5 × 7 in' },
  a2: { closedW: 108, closedL: 140, label: 'A2 (4.25 × 5.5 in)' },
  a6: { closedW: 105, closedL: 148, label: 'A6 (105 × 148 mm)' },
  a5: { closedW: 148, closedL: 210, label: 'A5 (148 × 210 mm)' },
};

/** Closed card width and length in mm; a short spine swaps them. */
export function cardDims(p: Params): { W: number; L: number } {
  const { closedW, closedL } = CARD_SIZES[p.size];
  return p.spine === 'short' ? { W: closedL, L: closedW } : { W: closedW, L: closedL };
}

export function defaultParams(locale: string): Params {
  const t = BIRTHDAY_DEFAULTS;
  return {
    version: 1,
    theme: t.id,
    line1: t.lines[0],
    line2: t.lines[1],
    autoSplit: true,
    allCaps: true,
    font: t.font,
    spacing: 'tight',
    size: locale === 'en-US' ? '5x7' : 'a6',
    spine: 'long',
    colours: { ...t.colours },
    accents: true,
    motifs: true,
    advanced: {
      overhangMm: OVERHANG_DEFAULT_MM,
      railMm: RAIL_MM,
      clearanceMm: CLEARANCE_MM,
      foldStyle: 'auto',
    },
    overrides: {},
  };
}

/**
 * Switch theme. A line is replaced only when untouched: it equals prev's default
 * line (prev is the current theme's defaults), so a cleared line stays empty.
 * Fixes are recomputed for the new geometry, so overrides clear.
 */
export function applyTheme(p: Params, next: ThemeDefaults, prev: ThemeDefaults): Params {
  return {
    ...p,
    theme: next.id,
    line1: p.line1 === prev.lines[0] ? next.lines[0] : p.line1,
    line2: p.line2 === prev.lines[1] ? next.lines[1] : p.line2,
    font: next.font,
    colours: { ...next.colours },
    overrides: {},
  };
}

/** Change size: keeps the text, clears per-line dims and fixes (both depend on geometry). */
export function withSize(p: Params, size: CardSize): Params {
  const { line1: _l1, line2: _l2, ...rest } = p.advanced;
  return { ...p, size, advanced: rest, overrides: {} };
}
