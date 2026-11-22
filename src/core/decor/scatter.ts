/**
 * An item's scatter candidates. Each list is seeded from the decor's seed and the item's own id, so
 * it never depends on the other items: adding, removing or moving one item, or typing a letter,
 * leaves every other item's list, and so its spot, unchanged unless that spot stops fitting.
 */
import { atLeastMin, pageRect, type Spot } from './geometry';
import { rng } from './rng';
import type { DecorItem, Page } from './types';

export const CANDIDATES = 240;
/** Unsized items step down this much every STEP_EVERY candidates, toward their minimum. */
const STEP_MM = 0.5;
const STEP_EVERY = 40;

/** The item's seeded starting size in [minMm, maxMm]: the first draw of its list. */
const startOf = (item: DecorItem, r: () => number): number => item.minMm + r() * (item.maxMm - item.minMm);

/**
 * The size a pinned item is shown at: its fixed size (`moveItem` stores the size it was dropped at),
 * else its minimum. Never from the seed, so Shuffle never resizes a pin; never under the icon's minimum.
 */
export function pinnedSize(item: DecorItem): number {
  return atLeastMin(item.icon, item.sizeMm ?? item.minMm);
}

/**
 * The item's candidates in order. Each centre is uniform over both pages' usable rectangles (the
 * page picked by area); each size is the item's fixed size, or its seeded start stepping down
 * toward its minimum. No size is ever under the icon's minimum (R12).
 */
export function* candidates(item: DecorItem, seed: number, W: number, L: number): Generator<Spot> {
  const r = rng(seed, item.id);
  const s0 = startOf(item, r);
  const rects = { back: pageRect('back', W, L), base: pageRect('base', W, L) };
  const backArea = rects.back.w * rects.back.h;
  const total = backArea + rects.base.w * rects.base.h;
  for (let i = 0; i < CANDIDATES; i++) {
    const page: Page = r() * total < backArea ? 'back' : 'base';
    const rect = rects[page];
    const centre = { x: rect.x + r() * rect.w, y: rect.y + r() * rect.h };
    const size = item.sizeMm ?? Math.max(item.minMm, s0 - STEP_MM * Math.floor(i / STEP_EVERY));
    yield { id: item.id, icon: item.icon, page, centre, sizeMm: atLeastMin(item.icon, size) };
  }
}
