import { harfbuzzFont } from '@kerfuffle/engine/hbFont';
import type { TextFont } from '@kerfuffle/engine/hbFont';
import { fetchFontFile, fetchFontMeta, fontFileUrls, nearestWeight } from '@kerfuffle/engine/fontSource';
import type { FontsourceMeta } from '@kerfuffle/engine/fontSource';

export interface SlabFont {
  family: string;
  weight: number;
  /** Shipped in `public/fonts/`, so it works offline. */
  bundled: boolean;
}

export const SLAB_FONTS: SlabFont[] = [
  { family: 'Alfa Slab One', weight: 400, bundled: true },
  { family: 'Arvo', weight: 700, bundled: true },
  { family: 'Roboto Slab', weight: 900, bundled: false },
  { family: 'Zilla Slab', weight: 700, bundled: false },
  { family: 'Bitter', weight: 900, bundled: false },
  { family: 'Patua One', weight: 400, bundled: false },
  { family: 'Rokkitt', weight: 900, bundled: true },
  { family: 'Ultra', weight: 400, bundled: false },
];

const BUNDLED_FILES: Record<string, string> = {
  'Alfa Slab One': 'AlfaSlabOne-400.ttf',
  Arvo: 'Arvo-700.ttf',
  Rokkitt: 'Rokkitt-900.ttf',
};

export const FALLBACK_FAMILY = 'Arvo';

export interface FontSet {
  get(family: string): TextFont | undefined;
  fallback: TextFont;
}

export interface LoadFontDeps {
  fetchMeta?: (family: string) => Promise<FontsourceMeta | null>;
  fetchFile?: (url: string) => Promise<ArrayBuffer | null>;
  /** Bytes of a bundled family's file, or null if it isn't bundled or can't be read. */
  bundled?: (family: string) => Promise<ArrayBuffer | null>;
}

export interface LoadedFont {
  font: TextFont;
  usedFamily: string;
  note?: string;
}

/** Where a bundled family's file lives under `base` (the app's folder), or null if it isn't bundled. */
export function bundledFontUrl(family: string, base: string): string | null {
  const file = BUNDLED_FILES[family];
  return file ? `${base}fonts/${file}` : null;
}

/**
 * Fetches bundled files from `fonts/<file>` under `base`. The build worker passes the page's own
 * folder, because a worker resolves relative URLs against its script, not the page.
 */
export const bundledFrom =
  (base: string) =>
  async (family: string): Promise<ArrayBuffer | null> => {
    const url = bundledFontUrl(family, base);
    return url ? fetchFontFile(url) : null;
  };

const bundledFromNetwork = (family: string) => bundledFrom(import.meta.env.BASE_URL)(family);

const toFont = (bytes: ArrayBuffer | null | undefined): TextFont | null => {
  if (!bytes) return null;
  try {
    return harfbuzzFont(bytes);
  } catch {
    return null;
  }
};

/**
 * Loads a slab font: the bundled file first, then Fontsource at the listed weight (nearest the
 * font really has), then Arvo with a note. Throws only if the bundled Arvo itself can't load.
 */
export async function loadFont(family: string, text: string, deps: LoadFontDeps = {}): Promise<LoadedFont> {
  const fetchMeta = deps.fetchMeta ?? fetchFontMeta;
  const fetchFile = deps.fetchFile ?? fetchFontFile;
  const bundled = deps.bundled ?? bundledFromNetwork;

  const attempt = async (): Promise<TextFont | null> => {
    if (family in BUNDLED_FILES) return toFont(await bundled(family));
    const meta = await fetchMeta(family);
    if (!meta) return null;
    const wanted = SLAB_FONTS.find((f) => f.family === family)?.weight ?? 400;
    const weight = nearestWeight(meta.weights, wanted);
    for (const url of fontFileUrls(meta, weight, 'normal', text)) {
      const font = toFont(await fetchFile(url));
      if (font) return font;
    }
    return null;
  };

  let font: TextFont | null = null;
  try {
    font = await attempt();
  } catch {
    font = null;
  }
  if (font) return { font, usedFamily: family };

  const fallback = toFont(await bundled(FALLBACK_FAMILY));
  if (!fallback) throw new Error('The bundled fallback font Arvo could not be loaded.');
  if (family === FALLBACK_FAMILY) return { font: fallback, usedFamily: FALLBACK_FAMILY };
  return { font: fallback, usedFamily: FALLBACK_FAMILY, note: `We couldn't load ${family}, so we used Arvo.` };
}
