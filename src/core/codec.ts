import { THEME_IDS, type FoldStyle, type Params, type Spacing, type StepDims } from './model';

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

/** Validates every field, clamps numbers to their ranges, drops unknown fields. Null if invalid. */
export function migrate(raw: unknown): Params | null {
  if (!isObj(raw) || raw.version !== 1) return null;
  const { theme, line1, line2, font, spacing, size, spine } = raw;
  if (typeof theme !== 'string' || !(THEME_IDS as readonly string[]).includes(theme)) return null;
  if (typeof line1 !== 'string' || typeof line2 !== 'string' || typeof font !== 'string') return null;
  if (!SPACINGS.includes(spacing as Spacing)) return null;
  if (!(SIZES as readonly unknown[]).includes(size)) return null;
  if (spine !== 'long' && spine !== 'short') return null;
  for (const k of ['autoSplit', 'allCaps', 'accents', 'motifs'] as const) {
    if (typeof raw[k] !== 'boolean') return null;
  }
  const c = raw.colours;
  if (!isObj(c) || typeof c.inner !== 'string' || typeof c.jacket !== 'string') return null;
  if (!HEX.test(c.inner) || !HEX.test(c.jacket)) return null;
  const a = raw.advanced;
  if (!isObj(a)) return null;
  const overhangMm = num(a.overhangMm, 0, 6);
  const railMm = num(a.railMm, 0, 20);
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
  return {
    version: 1,
    theme: theme as Params['theme'],
    line1,
    line2,
    autoSplit: raw.autoSplit as boolean,
    allCaps: raw.allCaps as boolean,
    font,
    spacing: spacing as Spacing,
    size: size as Params['size'],
    spine,
    colours: { inner: c.inner, jacket: c.jacket },
    accents: raw.accents as boolean,
    motifs: raw.motifs as boolean,
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
  if (isObj(raw) && typeof raw.version === 'number' && raw.version > 1) {
    return { ok: false, error: 'newer-version' };
  }
  const params = migrate(raw);
  return params ? { ok: true, params } : { ok: false, error: 'not-a-card' };
}
