/**
 * A line of text as a pop-up block: letters welded per word, standing on a plinth along crease P,
 * inside a window cut from the tread. Block coordinates are mm: x along the spine from the window's
 * left edge, v up from P. Floating punctuation is bridged so the whole block cuts as one piece.
 */
import {
  buildTextOutline,
  capHeightPx,
  flattenCommands,
  mergeContours,
  TEXT_RENDER_SIZE_PX,
  type TextConfig,
  type TextFont,
} from '@kerfuffle/engine/textOutline';
import { area, bounds, difference, fromPaths64, grow, intersect, offset, union, type Poly, type Pt } from '@kerfuffle/engine/geom';
import { BRIDGE_MM, CLEARANCE_MM, EXPORT_TOL_MM, PLINTH_MIN_MM, PREVIEW_TOL_MM, TRACK_OVERLAP_MM } from './constants';
import type { Spacing } from './model';

export interface Block {
  letters: Poly;
  plinth: Poly;
  window: Poly;
  waste: Poly;
  inkW: number;
  s: number;
  capMm: number;
  bridges: number;
  /** The bridge bars added to the letters (already merged into `letters`). */
  bars: Poly;
}

/** Tight tracking pulls a pair in by at most this much. */
const MAX_PULL_EM = 0.25;
const LOOSE_EM = 0.05;
/** Cap height the tight pulls are measured at when `measureLine` isn't told one. */
const MEASURE_CAP_MM = 10;
/** Bars are drawn a little wider than BRIDGE_MM, so chord error and rounding never take them under it. */
const BAR_MM = BRIDGE_MM + 0.2;
/** How far a bar reaches into the shapes it joins. */
const BAR_OVERLAP_MM = 0.05;
/** Letters sink this far into the plinth so integer rounding never leaves a hairline gap. */
const SINK_MM = 0.002;
/**
 * A floating piece wider than this many times its height, centred at mid-height, is a dash. The
 * brief said 2; Alfa Slab One's hyphen is 1.96, so 1.5 (a period or dot is about 1).
 */
const DASH_ASPECT = 1.5;
/** A dash stretches to neighbours at most this far away. */
const DASH_REACH_MM = 3;
/** A piece bridges straight down when the part below is within this many cap heights. */
const DROP_REACH_CAP = 0.5;
/**
 * Glyph outlines are flattened this finely (px at the 100 px em): under PREVIEW_TOL_MM up to a
 * 35 mm cap height. The outline uses the same tolerance, so it matches `layoutGlyphs` point for point.
 */
const GLYPH_TOL_PX = 0.1;

// ---------------------------------------------------------------- normalising

const CURLY: Record<string, string> = { '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"' };
const VARIATION = /[︀-️]/;

/**
 * The text as it will be cut: NFC, upper-cased when `allCaps`, curly quotes straightened only when
 * the font lacks them. Characters only the fallback has set `needsFallback`; characters neither font
 * can draw are dropped and listed once each.
 */
export function normaliseText(
  raw: string,
  allCaps: boolean,
  font: TextFont,
  fallback: TextFont
): { text: string; dropped: string[]; needsFallback: boolean } {
  let text = raw.normalize('NFC');
  if (allCaps) text = text.toUpperCase();
  let out = '';
  const dropped: string[] = [];
  let needsFallback = false;
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
    if (/^\s+$/.test(segment)) {
      out += ' ';
      continue;
    }
    const g = CURLY[segment] && !font.hasChar(segment) ? CURLY[segment] : segment;
    const chars = [...g].filter((ch) => !VARIATION.test(ch));
    if (chars.length > 0 && chars.every((ch) => font.hasChar(ch))) out += chars.join('');
    else if (chars.length > 0 && chars.every((ch) => font.hasChar(ch) || fallback.hasChar(ch))) {
      out += chars.join('');
      needsFallback = true;
    } else if (!dropped.includes(segment)) dropped.push(segment);
  }
  return { text: out, dropped, needsFallback };
}

// ---------------------------------------------------------------- glyph layout

interface Cluster {
  index: number;
  char: string;
  space: boolean;
  /** Outline in px, y down, baseline at 0, placed as shaped (kerning included, no tracking). */
  poly: Poly;
  /** Lowest ink below the baseline that counts as a descender (commas and semicolons don't). */
  desc: number;
}

const shapedCache = new WeakMap<TextFont, Map<string, { clusters: Cluster[]; capPx: number }>>();

