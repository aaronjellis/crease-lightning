/**
 * Fixes the fit applies on its own, and notes it leaves. Each fix has a stable id; undoing it sets
 * `overrides[id]`, and the fit then leaves the matching warning from `undone` instead.
 */
import { RAIL_MM } from './constants';

export interface Fix {
  id: string;
  message: string;
}

export interface Note {
  level: 'info' | 'warn' | 'strong';
  message: string;
}

const NAMES: Record<string, string> = { l1: 'line 1', l2: 'line 2', a1: 'the first accent', a2: 'the second accent' };
const name = (id: string): string => NAMES[id] ?? id;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const fitFix = (id: string): Fix => ({
  id: `fit:${id}`,
  message: `${cap(name(id))} reached past the closed card or had sizes that can't fold, so we made its step smaller.`,
});

export const clearFix = (): Fix => ({
  id: 'clear:l2',
  message: 'Line 2 stood in front of line 1, so we raised line 1 and lowered line 2.',
});

export const railFix = (id: string): Fix => ({
  id: `rail:${id}`,
  message: `We widened the strip under ${name(id)} to keep ${RAIL_MM} mm rails, so the frame doesn't tear.`,
});

export const bridgeFix = (n: number, id: string): Fix => ({
  id: `bridge:${n}`,
  message: `A loose piece in ${name(id)} would fall out, so we joined it to its neighbour with a bridge.`,
});

export const accentHideFix = (): Fix => ({
  id: 'accent:hide',
  message: 'The accents left too little room for your message, so we hid them.',
});

export const fontFix = (id: string, family: string, fallback: string): Fix => ({
  id: `font:${id}`,
  message: `${family} can't draw every character in ${name(id)}, so we used ${fallback} for that line.`,
});

/** The warning left when a fix is undone. */
export function undone(fixId: string, detail = ''): Note {
  const [kind, id = ''] = fixId.split(':');
  const messages: Record<string, string> = {
    fit: `${cap(name(id))} keeps your step sizes, so the card may not close flat.`,
    clear: 'Line 2 may hide part of line 1 when you look at the open card.',
    rail: `The rails beside ${name(id)} are under ${RAIL_MM} mm and may tear.`,
    bridge: 'Without its bridge a piece would fall out, so the bridge stays.',
    accent: 'The accents stay, so your message has less room.',
    font: `We left out ${detail} in ${name(id)}; your font can't draw it.`,
  };
  return { level: 'warn', message: messages[kind] ?? `You undid ${fixId}.` };
}

export const SMALL_TEXT = 'Your message is getting small. Shorten it, use two lines, or pick a bigger card.';

export const smallNote = (level: 'warn' | 'strong'): Note => ({ level, message: SMALL_TEXT });

export const thinNote = (id: string, minStrokeMm: number): Note => ({
  level: 'strong',
  message: `Some strokes in ${name(id)} are thinner than ${minStrokeMm} mm and may tear. Try a bolder font or a bigger card.`,
});

export const oneWordNote = (word: string): Note => ({
  level: 'strong',
  message: `"${word}" is one word, so it can't split onto two lines. Shorten it or pick a bigger card.`,
});

export const droppedNote = (chars: string[]): Note => ({
  level: 'warn',
  message: `We left out ${chars.join(' ')}; it can't be cut as a pop-up.`,
});

export const fontMissingNote = (family: string, fallback: string): Note => ({
  level: 'info',
  message: `We couldn't load ${family}, so we used ${fallback}.`,
});

export const accentsDontFitNote = (): Note => ({
  level: 'warn',
  message: "The accents don't fit this card, so they're hidden.",
});
