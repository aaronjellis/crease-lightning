/**
 * Accent sizing and where strips sit along the spine. Every strip is centred on L / 2 except the
 * accents, which flank line 2 (two lines) or sit at the ends of line 1's riser (one line).
 */
import { FRONT_GAP_MM, MARGIN_MM, PLINTH_MIN_MM, WEB_MM } from './constants';
import { buildIconBlock, type Block } from './text';
import type { Icon } from '../themes/types';

/** The lowest a step may be: its back hinge needs room on whatever it is cut from. */
export const MIN_H_MM = WEB_MM + 1;

/** Accent preferences at W = 127, scaled by W / 127. */
const ACCENT_H_MM = 10;
const ACCENT_D_MM = 25;
const ACCENT_ICON_MM = 20;

export interface Span {
  y0: number;
  y1: number;
}

export interface AccentPlan {
  id: 'a1' | 'a2';
  d: number;
  h: number;
  block: Block;
  /** Window plus a rail each side. */
  stripW: number;
}

export interface AccentRoom {
  /** W / 127. */
  k: number;
  W: number;
  /** Line 1's depth: the accents hinge on its base hinge A. */
  d1: number;
  /** Line 1's height: the accents must stay clear of its letters in front view. */
  h1: number;
  c: number;
  rail: number;
}

/**
 * One accent step on line 1's hinge A, or null when its icon can't stand at its minimum height.
 * It starts from h′ = 10k, d′ = 25k and an icon max(20k, minimum) tall (just the minimum when
 * `smallest`, to leave line 2 more room), then gives way only as far as
 * the constraints need:
 * - Front view (h′ + s′ + 3 ≤ h₁): the icon shrinks toward its minimum, then h′ drops toward MIN_H_MM.
 * - Tread (s′ ≤ d′ − c − web): d′ grows to hold the icon and plinth.
 * - Closed reach (d₁ + d′ + h′ + s′ ≤ W − m): the icon shrinks.
 */
export function sizeAccent(id: 'a1' | 'a2', icon: Icon, room: AccentRoom, smallest = false): AccentPlan | null {
  const { k, W, d1, h1, c, rail } = room;
  const frontMax = (h: number) => h1 - FRONT_GAP_MM - h - PLINTH_MIN_MM;
  let h = ACCENT_H_MM * k;
  let iconH = smallest ? icon.minHeightMm : Math.max(ACCENT_ICON_MM * k, icon.minHeightMm);
  if (iconH > frontMax(h)) {
    iconH = Math.max(icon.minHeightMm, frontMax(h));
    if (iconH > frontMax(h)) h = Math.max(MIN_H_MM, h1 - FRONT_GAP_MM - PLINTH_MIN_MM - iconH);
    iconH = Math.min(iconH, frontMax(h));
  }
  // d′ = max(25k, s′ + c + web) and d′ + s′ ≤ reach room; both bounds together are sufficient.
  const dPref = ACCENT_D_MM * k;
  const reachRoom = W - MARGIN_MM - d1 - h;
  const sMax = Math.min(reachRoom - dPref, (reachRoom - c - WEB_MM) / 2);
  iconH = Math.min(iconH, sMax - PLINTH_MIN_MM);
  if (!(iconH >= icon.minHeightMm - 1e-9)) return null;
  const block = buildIconBlock(icon.poly, iconH, c);
  return { id, d: Math.max(dPref, block.s + c + WEB_MM), h, block, stripW: block.inkW + 2 * c + 2 * rail };
}

/** Room line 2 gives up to accents: the wider accent and a web on each side, so line 2 stays centred. */
export function accentSpace(stripWs: number[]): number {
  return stripWs.length ? 2 * (Math.max(...stripWs) + WEB_MM) : 0;
}

const centred = (mid: number, w: number): Span => ({ y0: mid - w / 2, y1: mid + w / 2 });

/**
 * Two lines: line 2 centred on L / 2, each accent centred in the room between line 2 and line 1's
 * rail on its side. Line 1's strip is wide enough for its own window and for everything on its riser.
 */
export function placeTwoLines(
  L: number,
  window1: number,
  rail1: number,
  strip2: number,
  accentWs: number[]
): { root: Span; l2: Span; accents: Span[] } {
  const span = strip2 + accentSpace(accentWs);
  const root = centred(L / 2, Math.max(window1, span) + 2 * rail1);
  const l2 = centred(L / 2, strip2);
  const accents = accentWs.map((w, i) => {
    const [lo, hi] = i === 0 ? [root.y0 + rail1, l2.y0 - WEB_MM] : [l2.y1 + WEB_MM, root.y1 - rail1];
    return centred((lo + hi) / 2, w);
  });
  return { root, l2, accents };
}

/** One line: line 1 centred, the accents at the ends of its riser, just inside its rails. */
export function placeOneLine(L: number, window1: number, rail1: number, accentWs: number[]): { root: Span; accents: Span[] } {
  const need = accentWs.length ? accentWs[0] + accentWs[1] + WEB_MM : 0;
  const root = centred(L / 2, Math.max(window1, need) + 2 * rail1);
  const accents = accentWs.map((w, i) =>
    i === 0 ? { y0: root.y0 + rail1, y1: root.y0 + rail1 + w } : { y0: root.y1 - rail1 - w, y1: root.y1 - rail1 }
  );
  return { root, accents };
}