/** The line shaped whole at the 100 px em and split into clusters, cached per font. */
function shapeClusters(text: string, font: TextFont): { clusters: Cluster[]; capPx: number } {
  let cache = shapedCache.get(font);
  if (!cache) shapedCache.set(font, (cache = new Map()));
  const hit = cache.get(text);
  if (hit) return hit;
  const { glyphs } = font.shape(text, TEXT_RENDER_SIZE_PX);
  const starts = [...new Set(glyphs.map((g) => g.cluster))].sort((a, b) => a - b);
  const clusters = starts.map((index, k) => {
    const chars = text.slice(index, k + 1 < starts.length ? starts[k + 1] : text.length);
    const commands = glyphs.filter((g) => g.cluster === index).flatMap((g) => g.commands);
    const poly = fromPaths64(mergeContours(flattenCommands(commands, GLYPH_TOL_PX)));
    const b = bounds(poly);
    const tail = /^[,;\u201A\u201E]$/.test(chars);
    return { index, char: chars, space: /^\s*$/.test(chars), poly, desc: b && !tail ? Math.max(0, b.y + b.h) : 0 };
  });
  const result = { clusters, capPx: capHeightPx(font, TEXT_RENDER_SIZE_PX) };
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  cache.set(text, result);
  return result;
}

const shiftX = (poly: Poly, dx: number): Poly => poly.map((c) => c.map((p) => ({ x: p.x + dx, y: p.y })));

/**
 * How wide two outlines overlap: the widest single piece of their intersection, ignoring specks
 * under `minArea` (a speck far from the main overlap would otherwise stretch the bounds).
 */
const overlapW = (a: Poly, b: Poly, minArea: number): number =>
  Math.max(0, ...components(intersect(a, b)).filter((c) => area(c) >= minArea).map((c) => bounds(c)!.w));

/**
 * Tight tracking: for each pair inside a word, the smallest extra pull in [−0.25, 0] em that makes
 * the pair overlap at least `targetPx` wide. Returns the pull per left cluster, in em.
 */
function tightPulls(clusters: Cluster[], targetPx: number): number[] {
  const em = TEXT_RENDER_SIZE_PX;
  const speck = (0.05 * targetPx) ** 2;
  return clusters.map((left, i) => {
    const right = clusters[i + 1];
    if (!right || left.space || right.space || !left.poly.length || !right.poly.length) return 0;
    const width = (pull: number) => overlapW(left.poly, shiftX(right.poly, pull * em), speck);
    if (width(0) >= targetPx) return 0;
    if (width(-MAX_PULL_EM) < targetPx) return -MAX_PULL_EM;
    let lo = -MAX_PULL_EM; // overlaps enough
    let hi = 0; // doesn't
    for (let k = 0; k < 16; k++) {
      const mid = (lo + hi) / 2;
      if (width(mid) >= targetPx) lo = mid;
      else hi = mid;
    }
    return lo;
  });
}

interface Layout {
  clusters: Cluster[];
  /** Each cluster's extra pull (em) applied to every cluster after it. */
  pulls: number[];
  /** Each cluster's x shift in px from tracking and pulls. */
  shifts: number[];
  capPx: number;
  /** Ink box in px, y down, baseline at 0; desc ignores comma tails. */
  inkX: number;
  inkW: number;
  top: number;
  desc: number;
}

/** Clusters with tracking applied, measured. `capMm` sets how wide 0.8 mm of overlap is in px. */
function layout(text: string, font: TextFont, spacing: Spacing, capMm: number): Layout {
  const { clusters, capPx } = shapeClusters(text, font);
  const pxPerMm = capPx / capMm;
  const pulls = spacing === 'tight' ? tightPulls(clusters, (TRACK_OVERLAP_MM + 0.005) * pxPerMm) : clusters.map(() => 0);
  const track = spacing === 'loose' ? LOOSE_EM * TEXT_RENDER_SIZE_PX : 0;
  let acc = 0;
  const shifts = clusters.map((_, i) => {
    const here = acc;
    acc += track + pulls[i] * TEXT_RENDER_SIZE_PX;
    return here;
  });
  let [x0, x1, top, desc] = [Infinity, -Infinity, 0, 0];
  clusters.forEach((c, i) => {
    const b = bounds(c.poly);
    if (!b) return;
    x0 = Math.min(x0, b.x + shifts[i]);
    x1 = Math.max(x1, b.x + b.w + shifts[i]);
    top = Math.max(top, -b.y);
    desc = Math.max(desc, c.desc);
  });
  const empty = x0 === Infinity;
  return { clusters, pulls, shifts, capPx, inkX: empty ? 0 : x0, inkW: empty ? 0 : x1 - x0, top, desc };
}

