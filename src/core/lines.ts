/** Text-line helpers for the fit: tidying, the saved `|` break, and the balanced auto-split. */
import type { StepDims } from './model';

/** Spaces collapsed and trimmed. */
export const tidy = (t: string): string => t.replace(/ +/g, ' ').trim();

/** `|` in line 1 is the saved line break, used when line 2 is empty. Elsewhere it reads as a space. */
export function pipeSplit(line1: string, line2: string): [string, string] {
  const i = line1.indexOf('|');
  const clean = (t: string) => t.replace(/\|/g, ' ');
  if (i < 0 || line2.trim()) return [clean(line1), clean(line2)];
  return [line1.slice(0, i), clean(line1.slice(i + 1))];
}

/** Splits at the space that makes the wider half narrowest. Null when there is no space. */
export function splitBalanced(text: string, measure: (t: string) => number): [string, string] | null {
  let best: [string, string] | null = null;
  let bestW = Infinity;
  for (let i = text.indexOf(' '); i >= 0; i = text.indexOf(' ', i + 1)) {
    const a = text.slice(0, i).trim();
    const b = text.slice(i + 1).trim();
    if (!a || !b) continue;
    const w = Math.max(measure(a), measure(b));
    if (w < bestW) [best, bestW] = [[a, b], w];
  }
  return best;
}

/** Advanced dims with undefined fields dropped, so they don't hide the defaults. */
export function definedDims(dims: StepDims | undefined): StepDims {
  const out: StepDims = {};
  if (dims?.d !== undefined) out.d = dims.d;
  if (dims?.h !== undefined) out.h = dims.h;
  if (dims?.s !== undefined) out.s = dims.s;
  return out;
}
