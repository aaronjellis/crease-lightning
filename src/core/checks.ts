/**
 * The five pre-export checks: the card closes flat, the inner sheet is one piece, cuts keep their
 * web, strokes are thick enough, and line 2 doesn't hide line 1. Export is allowed only when all pass.
 */
import { area, difference, grow, intersect, offsetOpen, outerCount, union, type Poly } from '@kerfuffle/engine/geom';
import type { Card } from './build';
import { MARGIN_MM, PREVIEW_TOL_MM, WEB_MM, FRONT_GAP_MM } from './constants';
import { foldU, frameAB } from './linkage';
import { cardDims, type Params } from './model';

export interface CheckResult {
  id: 'closed' | 'one-piece' | 'layout' | 'stroke' | 'front-view';
  ok: boolean;
  detail?: string;
}

export interface CheckOptions {
  /** False when fit skipped the stroke check; the stroke result is then "not run". */
  strokeCheck?: boolean;
}

const EPS = 1e-6;
/** Open cuts count as slots this wide when the sheet is tested for connectivity. */
const SLOT_MM = 0.1;
/** Panels may overlap by this much in total before the layout fails. */
const OVERLAP_MM2 = 0.5;
/** Matches the note fit emits for a thin stroke. */
/** Least overlap, after growing the riser by 0.01 mm, that counts as touching. */
const TOUCH_MM2 = 1e-4;
const THIN_NOTE = /thinner than/;

type Check = Omit<CheckResult, 'id'>;
type Subject = Omit<Card, 'checks'>;

const mm = (v: number): string => `${Math.round(v * 100) / 100} mm`;

/** For every vertex of every step panel, a + b ≤ W − m: the card closes flat. */
function closed(card: Subject, p: Params): Check {
  const { W } = cardDims(p);
  const limit = W - MARGIN_MM;
  let worst = { id: '', reach: -Infinity };
  for (const panel of card.panels) {
    if (panel.stepId === null) continue;
    for (const contour of panel.poly) {
      for (const v of contour) {
        const { a, b } = frameAB(panel.frame, v.x);
        if (a + b > worst.reach) worst = { id: panel.id, reach: a + b };
      }
    }
  }
  return worst.reach > limit + EPS
    ? { ok: false, detail: `${worst.id} reaches ${mm(worst.reach)} from the spine; the closed card allows ${mm(limit)}.` }
    : { ok: true };
}

/** The inner sheet minus its cuts is one region, and every letter panel touches its riser. */
function onePiece(card: Subject): Check {
  const { inner } = card;
  const slots = inner.openCuts.map((c) => offsetOpen(c, SLOT_MM / 2, PREVIEW_TOL_MM));
  const region = difference(difference(inner.outline, union(inner.holes)), union(slots));
  const pieces = outerCount(region);
  if (pieces !== 1) return { ok: false, detail: `The inner sheet falls into ${pieces} pieces when cut.` };
  for (const letters of card.panels.filter((x) => x.id.endsWith(':letters') && x.poly.length > 0)) {
    const riser = card.panels.find((x) => x.id === letters.id.replace(/:letters$/, ':riser'));
    // Growing the riser (a plain rectangle) is safe; growing the letters leaves slivers in their counters.
    if (!riser || area(intersect(grow(riser.poly, 0.01, PREVIEW_TOL_MM), letters.poly)) < TOUCH_MM2) {
      return { ok: false, detail: `The letters in ${letters.id} aren't attached to their riser.` };
    }
  }
  return { ok: true };
}

/** Cuts keep a web between them, strips keep a margin from the card edge, and panels don't overlap. */
function layoutCheck(card: Subject, p: Params): Check {
  const { W, L } = cardDims(p);
  const { steps } = card.layout;

  for (const s of steps) {
    const { B, A } = foldU(s, steps);
    const edge = Math.min(s.y0, L - s.y1, B + W, W - A);
    if (edge < MARGIN_MM - EPS) return { ok: false, detail: `Strip ${s.id} is ${mm(edge)} from the card edge; it needs ${MARGIN_MM} mm.` };
  }

  const r = (WEB_MM - 0.02) / 2;
  const cuts = [
    ...card.inner.holes.map((h, i) => ({ name: `hole ${i + 1}`, zone: grow(h, r, PREVIEW_TOL_MM) })),
    ...card.inner.openCuts.map((c, i) => ({ name: `cut ${i + 1}`, zone: offsetOpen(c, r, PREVIEW_TOL_MM) })),
  ];
  for (let i = 0; i < cuts.length; i++) {
    for (let j = i + 1; j < cuts.length; j++) {
      if (area(intersect(cuts[i].zone, cuts[j].zone)) > EPS) {
        return { ok: false, detail: `${cuts[i].name} and ${cuts[j].name} are closer than ${WEB_MM} mm.` };
      }
    }
  }

  const polys: Poly[] = card.panels.map((x) => x.poly);
  const overlap = polys.reduce((t, x) => t + area(x), 0) - area(union(polys));
  if (overlap > OVERLAP_MM2) return { ok: false, detail: `Panels overlap by ${mm(overlap)}².` };
  return { ok: true };
}

/** Reads fit's result: ok unless fit emitted a thin-stroke note. */
function stroke(card: Subject, run: boolean): Check {
  if (!run) return { ok: true, detail: 'not run' };
  const thin = card.notes.find((n) => THIN_NOTE.test(n.message));
  return thin ? { ok: false, detail: thin.message } : { ok: true };
}

/** A child step stands clear of its parent's text in front view: h + s + gap ≤ parent h. */
function frontView(card: Subject): Check {
  const { steps } = card.layout;
  for (const s of steps) {
    const parent = steps.find((x) => x.id === s.parentId);
    if (!parent) continue;
    if (s.h + s.s + FRONT_GAP_MM > parent.h + EPS) {
      return { ok: false, detail: `${s.id} would hide part of ${parent.id} in front view.` };
    }
  }
  return { ok: true };
}

export function runChecks(card: Subject, p: Params, opts: CheckOptions = {}): CheckResult[] {
  return [
    { id: 'closed', ...closed(card, p) },
    { id: 'one-piece', ...onePiece(card) },
    { id: 'layout', ...layoutCheck(card, p) },
    { id: 'stroke', ...stroke(card, opts.strokeCheck ?? true) },
    { id: 'front-view', ...frontView(card) },
  ];
}