/**
 * Ink width, ink top above the baseline and descender depth, each per 1 mm of cap height. Top and
 * descender are exactly linear in size; tight tracking's 0.8 mm overlap is not, so the width is
 * measured at `capMm` (10 mm unless given). Measure again at the chosen size for an exact width.
 */
export function measureLine(
  text: string,
  font: TextFont,
  spacing: Spacing,
  capMm: number = MEASURE_CAP_MM
): { inkWPerCap: number; topPerCap: number; descPerCap: number } {
  const l = layout(text, font, spacing, capMm);
  return { inkWPerCap: l.inkW / l.capPx, topPerCap: l.top / l.capPx, descPerCap: l.desc / l.capPx };
}

/** Where a layout lands in block coordinates: px (y down, baseline 0) to mm (v up from P). */
function placement(l: Layout, capMm: number, clearanceMm: number) {
  const k = capMm / l.capPx;
  const plinthH = Math.max(PLINTH_MIN_MM, l.desc * k);
  const toBlock = (poly: Poly, dxPx = 0): Poly =>
    poly.map((c) =>
      c.map((p) => ({ x: (p.x + dxPx - l.inkX) * k + clearanceMm, y: plinthH - SINK_MM - p.y * k })).reverse()
    );
  return { k, plinthH, toBlock };
}

/**
 * Each cluster placed in block coordinates as `buildBlock` places it, with its pull. For tests and
 * for drawing kerning handles.
 */
export function layoutGlyphs(text: string, font: TextFont, capMm: number, spacing: Spacing, clearanceMm = CLEARANCE_MM) {
  const l = layout(text, font, spacing, capMm);
  const { k, toBlock } = placement(l, capMm, clearanceMm);
  return {
    emMm: TEXT_RENDER_SIZE_PX * k,
    glyphs: l.clusters.map((c, i) => ({
      index: c.index,
      char: c.char,
      space: c.space,
      adjustEm: l.pulls[i],
      poly: toBlock(c.poly, l.shifts[i]),
    })),
  };
}

// ---------------------------------------------------------------- block

const rectPoly = (x: number, y: number, w: number, h: number): Poly =>
  w > 0 && h > 0 ? [[{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]] : [];

/** Window: square bottom on v = 0, top corners rounded at radius `r`. Built point by point so v = 0 stays exact. */
function windowPoly(w: number, h: number, r: number): Poly {
  const rr = Math.min(r, w / 2, h);
  const n = rr > 0 ? Math.max(2, Math.ceil(Math.PI / 2 / Math.acos(Math.max(0, 1 - EXPORT_TOL_MM / rr)))) : 0;
  const arc = (cx: number, cy: number, from: number): Pt[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = from + (i / n) * (Math.PI / 2);
      return { x: cx + rr * Math.cos(t), y: cy + rr * Math.sin(t) };
    });
  const pts: Pt[] = [{ x: 0, y: 0 }, { x: w, y: 0 }];
  if (rr > 0) pts.push(...arc(w - rr, h - rr, 0), ...arc(rr, h - rr, Math.PI / 2));
  else pts.push({ x: w, y: h }, { x: 0, y: h });
  return [pts];
}

function assemble(raw: Poly, inkW: number, plinthH: number, top: number, capMm: number, c: number): Block {
  const s = plinthH + top;
  const window = windowPoly(inkW + 2 * c, s + c, c);
  const plinth = rectPoly(c, 0, inkW, plinthH);
  // Comma tails and anything else below P are clipped at the plinth's bottom.
  const clipped = intersect(raw, rectPoly(-1, 0, inkW + 2 * c + 2, s + c + 1));
  const { letters, bars, count } = bridge(clipped, plinth, capMm);
  const waste = difference(window, union([letters, plinth]));
  return { letters, plinth, window, waste, inkW, s, capMm, bridges: count, bars };
}

