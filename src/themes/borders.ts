/**
 * Border patterns: one small tile icon repeated along each page's three outer edges, inset by the
 * margin. Each tile is its own hole. Tile size is `sizeFrac` of the shorter page side, clamped to the
 * pattern's minimum cuttable size; tiles sit at least `gapMm` (and a web) apart.
 */
export interface Border {
  id: string;
  name: string;
  /** The tile's icon id. */
  tile: string;
  /** Tile height as a fraction of min(W, L). */
  sizeFrac: number;
  /** The smallest tile height, in mm. */
  minMm: number;
  /** The least gap between tiles, in mm. */
  gapMm: number;
  /** An optional icon id that turns each corner. */
  corner?: string;
}

export const BORDERS: Border[] = [
  { id: 'star-row', name: 'Stars', tile: 'star', sizeFrac: 0.07, minMm: 9, gapMm: 4 },
  { id: 'heart-row', name: 'Hearts', tile: 'heart', sizeFrac: 0.07, minMm: 8, gapMm: 4 },
  { id: 'confetti-row', name: 'Confetti', tile: 'confetti', sizeFrac: 0.07, minMm: 9, gapMm: 4 },
  { id: 'snow-row', name: 'Snowflakes', tile: 'snowflake', sizeFrac: 0.1, minMm: 16, gapMm: 5 },
];

export function borderById(id: string): Border {
  const b = BORDERS.find((x) => x.id === id);
  if (!b) throw new Error(`Unknown border "${id}".`);
  return b;
}
