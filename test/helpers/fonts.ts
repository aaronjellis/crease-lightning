import { readFileSync } from 'node:fs';
// Node's URL, not the DOM one: happy-dom (test/ui.test.ts) replaces the global with one that drops file: paths.
import { URL as NodeURL } from 'node:url';
import { harfbuzzFont } from '@kerfuffle/engine/hbFont';
import type { TextFont } from '@kerfuffle/engine/hbFont';
import type { FontSet } from '../../src/core/fonts';

const read = (file: string): ArrayBuffer => {
  const b = readFileSync(new NodeURL(`../../public/fonts/${file}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

export const BUNDLED_FILES: Record<string, string> = {
  'Alfa Slab One': 'AlfaSlabOne-400.ttf',
  Arvo: 'Arvo-700.ttf',
  Rokkitt: 'Rokkitt-900.ttf',
};

export const alfa: TextFont = harfbuzzFont(read(BUNDLED_FILES['Alfa Slab One']));
export const arvo: TextFont = harfbuzzFont(read(BUNDLED_FILES.Arvo));
export const rokkitt: TextFont = harfbuzzFont(read(BUNDLED_FILES.Rokkitt));

/** Reads a bundled TTF from disk, for injecting as `deps.bundled`. */
export const bundledFromDisk = async (family: string): Promise<ArrayBuffer | null> =>
  BUNDLED_FILES[family] ? read(BUNDLED_FILES[family]) : null;

/** The three bundled fonts; Arvo is the fallback. */
export function testFonts(): FontSet {
  const byFamily: Record<string, TextFont> = { 'Alfa Slab One': alfa, Arvo: arvo, Rokkitt: rokkitt };
  return { get: (family) => byFamily[family], fallback: arvo };
}