/** The line as a welded, bridged block at cap height `capMm`, with clearance `clearanceMm` all round. */
export function buildBlock(text: string, font: TextFont, capMm: number, spacing: Spacing, clearanceMm: number): Block {
  const l = layout(text, font, spacing, capMm);
  const { k, plinthH, toBlock } = placement(l, capMm, clearanceMm);
  let raw: Poly = [];
  if (l.inkW > 0) {
    const pairAdjustEm: Record<string, number> = {};
    l.clusters.forEach((c, i) => {
      if (l.pulls[i] !== 0) pairAdjustEm[`0:${c.index}`] = l.pulls[i];
    });
    const config: TextConfig = {
      text,
      family: '',
      weight: 400,
      style: 'normal',
      align: 'left',
      letterSpacingEm: spacing === 'loose' ? LOOSE_EM : 0,
      lineHeight: 1,
      pairAdjustEm,
    };
    const outline = buildTextOutline(config, [font], Math.min(GLYPH_TOL_PX, PREVIEW_TOL_MM / k));
    const baseline = Math.round(outline.baselinesPx[0] * 1000) / 1000;
    raw = toBlock(outline.poly.map((c) => c.map((p) => ({ x: p.x, y: p.y - baseline }))));
  }
  return assemble(raw, l.inkW * k, plinthH, l.top * k, capMm, clearanceMm);
}

/** An icon (1 mm tall, bottom on y = 0, y up) at `heightMm`, standing on a 3 mm plinth. */
export function buildIconBlock(icon: Poly, heightMm: number, clearanceMm: number): Block {
  const b = bounds(icon);
  if (!b) return assemble([], 0, PLINTH_MIN_MM, 0, heightMm, clearanceMm);
  const placed = icon.map((c) =>
    c.map((p) => ({ x: (p.x - b.x) * heightMm + clearanceMm, y: (p.y - b.y) * heightMm + PLINTH_MIN_MM - SINK_MM }))
  );
  return assemble(union([placed]), b.w * heightMm, PLINTH_MIN_MM, b.h * heightMm, heightMm, clearanceMm);
}

/** The area lost to an opening at r = minStroke / 2: strokes too thin to cut, and corner rounding. */
export function thinArea(poly: Poly, minStrokeMm: number): number {
  const r = minStrokeMm / 2;
  return area(poly) - area(grow(offset(poly, -r, EXPORT_TOL_MM), r, EXPORT_TOL_MM));
}

// ---------------------------------------------------------------- bridges

const signedArea = (c: Pt[]): number => {
  let a = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) a += (c[j].x + c[i].x) * (c[i].y - c[j].y);
  return a / 2;
};

function inside(p: Pt, c: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    if (c[i].y > p.y !== c[j].y > p.y && p.x < ((c[j].x - c[i].x) * (p.y - c[i].y)) / (c[j].y - c[i].y) + c[i].x) hit = !hit;
  }
  return hit;
}

/** Splits a poly into its pieces: each outer contour with the holes inside it. */
function components(poly: Poly): Poly[] {
  const outers = poly.filter((c) => signedArea(c) > 0).map((c) => ({ c, a: signedArea(c), holes: [] as Pt[][] }));
  for (const h of poly.filter((c) => signedArea(c) < 0)) {
    const host = outers.filter((o) => inside(h[0], o.c)).sort((x, y) => x.a - y.a)[0];
    host?.holes.push(h);
  }
  return outers.map((o) => [o.c, ...o.holes]);
}

/** Where the poly's edges cross the vertical line at `x`, sorted. */
function crossings(poly: Poly, x: number): number[] {
  const out: number[] = [];
  for (const c of poly) {
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
      const [a, b] = [c[j], c[i]];
      if (a.x <= x !== b.x <= x) out.push(a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x));
    }
  }
  return out.sort((p, q) => p - q);
}

type Dir = 'down' | 'left' | 'right';
/** Maps a direction onto "down" (toward −y) and back. */
const AXES: Record<Dir, { to: (p: Pt) => Pt; from: (p: Pt) => Pt }> = {
  down: { to: (p) => p, from: (p) => p },
  left: { to: (p) => ({ x: p.y, y: p.x }), from: (p) => ({ x: p.y, y: p.x }) },
  right: { to: (p) => ({ x: p.y, y: -p.x }), from: (p) => ({ x: -p.y, y: p.x }) },
};

/**
 * The shortest straight bar `width` wide from piece `f` toward `dir` to the nearest other geometry,
 * no longer than `reach`. Each candidate is checked on five lines across its width: the bar's end
 * must sit inside solid material on both sides, so it never pokes out into the waste.
 */
