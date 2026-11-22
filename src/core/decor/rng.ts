/** Seeded random numbers for the scatter: the same seed and key give the same sequence on every machine. */

/** FNV-1a, 32-bit: a string to a seed. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 over a hash of `${seed}:${key}`: numbers in [0, 1). */
export function rng(seed: number, key: string): () => number {
  let a = hash(`${seed}:${key}`);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
