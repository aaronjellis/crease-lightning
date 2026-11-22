/**
 * The spec's random-message test (I5): seeded messages of letters, digits, punctuation and lowercase
 * with descenders, 20+ characters among them, at random sizes, spines and fonts, through `build()` with
 * the stroke check off. After the fit's own fixes no check fails, every fix is a known kind, and
 * every size is a finite, positive number.
 */
import { describe, expect, test } from 'vitest';
import { bounds } from '@kerfuffle/engine/geom';
import { build, type Card } from '../src/core/build';
import { applyTheme, BIRTHDAY_DEFAULTS, CARD_SIZES, defaultParams, type CardSize, type Params, type Spacing } from '../src/core/model';
import { THEMES } from '../src/themes';
import { testFonts } from './helpers/fonts';

const fonts = testFonts();
const P0 = defaultParams('en-US');
const FIX_KINDS = ['fit', 'clear', 'rail', 'bridge', 'font'];
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyzgjpqy';
const DIGITS = '0123456789';
const PUNCT = ".,!?'\"&-:;/#@()’—";
const SIZES = Object.keys(CARD_SIZES) as CardSize[];
const FONTS = ['Alfa Slab One', 'Arvo', 'Rokkitt'];
const SPACINGS: Spacing[] = ['tight', 'normal', 'loose'];

/** mulberry32: small, fast, and the same sequence on every machine. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function message(r: () => number, length: number): string {
  const pick = (s: string) => s[Math.floor(r() * s.length)];
  let out = '';
  for (let i = 0; i < length; i++) {
    const x = r();
    if (i > 0 && i < length - 1 && out[out.length - 1] !== ' ' && x < 0.14) out += ' ';
    else if (x < 0.5) out += pick(UPPER);
    else if (x < 0.75) out += pick(LOWER);
    else if (x < 0.87) out += pick(DIGITS);
    else out += pick(PUNCT);
  }
  return out;
}

function randomParams(r: () => number): Params {
  const theme = THEMES[Math.floor(r() * THEMES.length)];
  const base = applyTheme(P0, theme, BIRTHDAY_DEFAULTS);
  const long = r() < 0.4;
  // A 20+ character line 1 often, otherwise a short one; line 2 about half the time.
  const line1 = message(r, long ? 20 + Math.floor(r() * 12) : 3 + Math.floor(r() * 14));
  const line2 = r() < 0.5 ? message(r, 2 + Math.floor(r() * 12)) : '';
  return {
    ...base,
    line1,
    line2,
    allCaps: r() < 0.5,
    font: FONTS[Math.floor(r() * FONTS.length)],
    spacing: SPACINGS[Math.floor(r() * SPACINGS.length)],
    size: SIZES[Math.floor(r() * SIZES.length)],
    spine: r() < 0.5 ? 'long' : 'short',
    decor: r() < 0.7 ? base.decor : { ...base.decor, style: null, border: null, items: [] },
  };
}

const finitePositive = (v: number) => Number.isFinite(v) && v > 0;

function problems(card: Card): string[] {
  const out: string[] = [];
  for (const c of card.checks) if (!c.ok) out.push(`check ${c.id}: ${c.detail}`);
  for (const f of card.fixes) if (!FIX_KINDS.includes(f.id.split(':')[0])) out.push(`unknown fix ${f.id}`);
  for (const s of card.layout.steps) {
    for (const k of ['d', 'h', 's', 'y0', 'y1'] as const) if (!Number.isFinite(s[k])) out.push(`${s.id}.${k} = ${s[k]}`);
    for (const k of ['d', 'h', 's'] as const) if (!finitePositive(s[k])) out.push(`${s.id}.${k} = ${s[k]}`);
    if (!(s.y1 > s.y0)) out.push(`${s.id} strip ${s.y0}..${s.y1}`);
  }
  for (const [id, b] of Object.entries(card.layout.blocks)) {
    if (!finitePositive(b.capMm) || !finitePositive(b.s) || !Number.isFinite(b.inkW) || b.inkW < 0) {
      out.push(`block ${id}: cap ${b.capMm} s ${b.s} inkW ${b.inkW}`);
    }
  }
  for (const piece of [card.inner, card.jacket]) {
    if (!finitePositive(piece.widthMm) || !finitePositive(piece.heightMm)) out.push(`${piece.id} ${piece.widthMm} × ${piece.heightMm}`);
    const b = bounds(piece.outline);
    if (!b || !finitePositive(b.w) || !finitePositive(b.h)) out.push(`${piece.id} outline bounds ${JSON.stringify(b)}`);
  }
  if (!Number.isFinite(card.stats.cutMm) || !Number.isFinite(card.stats.scoreMm)) out.push(`stats ${JSON.stringify(card.stats)}`);
  return out;
}

describe('random messages (I5)', () => {
  // Small tests, so none blocks the worker for long (R21). Each batch has its own seed.
  const BATCHES = 12;
  const PER_BATCH = 5;
  for (let batch = 0; batch < BATCHES; batch++) {
    test(`batch ${batch + 1} (seed ${20261121 + batch}): no check fails after fixes`, () => {
      const r = rng(20261121 + batch);
      const bad: string[] = [];
      for (let i = 0; i < PER_BATCH; i++) {
        const p = randomParams(r);
        const card = build(p, { fonts }, 'blade', { strokeCheck: false });
        const found = problems(card);
        const label = `${p.theme} ${p.size} ${p.spine} ${p.font} ${p.spacing} caps=${p.allCaps} "${p.line1}" / "${p.line2}"`;
        if (found.length) bad.push(`${label}: ${found.join('; ')}`);
      }
      expect(bad).toEqual([]);
    }, 30_000);
  }
});
