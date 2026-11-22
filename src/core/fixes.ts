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
  /** What the note is about, for code that reacts to it (the stroke check reads `thin-stroke`). */
  kind?: 'thin-stroke';
  /** A one-click remedy the Checks card offers beside the note. */
  action?: { kind: 'font'; family: string };
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

/** `widen`: rails under 5 mm grow to 5 mm. `narrow`: wide rails shrink to 5 mm so the line fits. */
export const railFix = (id: string, how: 'widen' | 'narrow' = 'widen'): Fix => ({
  id: `rail:${id}`,
  message:
    how === 'widen'
      ? `We widened the strip under ${name(id)} to keep ${RAIL_MM} mm rails, so the frame doesn't tear.`
      : `The rails left ${name(id)} no room, so we narrowed them to ${RAIL_MM} mm.`,
});

export const bridgeFix = (n: number, id: string): Fix => ({
  id: `bridge:${n}`,
  message: `A loose piece in ${name(id)} would fall out, so we joined it to its neighbour with a bridge.`,
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
    rail:
      detail === 'narrow'
        ? `${cap(name(id))} only fits with ${RAIL_MM} mm rails, so its rails stay narrowed.`
        : `The rails beside ${name(id)} are under ${RAIL_MM} mm and may tear.`,
    bridge: 'Without its bridge a piece would fall out, so the bridge stays.',
    font: `We left out ${detail} in ${name(id)}; your font can't draw it.`,
  };
  return { level: 'warn', message: messages[kind] ?? `You undid ${fixId}.` };
}

export const SMALL_TEXT = 'Your message is getting small. Shorten it, use two lines, or pick a bigger card.';

export const smallNote = (level: 'warn' | 'strong'): Note => ({ level, message: SMALL_TEXT });

export const thinNote = (id: string, minStrokeMm: number): Note => ({
  level: 'strong',
  kind: 'thin-stroke',
  message: `Some strokes in ${name(id)} are thinner than ${minStrokeMm} mm and may tear. Try a bolder font or a bigger card.`,
});

/** The heaviest bundled slab: the font the thin-stroke note offers when it would pass (R31). */
export const HEAVY_FAMILY = 'Alfa Slab One';

export const HEAVIER_FONT = `Some strokes are thin enough to tear. ${HEAVY_FAMILY} has heavier strokes, or try a bigger card.`;

/** The thin-stroke note when the same card in Alfa Slab One passes the stroke check (R31). */
export const heavierFontNote = (): Note => ({
  level: 'strong',
  kind: 'thin-stroke',
  message: HEAVIER_FONT,
  action: { kind: 'font', family: HEAVY_FAMILY },
});

export const oneWordNote = (word: string): Note => ({
  level: 'strong',
  message: `"${word}" is one word, so it can't split onto two lines. Shorten it or pick a bigger card.`,
});

export const LINE2_DROPPED =
  "Line 2 doesn't fit between these rails and this clearance, so we left it out. Narrow them in Advanced or pick a bigger card.";

export const line2DroppedNote = (): Note => ({ level: 'strong', message: LINE2_DROPPED });

export const droppedNote = (chars: string[]): Note => ({
  level: 'warn',
  message: `We left out ${chars.join(' ')}; it can't be cut as a pop-up.`,
});

export const fontMissingNote = (family: string, fallback: string): Note => ({
  level: 'info',
  message: `We couldn't load ${family}, so we used ${fallback}.`,
});

/**
 * Accents are decoration, like motifs (ruling R10): when they don't fit, they hide with this note,
 * not a fix, so there is nothing to undo.
 */
export const ACCENTS_HIDDEN = 'We left out the pop-up decorations to give your message room.';

export const accentsHiddenNote = (): Note => ({ level: 'info', message: ACCENTS_HIDDEN });
