/**
 * Edits on a {@link Decor}. Each returns a new decor and leaves its input untouched. All are pure
 * except `shuffle`, which draws from a random source you can pass in.
 */
import { iconById, type Theme } from '../../themes';
import type { Decor, DecorItem, Page } from './types';

/** The theme's style as a decor: its border, and its items expanded by count with ids i1, i2, … in order. */
export function decorFromStyle(theme: Pick<Theme, 'styles'>, styleId: string | null, seed: number): Decor {
  const style = styleId === null ? undefined : theme.styles.find((s) => s.id === styleId);
  if (!style) return { style: null, border: null, seed, items: [] };
  const items: DecorItem[] = [];
  for (const it of style.items) {
    for (let k = 0; k < it.count; k++) items.push({ id: `i${items.length + 1}`, icon: it.icon, minMm: it.minMm, maxMm: it.maxMm });
  }
  return { style: style.id, border: style.border, seed, items };
}

/** One past the largest `i<n>` id. */
export function nextItemId(items: DecorItem[]): string {
  let max = 0;
  for (const { id } of items) {
    const m = /^i(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `i${max + 1}`;
}

/** Appends the icon at its default size range. */
export function addItem(decor: Decor, iconId: string): Decor {
  const [minMm, maxMm] = iconById(iconId).defaultMm;
  return { ...decor, items: [...decor.items, { id: nextItemId(decor.items), icon: iconId, minMm, maxMm }] };
}

export function removeItem(decor: Decor, id: string): Decor {
  return { ...decor, items: decor.items.filter((i) => i.id !== id) };
}

const edit = (decor: Decor, id: string, f: (i: DecorItem) => DecorItem): Decor => ({
  ...decor,
  items: decor.items.map((i) => (i.id === id ? f(i) : i)),
});

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/** Pins the item at `at` (fractions of the page's usable rectangle, clamped to [0, 1]). */
export function moveItem(decor: Decor, id: string, at: { page: Page; u: number; v: number }): Decor {
  return edit(decor, id, (i) => ({ ...i, at: { page: at.page, u: clamp01(at.u), v: clamp01(at.v) } }));
}

/** Fixes the item's size. */
export function resizeItem(decor: Decor, id: string, sizeMm: number): Decor {
  return edit(decor, id, (i) => ({ ...i, sizeMm }));
}

/** Unpins every item; sizes stay. */
export function unpinAll(decor: Decor): Decor {
  return { ...decor, items: decor.items.map(({ at: _at, ...rest }) => rest) };
}

/** A new scatter seed from `random` (values in [0, 1)), never the current one. */
export function shuffle(decor: Decor, random: () => number = Math.random): Decor {
  const seed = Math.floor(random() * 2 ** 32) >>> 0;
  return { ...decor, seed: seed === decor.seed ? (seed + 1) >>> 0 : seed };
}
