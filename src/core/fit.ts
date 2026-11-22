/**
 * Layout fit: how a typed message becomes pop-up steps. Decides one or two lines, each step's depth
 * d, height h and letter height s, where strips sit along the spine, and where the theme's accents
 * go, all inside the constraints that make the card close flat (see the spec's "Why the folds work").
 * u runs across the card from the spine, y along it; every size is mm.
 */
import { bounds, union } from '@kerfuffle/engine/geom';
import type { TextFont } from '@kerfuffle/engine/hbFont';
import {
  FRONT_GAP_MM,
  MARGIN_MM,
  MIN_STROKE_BLADE_MM,
  MIN_STROKE_LASER_MM,
  PLINTH_MIN_MM,
  RAIL_MM,
  STRONG_CAP_MM,
  WARN_CAP_MM,
  WEB_MM,
} from './constants';
import {
  accentsHiddenNote,
  line2DroppedNote,
  bridgeFix,
  clearFix,
  droppedNote,
  fitFix,
  fontFix,
  fontMissingNote,
  oneWordNote,
  railFix,
  smallNote,
  thinNote,
  undone,
  type Fix,
  type Note,
} from './fixes';
import { FALLBACK_FAMILY, type FontSet } from './fonts';
import { cardDims, type Params, type Spacing, type StepDims } from './model';
import { definedDims, pipeSplit, splitBalanced, tidy } from './lines';
import { accentSpace, MIN_H_MM, placeOneLine, placeTwoLines, sizeAccent, type AccentPlan } from './place';
import { buildBlock, measureLine, normaliseText, thinArea, type Block } from './text';
import type { StepSpec } from './types';
import { iconById, type Theme } from '../themes';

export type { Fix, Note } from './fixes';
export { splitBalanced } from './lines';

export interface Layout {
  steps: StepSpec[];
  /** Keyed by step id: `l1`, `l2`, `a1`, `a2`. */
  blocks: Record<string, Block>;
  lines: string[];
  fixes: Fix[];
  notes: Note[];
}

export interface FitOptions {
  /** Run the stroke check (`thinArea`, 70 to 450 ms a line). The UI turns it off per keystroke. */
  strokeCheck?: boolean;
}

/** The size table is for W = 127; other cards scale d and h by W / 127. */
const REF_W_MM = 127;
/** No line is fitted below this cap height, so no size is ever zero or negative. */
export const CAP_FLOOR_MM = 3;
/** Area a stroke check may lose before it counts as thin. */
const THIN_AREA_MM2 = 0.05;
const EPS = 1e-9;

type Metrics = ReturnType<typeof measureLine>;
type LineId = 'l1' | 'l2';

interface Line {
  id: LineId;
  text: string;
  font: TextFont;
}

interface Dims {
  d: number;
  h: number;
  /** A requested s (Advanced), as an upper bound. */
  s?: number;
  /** False when the user kept dims that reach past the card (fit undone): s ignores the reach limit. */
  reach: boolean;
}

/** s for a cap height: plinth (at least 3 mm, deeper for descenders) plus the ink above the baseline. */
const sAt = (m: Metrics, cap: number): number => Math.max(PLINTH_MIN_MM, m.descPerCap * cap) + m.topPerCap * cap;

/** The largest cap height whose s fits under `sMax`. */
const capFromHeight = (m: Metrics, sMax: number): number =>
  m.topPerCap > 0 ? Math.min((sMax - PLINTH_MIN_MM) / m.topPerCap, sMax / (m.descPerCap + m.topPerCap)) : Infinity;


/** Where a block's window starts along the spine: every window is centred on its strip. */
export function windowY0(step: StepSpec, block: Block): number {
  return (step.y0 + step.y1) / 2 - (bounds(block.window)?.w ?? 0) / 2;
}

