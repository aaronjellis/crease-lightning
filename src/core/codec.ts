import { WEB_MM } from './constants';
import { decorFromStyle } from './decor/model';
import type { Decor, DecorItem } from './decor/types';
import { SLAB_FONTS } from './fonts';
import { THEME_IDS, type FoldStyle, type Params, type Spacing, type StepDims } from './model';
import { BORDERS, ICONS, themeById, type Theme } from '../themes';

/** The `Params` version this build writes. */
const VERSION = 2;
/** The most decoration items a card keeps. */
export const MAX_ITEMS = 40;
/** The largest decoration size, in mm. */
export const MAX_ITEM_MM = 60;

/** The message inputs' `maxlength` (UTF-16 units, as the browser counts). */
export const MAX_LINE_CHARS = 40;

/** A line cut to the input's limit, never through the middle of a surrogate pair. */
function capLine(line: string): string {
  if (line.length <= MAX_LINE_CHARS) return line;
  const cut = line.slice(0, MAX_LINE_CHARS);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

const SIZES = ['5x7', 'a2', 'a6', 'a5'] as const;
const SPACINGS: readonly Spacing[] = ['tight', 'normal', 'loose'];
const FOLDS: readonly FoldStyle[] = ['auto', 'score', 'perforate'];
const HEX = /^#[0-9a-fA-F]{6}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function num(v: unknown, lo: number, hi: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : null;
}

function stepDims(v: unknown): StepDims | undefined | null {
  if (v === undefined) return undefined;
  if (!isObj(v)) return null;
  const out: StepDims = {};
  for (const k of ['d', 'h', 's'] as const) {
    if (v[k] === undefined) continue;
    const n = num(v[k], 0, 500);
    if (n === null) return null;
    out[k] = n;
  }
  return out;
}

const ITEM_ID = /^[A-Za-z0-9_-]{1,16}$/;

/** A valid item, clamped, or null to drop it. */
function decorItem(v: unknown, seen: Set<string>): DecorItem | null {
  if (!isObj(v) || typeof v.id !== 'string' || !ITEM_ID.test(v.id) || seen.has(v.id)) return null;
  const icon = ICONS.find((i) => i.id === v.icon);
  if (!icon) return null;
  const lo = Math.min(icon.minHeightMm, MAX_ITEM_MM);
  const minMm = num(v.minMm, lo, MAX_ITEM_MM);
  const maxRaw = num(v.maxMm, lo, MAX_ITEM_MM);
  if (minMm === null || maxRaw === null) return null;
  const item: DecorItem = { id: v.id, icon: icon.id, minMm, maxMm: Math.max(minMm, maxRaw) };
  const sizeMm = num(v.sizeMm, lo, MAX_ITEM_MM);
  if (sizeMm !== null) item.sizeMm = sizeMm;
  const at = v.at;
  if (isObj(at) && (at.page === 'back' || at.page === 'base')) {
    const u = num(at.u, 0, 1);
    const w = num(at.v, 0, 1);
    if (u !== null && w !== null) item.at = { page: at.page, u, v: w };
  }
  seen.add(v.id);
  return item;
}

/**
 * A version 2 decor: an unknown style or border becomes null, items with unknown icons or bad fields
 * drop, at most {@link MAX_ITEMS} stay, sizes clamp to [icon minimum, {@link MAX_ITEM_MM}], pins clamp to
 * [0, 1], and the seed becomes a 32-bit unsigned integer. Null if the shape is wrong.
 */
function decorOf(v: unknown, theme: Theme): Decor | null {
  if (!isObj(v) || !Array.isArray(v.items)) return null;
  if (typeof v.seed !== 'number' || !Number.isFinite(v.seed)) return null;
  const style = typeof v.style === 'string' && theme.styles.some((s) => s.id === v.style) ? v.style : null;
  const border = typeof v.border === 'string' && BORDERS.some((b) => b.id === v.border) ? v.border : null;
  const items: DecorItem[] = [];
  const seen = new Set<string>();
  for (const it of v.items) {
    if (items.length >= MAX_ITEMS) break;
    const item = decorItem(it, seen);
    if (item) items.push(item);
  }
  return { style, border, seed: v.seed >>> 0, items };
}

