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
  /** Each bar on its own, with the way it reaches from the floating piece. */
  bridgeBars: BridgeBar[];
}

/** One bridge bar: `down` drops to the part below; `left` and `right` reach sideways. */
export interface BridgeBar {
  dir: 'down' | 'left' | 'right';
  bar: Poly;
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

/** A least-recently-used cache per font: a hit moves to the back, and the front goes when it's full. */
function fontCache<V>(limit: number) {
  const byFont = new WeakMap<TextFont, Map<string, V>>();
  return {
    get(font: TextFont, key: string): V | undefined {
      const m = byFont.get(font);
      const v = m?.get(key);
      if (m && v !== undefined) {
        m.delete(key);
        m.set(key, v);
      }
      return v;
    },
    set(font: TextFont, key: string, v: V): V {
      let m = byFont.get(font);
      if (!m) byFont.set(font, (m = new Map()));
      m.set(key, v);
      if (m.size > limit) m.delete(m.keys().next().value!);
      return v;
    },
  };
}

/** Shaped lines: about 200 per font covers every line and split a session tries. */
const shapedCache = fontCache<{ clusters: Cluster[]; capPx: number }>(200);

/** The line shaped whole at the 100 px em and split into clusters, cached per font. */
function shapeClusters(text: string, font: TextFont): { clusters: Cluster[]; capPx: number } {
  const hit = shapedCache.get(font, text);
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
  return shapedCache.set(font, text, { clusters, capPx: capHeightPx(font, TEXT_RENDER_SIZE_PX) });
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

/**
 * `islands` are the glyphs' own pieces (a colon's two dots, an i's dot and stem) before letters
 * merge, so a piece welded to a neighbour only at a corner can still be found and bridged.
 */
function assemble(raw: Poly, islands: Poly[], inkW: number, plinthH: number, top: number, capMm: number, c: number): Block {
  const s = plinthH + top;
  const window = windowPoly(inkW + 2 * c, s + c, c);
  const plinth = rectPoly(c, 0, inkW, plinthH);
  // Comma tails and anything else below P are clipped at the plinth's bottom.
  const clipped = intersect(raw, rectPoly(-1, 0, inkW + 2 * c + 2, s + c + 1));
  const bridged = bridge(clipped, islands, plinth, capMm);
  const { bars, list } = bridged;
  const letters = fillSlots(bridged.letters, plinth);
  const waste = difference(window, union([letters, plinth]));
  return { letters, plinth, window, waste, inkW, s, capMm, bridges: list.length, bars, bridgeBars: list };
}

/**
 * Built blocks, kept across builds: a rebuild that only changes something else (a colour, the stroke
 * check, the other line) reuses each line's block. Blocks are never changed after they're built.
 */
const blockCache = fontCache<Block>(48);

/** The line as a welded, bridged block at cap height `capMm`, with clearance `clearanceMm` all round. */
export function buildBlock(text: string, font: TextFont, capMm: number, spacing: Spacing, clearanceMm: number): Block {
  const key = `${capMm}|${spacing}|${clearanceMm}|${text}`;
  return blockCache.get(font, key) ?? blockCache.set(font, key, makeBlock(text, font, capMm, spacing, clearanceMm));
}

function makeBlock(text: string, font: TextFont, capMm: number, spacing: Spacing, clearanceMm: number): Block {
  const l = layout(text, font, spacing, capMm);
  const { k, plinthH, toBlock } = placement(l, capMm, clearanceMm);
  let raw: Poly = [];
  const islands = l.clusters.flatMap((c, i) => components(toBlock(c.poly, l.shifts[i])));
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
  return assemble(raw, islands, l.inkW * k, plinthH, l.top * k, capMm, clearanceMm);
}

/** An icon (1 mm tall, bottom on y = 0, y up) at `heightMm`, standing on a 3 mm plinth. */
export function buildIconBlock(icon: Poly, heightMm: number, clearanceMm: number): Block {
  const b = bounds(icon);
  if (!b) return assemble([], [], 0, PLINTH_MIN_MM, 0, heightMm, clearanceMm);
  const placed = icon.map((c) =>
    c.map((p) => ({ x: (p.x - b.x) * heightMm + clearanceMm, y: (p.y - b.y) * heightMm + PLINTH_MIN_MM - SINK_MM }))
  );
  const merged = union([placed]);
  return assemble(merged, components(merged), b.w * heightMm, PLINTH_MIN_MM, b.h * heightMm, heightMm, clearanceMm);
}

/** Extra regrowth in the strip measurement, so rounding never leaves strips along strokes just over the minimum. */
const REGROW_SLACK_MM = 0.05;
/**
 * Removed material that vanishes under an erosion this deep is chord error (slivers a few µm thick
 * along slanted and curved edges, or junk outer-and-hole pairs Clipper returns on them), not a
 * stroke. A 0.1 mm spur survives it.
 */
const NOISE_MM = 0.025;

/** Holes narrower than this are slots between welded letters, too narrow to cut; real counters are wider. */
const SLOT_MM = 1;

/**
 * Fills every hole in letters ∪ plinth narrower than 1 mm (one that vanishes under a −0.5 mm
 * offset): the slots tight tracking leaves between stems where serifs overlap.
 */
function fillSlots(letters: Poly, plinth: Poly): Poly {
  const slots = union([letters, plinth])
    .filter((c) => signedArea(c) < 0)
    .map((h) => [[...h].reverse()])
    .filter((h) => area(offset(h, -SLOT_MM / 2, PREVIEW_TOL_MM)) <= 1e-6);
  return slots.length ? union([letters, ...slots]) : letters;
}

/** Whether a point lies in a piece: inside its outer contour and none of its holes. */
const inPiece = (p: Pt, piece: Poly): boolean => inside(p, piece[0]) && !piece.slice(1).some((h) => inside(p, h));

/**
 * Vertices `thinArea` may feed to Clipper's offsets before it gives up. A line of slab text at any
 * size uses a few thousand; a pathological shape (hundreds of slivers) would otherwise stall
 * clipper2-js for minutes.
 */
export const THIN_BUDGET_VERTICES = 60_000;

export interface ThinOptions {
  /** Stop as soon as the total passes this many mm² and return what was found (the check's threshold). */
  stopAbove?: number;
  /** Override the work budget, in vertices (tests). */
  budget?: number;
}

const vertexCount = (poly: Poly): number => poly.reduce((n, c) => n + c.length, 0);

/**
 * The area of material too thin to cut at `minStrokeMm`, from an opening at r = minStroke / 2.
 * - Necks: where the eroded core splits one piece in two, the joint is thinner than minStroke. Each
 *   removed piece that sits between two core pieces counts in full, and never less than
 *   minStroke² / 4, so even a hairline weld fails a 0.05 mm² threshold.
 * - Strips: elsewhere, a removed piece counts when what survives a 0.025 mm erosion of it is longer
 *   than 2 × minStroke. That keeps thin spurs and drops corner slivers (short) and chord noise.
 *
 * Each removed piece is eroded on its own, after pieces too small or too short to count are dropped:
 * one erosion of a hundred slivers at once stalls clipper2-js (see `grow` in Kerfuffle's geom). If the
 * work still passes the budget, the result is `Infinity`: "thin found", so the warning shows and
 * nothing hangs.
 */
export function thinArea(poly: Poly, minStrokeMm: number, opts: ThinOptions = {}): number {
  const r = minStrokeMm / 2;
  const tol = PREVIEW_TOL_MM;
  const stopAbove = opts.stopAbove ?? Infinity;
  let budget = opts.budget ?? THIN_BUDGET_VERTICES;
  /** Charges a step's input to the budget; false once it runs out. */
  const spend = (input: Poly): boolean => (budget -= vertexCount(input)) >= 0;

  if (!spend(poly)) return Infinity;
  const core = offset(poly, -r, tol);
  const coreParts = components(core).filter((c) => area(c) > 1e-6);
  const shapes = components(poly);
  const coresPerShape = shapes.map((sh) => coreParts.filter((c) => inPiece(c[0][0], sh)).length);
  const split = coresPerShape.some((n) => n > 1);
  const betweenCores = (piece: Poly): boolean => {
    const near = grow(piece, r + 0.1, tol);
    return coreParts.filter((c) => area(intersect(near, c)) > 1e-6).length >= 2;
  };

  let total = 0;
  if (split) {
    // No regrow slack here: slack would close a short neck again.
    if (!spend(core)) return Infinity;
    const opened = intersect(poly, grow(core, r, tol));
    for (const piece of components(difference(poly, opened))) {
      if (!spend(piece)) return Infinity;
      if (betweenCores(piece)) total += Math.max(area(piece), minStrokeMm ** 2 / 4);
      if (total > stopAbove) return total;
    }
  }

  // Regrowing a hairline core (a stroke just over minStroke) can drop strips in clipper2-js, so the
  // strip measurement regrows a little further and clips to the shape.
  if (!spend(core)) return Infinity;
  const removed = difference(poly, intersect(poly, grow(core, r + REGROW_SLACK_MM, tol)));
  const minLength = 2 * (minStrokeMm - NOISE_MM);
  const counts = (c: Poly): boolean => {
    const b = bounds(c)!;
    return area(c) > 1e-4 && Math.max(b.w, b.h) > minLength;
  };
  for (const piece of components(removed)) {
    // Erosion only shrinks a piece, so one already too small or too short can't leave a survivor.
    if (!counts(piece)) continue;
    if (!spend(piece)) return Infinity;
    if (!components(offset(piece, -NOISE_MM, tol)).some(counts)) continue;
    if (split && betweenCores(piece)) continue; // counted as a neck
    total += area(piece);
    if (total > stopAbove) return total;
  }
  return total;
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
 * must sit inside solid material on both sides, so it never pokes out into the waste. With `strict`
 * off (the last resort, for tiny text) only the middle line must land on material.
 */
function findBar(f: Poly, others: Poly, dir: Dir, width: number, reach: number, strict = true): (BridgeBar & { gap: number }) | null {
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
    if (strict) {
      for (const t of tops) {
        if (!t) ok = false;
        else lo = Math.min(lo, t.top);
      }
      if (!ok || tops.some((t) => t!.bottom > lo - e)) continue;
    } else {
      // Last resort: the bar lands on whatever sits under its middle line, and its sides may hang
      // over the waste (a dot narrower than the bar, over a stem narrower than the bar).
      if (!tops[2]) continue;
      lo = tops[2].top;
    }
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
  return { dir, bar: [corners], gap: best.gap };
}

/**
 * The free islands (glyph pieces off the plinth) inside `main` that are held only by a joint
 * thinner than a bridge: within a crop round the island, its eroded core reaches no material
 * beyond the free islands. A corner-to-corner weld from tight tracking is the usual case.
 */
function thinlyHeld(free: Poly[], main: Poly): Poly[] {
  const r = BRIDGE_MM / 2;
  const freeZone = free.length ? grow(union(free), 0.05, PREVIEW_TOL_MM) : [];
  return free.filter((isl) => {
    const own = offset(isl, -r, PREVIEW_TOL_MM);
    // An island too thin to have a core is the stroke check's business; one outside `main` is
    // already a floating piece.
    if (area(own) <= 1e-6 || area(intersect(own, main)) < 0.99 * area(own)) return false;
    const b = bounds(isl)!;
    const local = intersect(main, rectPoly(b.x - 3, b.y - 3, b.w + 6, b.h + 6));
    // The island's core pieces as they sit in the merged shape, matched by overlap (a point on a
    // core's edge can't be trusted to test inside).
    const cores = components(offset(local, -r, PREVIEW_TOL_MM)).filter((c) => area(intersect(c, own)) > 1e-6);
    return cores.length > 0 && cores.every((c) => area(difference(c, freeZone)) <= 0.01);
  });
}

/**
 * Bridges every piece not joined to the plinth, in the spec's order: dashes stretch sideways to
 * neighbours within 3 mm (and drop to the part below on a side without one); pieces above another
 * part within half a cap height drop straight down; anything else reaches sideways to its nearest
 * neighbour. Repeats until letters and plinth are one piece.
 */
function bridge(raw: Poly, islands: Poly[], plinth: Poly, capMm: number): { letters: Poly; bars: Poly; list: BridgeBar[] } {
  let letters = raw;
  const list: BridgeBar[] = [];
  const pb = bounds(plinth);
  if (!pb) return { letters, bars: [], list };
  const anchor = { x: pb.x + pb.w / 2, y: pb.h / 2 };
  const free = islands.filter((isl) => bounds(isl)!.y > pb.h + 0.05);
  /** Thinly held islands already given a bar: never barred again, or a bar that doesn't help repeats every pass. */
  const held = new Set<Poly>();
  for (let pass = 0; pass < 8; pass++) {
    const solid = union([letters, plinth]);
    const pieces = components(solid);
    const floating = pieces
      .map((f, i) => ({ f, others: pieces.filter((_, j) => j !== i).flat() }))
      .filter(({ f }) => !inside(anchor, f[0]));
    const main = pieces.find((f) => inside(anchor, f[0]));
    if (main) {
      for (const isl of thinlyHeld(free.filter((x) => !held.has(x)), main)) {
        held.add(isl);
        floating.push({ f: isl, others: difference(solid, isl) });
      }
    }
    if (floating.length === 0) break;
    const added: BridgeBar[] = [];
    floating.forEach(({ f, others }) => {
      const b = bounds(f)!;
      const mid = b.y + b.h / 2 - pb.h;
      const dash = b.w > DASH_ASPECT * b.h && mid > 0.15 * capMm && mid < 0.75 * capMm;
      const drop = (r: number) => findBar(f, others, 'down', BAR_MM, r);
      if (dash) {
        const w = Math.max(BAR_MM, 0.9 * b.h);
        const sides = [findBar(f, others, 'left', w, DASH_REACH_MM), findBar(f, others, 'right', w, DASH_REACH_MM)];
        for (const s of sides) if (s) added.push(s);
        const v = sides.some((s) => !s) ? drop(Infinity) : null;
        if (v) added.push(v);
        if (sides.some((s) => s) || v) return;
      }
      const v = drop(DROP_REACH_CAP * capMm);
      if (v) return void added.push(v);
      const side = [findBar(f, others, 'left', BAR_MM, Infinity), findBar(f, others, 'right', BAR_MM, Infinity)]
        .filter((s) => s !== null)
        .sort((p, q) => p.gap - q.gap)[0];
      const loose = (r: number) => findBar(f, others, 'down', BAR_MM, r, false);
      const looseSide = () =>
        [findBar(f, others, 'left', BAR_MM, Infinity, false), findBar(f, others, 'right', BAR_MM, Infinity, false)]
          .filter((s) => s !== null)
          .sort((p, q) => p.gap - q.gap)[0];
      const any = side ?? drop(Infinity) ?? loose(DROP_REACH_CAP * capMm) ?? looseSide() ?? loose(Infinity);
      if (any) added.push(any);
    });
    if (added.length === 0) break;
    list.push(...added.map(({ dir, bar }) => ({ dir, bar })));
    letters = union([letters, ...added.map((a) => a.bar)]);
  }
  return { letters, bars: union(list.map((b) => b.bar)), list };
}