export function fitLayout(p: Params, fonts: FontSet, theme: Theme, target: 'blade' | 'laser', opts: FitOptions = {}): Layout {
  const { W, L } = cardDims(p);
  const k = W / REF_W_MM;
  const c = Math.max(0, p.advanced.clearanceMm);
  const sp: Spacing = p.spacing;
  const fixes: Fix[] = [];
  const notes: Note[] = [];
  const ov = (id: string) => p.overrides[id] === true;

  const cache = new Map<TextFont, Map<string, Metrics>>();
  const measure = (text: string, font: TextFont, capMm?: number): Metrics => {
    let byFont = cache.get(font);
    if (!byFont) cache.set(font, (byFont = new Map()));
    const key = `${capMm ?? ''}|${text}`;
    let m = byFont.get(key);
    if (!m) byFont.set(key, (m = measureLine(text, font, sp, capMm)));
    return m;
  };

  /**
   * The largest cap whose ink fits `avail`. Tight tracking's overlap is fixed in mm, so the width per
   * cap changes with size: iterate on the measurement, then shrink until the measured line fits.
   */
  const capFromWidth = (text: string, font: TextFont, avail: number): number => {
    if (avail <= 0) return 0;
    let cap = avail / measure(text, font).inkWPerCap;
    if (!Number.isFinite(cap)) return Infinity;
    for (let i = 0; i < 2; i++) cap = avail / measure(text, font, cap).inkWPerCap;
    for (let i = 0; i < 8; i++) {
      const w = measure(text, font, cap).inkWPerCap * cap;
      if (w <= avail) break;
      cap *= (avail / w) * 0.998;
    }
    return cap;
  };

  // 1. Normalise the text.
  const loaded = fonts.get(p.font);
  const font: TextFont = loaded ?? fonts.fallback;
  if (!loaded && p.font !== FALLBACK_FAMILY) notes.push(fontMissingNote(p.font, FALLBACK_FAMILY));
  const [raw1, raw2] = pipeSplit(p.line1, p.line2);
  const n1 = normaliseText(raw1, p.allCaps, font, fonts.fallback);
  const n2 = normaliseText(raw2, p.allCaps, font, fonts.fallback);
  const dropped = [...new Set([...n1.dropped, ...n2.dropped])];
  if (dropped.length) notes.push(droppedNote(dropped));
  let [t1, t2] = [tidy(n1.text), tidy(n2.text)];
  if (!t1) [t1, t2] = [t2, ''];
  const empty = (): Layout => ({ steps: [], blocks: {}, lines: [], fixes, notes });
  if (!t1) return empty();

  const needsFallback = (t: string) => font !== fonts.fallback && normaliseText(t, false, font, fonts.fallback).needsFallback;
  const railFor = (id: string): number => {
    const user = p.advanced.railMm;
    if (user >= RAIL_MM) return user;
    if (ov(`rail:${id}`)) {
      notes.push(undone(`rail:${id}`));
      return user;
    }
    fixes.push(railFix(id));
    return RAIL_MM;
  };
  const railPeek = (id: string) => (p.advanced.railMm >= RAIL_MM || ov(`rail:${id}`) ? p.advanced.railMm : RAIL_MM);

  // 2. Decide the lines: line 2 if filled, else split when one line would fall under the warning size.
  let texts = t2 ? [t1, t2] : [t1];
  if (!t2) {
    const mf = needsFallback(t1) && !ov('font:l1') ? fonts.fallback : font;
    const m = measure(t1, mf);
    const one = { d: 40 * k, h: 35 * k, ...definedDims(p.advanced.line1) };
    const sOne = Math.min(one.d - c - WEB_MM, W - MARGIN_MM - one.d - one.h, one.s ?? Infinity);
    const capOne = Math.min(capFromWidth(t1, mf, L - 2 * MARGIN_MM - 2 * railPeek('l1') - 2 * c), capFromHeight(m, sOne));
    if (capOne < WARN_CAP_MM && p.autoSplit) {
      const split = splitBalanced(t1, (t) => measure(t, mf).inkWPerCap);
      if (split) texts = split;
      else notes.push(oneWordNote(t1));
    }
  }

  // Each line's font: the fallback for a character only it draws, unless that fix was undone.
  const lines: Line[] = [];
  texts.forEach((text, i) => {
    const id: LineId = i === 0 ? 'l1' : 'l2';
    if (!needsFallback(text)) return void lines.push({ id, text, font });
    if (!ov(`font:${id}`)) {
      fixes.push(fontFix(id, p.font, FALLBACK_FAMILY));
      return void lines.push({ id, text, font: fonts.fallback });
    }
    const kept = normaliseText(text, false, font, font);
    notes.push(undone(`font:${id}`, kept.dropped.join(' ')));
    if (tidy(kept.text)) lines.push({ id: lines.length ? 'l2' : 'l1', text: tidy(kept.text), font });
  });
  if (!lines.length) return empty();

  // Rails: under 5 mm they widen to 5 mm; wide ones narrow to 5 mm when a line can't reach the floor
  // cap between them. If line 2 still can't, it is left out with a strong note.
  let rail1 = railFor('l1');
  let rail2 = lines.length === 2 ? railFor('l2') : 0;
  const floorInk = (line: Line) => measure(line.text, line.font, CAP_FLOOR_MM).inkWPerCap * CAP_FLOOR_MM;
  const room1 = () => L - 2 * MARGIN_MM - 2 * rail1 - 2 * c;
  const room2 = () => room1() - 2 * rail2;
  // Narrowing happens only when the line can't reach the floor cap otherwise, so undoing it can't be
  // honoured: the rails still narrow, with a warning in place of the fix.
  const narrow = (id: LineId, rail: number): number => {
    if (rail <= RAIL_MM) return rail;
    if (ov(`rail:${id}`)) notes.push(undone(`rail:${id}`, 'narrow'));
    else fixes.push(railFix(id, 'narrow'));
    return RAIL_MM;
  };
  if (room1() < floorInk(lines[0])) rail1 = narrow('l1', rail1);
  if (lines.length === 2 && room2() < floorInk(lines[1])) {
    rail2 = narrow('l2', rail2);
    if (room2() < floorInk(lines[1])) rail1 = narrow('l1', rail1);
    if (room2() < floorInk(lines[1])) {
      lines.pop();
      rail2 = 0;
      notes.push(line2DroppedNote());
      for (let i = fixes.length - 1; i >= 0; i--) if (fixes[i].id.endsWith(':l2')) fixes.splice(i, 1);
    }
  }
  const two = lines.length === 2;
  const [L1, L2] = lines;

  // 3. Step dims: the size table scaled by W / 127, Advanced on top, then the fit fixes.
  const accRail = Math.max(RAIL_MM, two ? rail2 : rail1);
  const avail1 = L - 2 * MARGIN_MM - 2 * rail1 - 2 * c;
  const avail2 = L - 2 * MARGIN_MM - 2 * rail1 - 2 * rail2 - 2 * c;
  const m1 = measure(L1.text, L1.font);
  const capW1 = capFromWidth(L1.text, L1.font, avail1);
  const m2 = two ? measure(L2.text, L2.font) : null;
  const capW2 = two ? capFromWidth(L2.text, L2.font, avail2) : 0;
  const sFloor2 = m2 ? sAt(m2, CAP_FLOOR_MM) : 0;
  const sKeep = (m: Metrics, capW: number) => Math.max(sAt(m, CAP_FLOOR_MM), sAt(m, Math.min(capW, WARN_CAP_MM)));

  /**
   * A step that pokes out of the closed card shrinks s (down to what the text needs at the smaller of
   * its width-limited size and 9 mm), then h, then d. Degenerate saved dims are clamped first. Both
   * count as `fit:<id>`; undone, the user's dims stay (clamped only to sane minima) with a warning.
   */
  const fitDims = (id: LineId, user: StepDims | undefined, def: { d: number; h: number }, sigma: number, m: Metrics, capW: number, child?: { hMin: number; dMax: number }): Dims => {
    const sFloor = sAt(m, CAP_FLOOR_MM);
    const dMin = c + WEB_MM + sFloor;
    const hMin = Math.max(MIN_H_MM, child?.hMin ?? 0);
    const ask = { d: def.d, h: def.h, ...definedDims(user) };
    const sane = { d: Math.max(ask.d, c + WEB_MM + 1), h: Math.max(ask.h, MIN_H_MM), s: ask.s === undefined ? undefined : Math.max(ask.s, sFloor) };
    let { d, h, s } = { d: Math.max(sane.d, dMin), h: Math.max(sane.h, hMin), s: sane.s };
    let changed = d !== ask.d || h !== ask.h || s !== ask.s;
    if (s !== undefined && s > d - c - WEB_MM) [s, changed] = [d - c - WEB_MM, true];
    if (child && d > child.dMax) {
      // The child needs room in front of this step's hinge A: only a shallower d makes it.
      const dd = Math.max(dMin, child.dMax);
      if (dd < d) [d, changed] = [dd, true];
    }
    const sNat = Math.min(s ?? sAt(m, capW), d - c - WEB_MM);
    let over = d + h + sNat - (W - MARGIN_MM - sigma);
    if (over > EPS) {
      changed = true;
      let sEff = sNat;
      const take = (have: number) => {
        const t = Math.min(over, Math.max(0, have));
        over -= t;
        return t;
      };
      sEff -= take(sNat - Math.min(sNat, sKeep(m, capW)));
      h -= take(h - hMin);
      d -= take(d - dMin);
      if (over > 0) sEff -= over;
      if (s !== undefined) s = Math.min(s, sEff);
    }
    if (!changed) return { d, h, s, reach: true };
    if (ov(`fit:${id}`)) {
      notes.push(undone(`fit:${id}`));
      return { ...sane, reach: false };
    }
    fixes.push(fitFix(id));
    return { d, h, s, reach: true };
  };

  const dims1 = fitDims(
    'l1',
    p.advanced.line1,
    two ? { d: 30 * k, h: 45 * k } : { d: 40 * k, h: 35 * k },
    0,
    m1,
    capW1,
    two && m2 ? { hMin: MIN_H_MM + FRONT_GAP_MM + sFloor2, dMax: W - MARGIN_MM - (c + WEB_MM + sFloor2) - MIN_H_MM - sFloor2 } : undefined
  );
  let dims2: Dims | null = two && m2 ? fitDims('l2', p.advanced.line2, { d: 25 * k, h: 12 * k }, dims1.d, m2, capW2) : null;

  // Line 2 must clear line 1 in front view: grow h₁, then lower h₂ (`clear:l2`).
  let front2 = true;
  if (dims2 && m2) {
    const keep2 = sKeep(m2, capW2);
    const need = (h2: number) => h2 + Math.max(WEB_MM, FRONT_GAP_MM + keep2);
    if (dims1.h < need(dims2.h) - EPS) {
      if (ov('clear:l2')) {
        notes.push(undone('clear:l2'));
        front2 = false;
        // The child's back hinge must still sit on line 1's riser.
        dims2 = { ...dims2, h: Math.max(MIN_H_MM, Math.min(dims2.h, dims1.h - WEB_MM)) };
      } else {
        let changed = false;
        const h1Max = W - MARGIN_MM - dims1.d - sKeep(m1, capW1);
        const grown = Math.min(need(dims2.h), Math.max(dims1.h, h1Max));
        if (grown > dims1.h + EPS) [dims1.h, changed] = [grown, true];
        if (dims1.h < need(dims2.h) - EPS) {
          const h2 = Math.max(MIN_H_MM, dims1.h - Math.max(WEB_MM, FRONT_GAP_MM + keep2));
          if (h2 < dims2.h - EPS) [dims2.h, changed] = [h2, true];
        }
        if (changed) fixes.push(clearFix());
      }
    }
  }

  // 4. Accents, children on line 1's hinge A.
  let accents: AccentPlan[] = [];
  if (p.accents && theme.accents.length === 2) {
    const room = { k, W, d1: dims1.d, h1: dims1.h, c, rail: accRail };
    /**
     * Whether a pair fits at all, and whether it costs line 2 size: in two-line mode it does when
     * line 2 would come out smaller than without accents and under the warning size.
     */
    const judge = (smallest: boolean) => {
      const plans = theme.accents.map((icon, i) => sizeAccent(i === 0 ? 'a1' : 'a2', iconById(icon), room, smallest));
      if (!plans.every((a) => a !== null)) return { plans: null, costsText: false };
      const ws = plans.map((a) => a!.stripW);
      if (!two) return { plans: ws[0] + ws[1] + WEB_MM <= L - 2 * MARGIN_MM - 2 * rail1 ? (plans as AccentPlan[]) : null, costsText: false };
      const left = avail2 - accentSpace(ws);
      if (left <= 0) return { plans: null, costsText: false };
      const capH2 = capFromHeight(m2!, sLimit2());
      const withAcc = Math.min(capH2, capFromWidth(L2.text, L2.font, left));
      return { plans: plans as AccentPlan[], costsText: withAcc < Math.min(capH2, capW2) - 1e-6 && withAcc < WARN_CAP_MM };
    };
    let pick = judge(false);
    // Icons at their preferred size crowd line 2: try them at their minimum height first.
    if (two && (!pick.plans || pick.costsText)) {
      const small = judge(true);
      if (small.plans && (!small.costsText || !pick.plans)) pick = small;
    }
    // Accents are decoration (ruling R10): when they don't fit, they hide with an info note, not a fix.
    if (pick.plans && !pick.costsText) accents = pick.plans;
    else notes.push(accentsHiddenNote());
  }

  // 5 and 6. Each line's cap: the smaller of the cap from height and the cap from width.
  function sLimit1(): number {
    return Math.min(dims1.d - c - WEB_MM, dims1.reach ? W - MARGIN_MM - dims1.d - dims1.h : Infinity, dims1.s ?? Infinity);
  }
  function sLimit2(): number {
    const d2 = dims2!;
    return Math.min(
      d2.d - c - WEB_MM,
      d2.reach ? W - MARGIN_MM - dims1.d - d2.d - d2.h : Infinity,
      front2 ? dims1.h - d2.h - FRONT_GAP_MM : Infinity,
      d2.s ?? Infinity
    );
  }
  const solve = (line: Line, m: Metrics, sMax: number, avail: number, capW: number): Block => {
    // Never under the 3 mm floor, so never zero or negative. The one exception is a positive cap from
    // width: a line too long for the card even at 3 mm (rails already narrowed) would run off its ends.
    const lowest = capW > 0 && capW < CAP_FLOOR_MM ? capW : CAP_FLOOR_MM;
    let cap = Math.max(lowest, Math.min(capFromHeight(m, sMax), capW));
    if (!Number.isFinite(cap)) cap = lowest;
    let block = buildBlock(line.text, line.font, cap, sp, c);
    for (let i = 0; i < 3; i++) {
      const wide = block.inkW > avail + 1e-9;
      const tall = block.s > sMax + 1e-9;
      if (!wide && !tall) break;
      const ratio = Math.min(wide ? avail / block.inkW : 1, tall ? sMax / block.s : 1) * 0.999;
      // A non-positive ratio (no room at all) or a cap already at the floor can't shrink further.
      const next = ratio > 0 ? Math.max(lowest, cap * ratio) : cap;
      if (!(next < cap)) break;
      cap = next;
      block = buildBlock(line.text, line.font, cap, sp, c);
    }
    return block;
  };

  const blocks: Record<string, Block> = {};
  blocks.l1 = solve(L1, m1, sLimit1(), avail1, capW1);
  if (two && dims2) {
    const left = avail2 - accentSpace(accents.map((a) => a.stripW));
    blocks.l2 = solve(L2, m2!, sLimit2(), left, accents.length ? capFromWidth(L2.text, L2.font, left) : capW2);
  }

  // 7. Strips along the spine, centred on L / 2.
  const window1 = blocks.l1.inkW + 2 * c;
  const accentWs = accents.map((a) => a.stripW);
  const steps: StepSpec[] = [];
  let accentSpans: { y0: number; y1: number }[];
  if (two && dims2) {
    const strip2 = blocks.l2.inkW + 2 * c + 2 * rail2;
    const placed = placeTwoLines(L, window1, rail1, strip2, accentWs);
    steps.push({ id: 'l1', role: 'line1', parentId: null, ...placed.root, d: dims1.d, h: dims1.h, s: blocks.l1.s });
    steps.push({ id: 'l2', role: 'line2', parentId: 'l1', ...placed.l2, d: dims2.d, h: dims2.h, s: blocks.l2.s });
    accentSpans = placed.accents;
  } else {
    const placed = placeOneLine(L, window1, rail1, accentWs);
    steps.push({ id: 'l1', role: 'line1', parentId: null, ...placed.root, d: dims1.d, h: dims1.h, s: blocks.l1.s });
    accentSpans = placed.accents;
  }
  // 8. Accents.
  accents.forEach((a, i) => {
    blocks[a.id] = a.block;
    steps.push({ id: a.id, role: 'accent', parentId: 'l1', ...accentSpans[i], d: a.d, h: a.h, s: a.block.s });
  });

  // 9. Bridges, cap-height notes and the stroke check.
  let n = 0;
  for (const line of lines) {
    for (let i = 0; i < blocks[line.id].bridgeBars.length; i++) {
      n++;
      if (ov(`bridge:${n}`)) notes.push(undone(`bridge:${n}`));
      else fixes.push(bridgeFix(n, line.id));
    }
  }
  // Any text cap under 7 mm (or not a finite number) carries the strong note.
  const caps = lines.map((l) => blocks[l.id].capMm);
  if (caps.some((x) => !(x >= STRONG_CAP_MM))) notes.push(smallNote('strong'));
  else if (caps.some((x) => x < WARN_CAP_MM)) notes.push(smallNote('warn'));
  if (opts.strokeCheck ?? true) {
    const minStroke = target === 'laser' ? MIN_STROKE_LASER_MM : MIN_STROKE_BLADE_MM;
    for (const line of lines) {
      const b = blocks[line.id];
      if (thinArea(union([b.letters, b.plinth]), minStroke, { stopAbove: THIN_AREA_MM2 }) > THIN_AREA_MM2) notes.push(thinNote(line.id, minStroke));
    }
  }

  const seen = new Set<string>();
  const uniqueNotes = notes.filter((x) => !seen.has(x.message) && seen.add(x.message));
  return { steps, blocks, lines: lines.map((l) => l.text), fixes, notes: uniqueNotes };
}