/**
 * Validates every field, clamps numbers to their ranges, drops unknown fields. Null if invalid. Lines
 * longer than the inputs allow are cut to 40 characters, and an unknown font becomes the theme's.
 *
 * Version 1 upgrades: `accents` drops; `motifs: true` becomes the theme's first style with seed 1, and
 * `motifs: false` no style, border or items.
 */
export function migrate(raw: unknown): Params | null {
  if (!isObj(raw) || (raw.version !== 1 && raw.version !== VERSION)) return null;
  const { theme, line1, line2, font, spacing, size, spine } = raw;
  if (typeof theme !== 'string' || !(THEME_IDS as readonly string[]).includes(theme)) return null;
  if (typeof line1 !== 'string' || typeof line2 !== 'string' || typeof font !== 'string') return null;
  if (!SPACINGS.includes(spacing as Spacing)) return null;
  if (!(SIZES as readonly unknown[]).includes(size)) return null;
  if (spine !== 'long' && spine !== 'short') return null;
  for (const k of raw.version === 1 ? (['autoSplit', 'allCaps', 'accents', 'motifs'] as const) : (['autoSplit', 'allCaps'] as const)) {
    if (typeof raw[k] !== 'boolean') return null;
  }
  const c = raw.colours;
  if (!isObj(c) || typeof c.inner !== 'string' || typeof c.jacket !== 'string') return null;
  if (!HEX.test(c.inner) || !HEX.test(c.jacket)) return null;
  const a = raw.advanced;
  if (!isObj(a)) return null;
  const overhangMm = num(a.overhangMm, 0, 6);
  const railMm = num(a.railMm, WEB_MM, 20);
  const clearanceMm = num(a.clearanceMm, 0, 10);
  if (overhangMm === null || railMm === null || clearanceMm === null) return null;
  if (!FOLDS.includes(a.foldStyle as FoldStyle)) return null;
  const l1 = stepDims(a.line1);
  const l2 = stepDims(a.line2);
  if (l1 === null || l2 === null) return null;
  const ov = raw.overrides ?? {};
  if (!isObj(ov)) return null;
  const overrides: Record<string, true> = {};
  for (const [k, v] of Object.entries(ov)) if (v === true) overrides[k] = true;

  const advanced: Params['advanced'] = { overhangMm, railMm, clearanceMm, foldStyle: a.foldStyle as FoldStyle };
  if (l1) advanced.line1 = l1;
  if (l2) advanced.line2 = l2;
  const t = themeById(theme as Params['theme']);
  const decor = raw.version === 1 ? decorFromStyle(t, raw.motifs ? (t.styles[0]?.id ?? null) : null, 1) : decorOf(raw.decor, t);
  if (!decor) return null;
  // A link or file names its own font: only the families the app offers load; anything else is the theme's (M6).
  const knownFont = SLAB_FONTS.some((f) => f.family === font) ? font : t.font;
  return {
    version: VERSION,
    theme: theme as Params['theme'],
    line1: capLine(line1),
    line2: capLine(line2),
    autoSplit: raw.autoSplit as boolean,
    allCaps: raw.allCaps as boolean,
    font: knownFont,
    spacing: spacing as Spacing,
    size: size as Params['size'],
    spine,
    colours: { inner: c.inner, jacket: c.jacket },
    decor,
    advanced,
    overrides,
  };
}

function toBase64Url(text: string): string {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

export function encodeLink(p: Params): string {
  return '#d=' + toBase64Url(JSON.stringify(p));
}

export function decodeLink(hash: string): Params | null {
  const m = /^#?d=(.+)$/.exec(hash);
  if (!m) return null;
  try {
    return migrate(JSON.parse(fromBase64Url(m[1])));
  } catch {
    return null;
  }
}

export function saveJson(p: Params): string {
  return JSON.stringify(p, null, 2);
}

export type LoadResult =
  | { ok: true; params: Params }
  | { ok: false; error: 'not-json' | 'not-a-card' | 'newer-version' };

export function loadJson(text: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not-json' };
  }
  if (isObj(raw) && typeof raw.version === 'number' && raw.version > VERSION) {
    return { ok: false, error: 'newer-version' };
  }
  const params = migrate(raw);
  return params ? { ok: true, params } : { ok: false, error: 'not-a-card' };
}