function findBar(f: Poly, others: Poly, dir: Dir, width: number, reach: number): { bar: Poly; gap: number } | null {
  const ax = AXES[dir];
  const F = f.map((c) => c.map(ax.to));
  const O = others.map((c) => c.map(ax.to));
  const fb = bounds(F);
  if (!fb) return null;
  const span = fb.w - width;
  const n = span > 0 ? Math.min(24, Math.ceil(span / 0.2)) : 0;
  const e = BAR_OVERLAP_MM;
  let best: { x: number; lo: number; hi: number; gap: number; score: number } | null = null;
  for (let k = 0; k <= n; k++) {
    const x = span > 0 ? fb.x + width / 2 + (span * k) / Math.max(1, n) : fb.x + fb.w / 2;
    const lines = [-0.49, -0.25, 0, 0.25, 0.49].map((t) => x + t * width);
    const cols = lines.map((lx) => ({ f: crossings(F, lx), o: crossings(O, lx) }));
    if (cols[2].f.length < 2) continue;
    const present = cols.filter((c) => c.f.length >= 2);
    const hi = Math.max(...present.map((c) => c.f[0]));
    if (present.some((c) => c.f[1] < hi + e)) continue;
    let lo = Infinity;
    let ok = true;
    const tops = cols.map((c) => {
      const below = c.o.filter((y) => y < (c.f.length ? c.f[0] : hi));
      return below.length ? { top: below[below.length - 1], bottom: below.length > 1 ? below[below.length - 2] : -Infinity } : null;
    });
    for (const t of tops) {
      if (!t) ok = false;
      else lo = Math.min(lo, t.top);
    }
    if (!ok || tops.some((t) => t!.bottom > lo - e)) continue;
    const gap = hi - lo;
    // A bar wider than the piece is a last resort; among equals, the one nearest the middle wins.
    const score = gap + (present.length < cols.length ? 1000 : 0) + (0.02 * Math.abs(x - fb.x - fb.w / 2)) / width;
    if (gap <= reach && (!best || score < best.score)) best = { x, lo, hi, gap, score };
  }
  if (!best) return null;
  const { x, lo, hi } = best;
  const corners = [
    { x: x - width / 2, y: lo - e },
    { x: x + width / 2, y: lo - e },
    { x: x + width / 2, y: hi + e },
    { x: x - width / 2, y: hi + e },
  ].map(ax.from);
  if (signedArea(corners) < 0) corners.reverse();
  return { bar: [corners], gap: best.gap };
}

/**
 * Bridges every piece not joined to the plinth, in the spec's order: dashes stretch sideways to
 * neighbours within 3 mm (and drop to the part below on a side without one); pieces above another
 * part within half a cap height drop straight down; anything else reaches sideways to its nearest
 * neighbour. Repeats until letters and plinth are one piece.
 */
function bridge(raw: Poly, plinth: Poly, capMm: number): { letters: Poly; bars: Poly; count: number } {
  let letters = raw;
  const bars: Poly = [];
  let count = 0;
  const pb = bounds(plinth);
  if (!pb) return { letters, bars, count: 0 };
  const anchor = { x: pb.x + pb.w / 2, y: pb.h / 2 };
  for (let pass = 0; pass < 8; pass++) {
    const pieces = components(union([letters, plinth]));
    if (pieces.length <= 1) break;
    const added: Poly[] = [];
    pieces.forEach((f, i) => {
      if (inside(anchor, f[0])) return;
      const others = pieces.filter((_, j) => j !== i).flat();
      const b = bounds(f)!;
      const mid = b.y + b.h / 2 - pb.h;
      const dash = b.w > DASH_ASPECT * b.h && mid > 0.15 * capMm && mid < 0.75 * capMm;
      const drop = (r: number) => findBar(f, others, 'down', BAR_MM, r);
      if (dash) {
        const w = Math.max(BAR_MM, 0.9 * b.h);
        const sides = [findBar(f, others, 'left', w, DASH_REACH_MM), findBar(f, others, 'right', w, DASH_REACH_MM)];
        for (const s of sides) if (s) added.push(s.bar);
        const v = sides.some((s) => !s) ? drop(Infinity) : null;
        if (v) added.push(v.bar);
        if (sides.some((s) => s) || v) return;
      }
      const v = drop(DROP_REACH_CAP * capMm);
      if (v) return void added.push(v.bar);
      const side = [findBar(f, others, 'left', BAR_MM, Infinity), findBar(f, others, 'right', BAR_MM, Infinity)]
        .filter((s) => s !== null)
        .sort((p, q) => p.gap - q.gap)[0];
      const any = side ?? drop(Infinity);
      if (any) added.push(any.bar);
    });
    if (added.length === 0) break;
    bars.push(...added.flat());
    count += added.length;
    letters = union([letters, ...added]);
  }
  return { letters, bars: union([bars]), count };
}
