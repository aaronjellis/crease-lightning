/** The decorations on a card: flat cut-through shapes on the inner sheet's pages. */

export type Page = 'back' | 'base';

/**
 * One cut-out shape. `at` pins it: `u` is the distance of its centre from the spine ÷ (W − m), and
 * `v` is (centre y − m) ÷ (L − 2m), both in [0, 1], so a pin keeps its relative spot across sizes.
 */
export interface DecorItem {
  /** Stable, for selection, undo, and the item's own scatter seed. */
  id: string;
  icon: string;
  /** The size range scatter may use, in mm. */
  minMm: number;
  maxMm: number;
  /** Set once the user resizes: fixed from then on. */
  sizeMm?: number;
  at?: { page: Page; u: number; v: number };
}

export interface Decor {
  /** The style the items came from, within the theme; null when none was picked. */
  style: string | null;
  /** The border pattern id; null when off. */
  border: string | null;
  /** The scatter seed; Shuffle changes it. */
  seed: number;
  /** In draw and placement order. */
  items: DecorItem[];
}
