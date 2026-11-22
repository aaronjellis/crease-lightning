import { describe, expect, test, vi } from 'vitest';
import { loadFont, SLAB_FONTS } from '../src/core/fonts';
import { bundledFromDisk, testFonts } from './helpers/fonts';

const FILE_URL = 'https://example.test/zilla.ttf';
const meta = {
  id: 'zilla-slab',
  family: 'Zilla Slab',
  weights: [300, 400, 500, 600, 700],
  styles: ['normal'],
  subsets: ['latin'],
  defSubset: 'latin',
  unicodeRange: { latin: 'U+0000-00FF' },
  variants: { '700': { normal: { latin: { url: { ttf: FILE_URL } } } } },
};

describe('SLAB_FONTS', () => {
  test('lists the eight families in order', () => {
    expect(SLAB_FONTS.map((f) => `${f.family} ${f.weight}`)).toEqual([
      'Alfa Slab One 400',
      'Arvo 700',
      'Roboto Slab 900',
      'Zilla Slab 700',
      'Bitter 900',
      'Patua One 400',
      'Rokkitt 900',
      'Ultra 400',
    ]);
    expect(SLAB_FONTS.filter((f) => f.bundled).map((f) => f.family)).toEqual(['Alfa Slab One', 'Arvo', 'Rokkitt']);
  });
});

describe('loadFont', () => {
  test('loads a bundled family without calling fetchMeta', async () => {
    const fetchMeta = vi.fn();
    const r = await loadFont('Rokkitt', 'HELLO', { fetchMeta, bundled: bundledFromDisk });
    expect(fetchMeta).not.toHaveBeenCalled();
    expect(r.usedFamily).toBe('Rokkitt');
    expect(r.note).toBeUndefined();
    expect(r.font.hasChar('H')).toBe(true);
  });

  test('loads a non-bundled family through fetchMeta and fetchFile', async () => {
    const bytes = await bundledFromDisk('Arvo');
    const fetchMeta = vi.fn(async () => meta);
    const fetchFile = vi.fn(async () => bytes);
    const r = await loadFont('Zilla Slab', 'HELLO', { fetchMeta, fetchFile, bundled: bundledFromDisk });
    expect(fetchMeta).toHaveBeenCalledWith('Zilla Slab');
    expect(fetchFile).toHaveBeenCalledWith(FILE_URL);
    expect(r.usedFamily).toBe('Zilla Slab');
    expect(r.note).toBeUndefined();
  });

  test.each([
    ['rejects', async () => { throw new Error('offline'); }],
    ['returns null', async () => null],
  ])('falls back to Arvo when fetchFile %s', async (_n, fetchFile) => {
    const r = await loadFont('Zilla Slab', 'HELLO', {
      fetchMeta: async () => meta,
      fetchFile: fetchFile as () => Promise<ArrayBuffer | null>,
      bundled: bundledFromDisk,
    });
    expect(r.usedFamily).toBe('Arvo');
    expect(r.note).toBe("We couldn't load Zilla Slab, so we used Arvo.");
    expect(r.font.hasChar('H')).toBe(true);
  });

  test('falls back to Arvo when fetchMeta rejects or finds nothing', async () => {
    for (const fetchMeta of [async () => { throw new Error('offline'); }, async () => null]) {
      const r = await loadFont('Bitter', 'HI', { fetchMeta, bundled: bundledFromDisk });
      expect(r.usedFamily).toBe('Arvo');
      expect(r.note).toBe("We couldn't load Bitter, so we used Arvo.");
    }
  });

  test('falls back when a bundled file is missing, with a note', async () => {
    const bytes = await bundledFromDisk('Arvo');
    const r = await loadFont('Rokkitt', 'HI', { bundled: async (f) => (f === 'Arvo' ? bytes : null) });
    expect(r.usedFamily).toBe('Arvo');
    expect(r.note).toBe("We couldn't load Rokkitt, so we used Arvo.");
  });

  test('loading Arvo itself never notes a fallback', async () => {
    const r = await loadFont('Arvo', 'HI', { bundled: bundledFromDisk });
    expect(r.usedFamily).toBe('Arvo');
    expect(r.note).toBeUndefined();
  });
});

describe('testFonts', () => {
  test('serves the bundled three with Arvo as fallback', () => {
    const f = testFonts();
    expect(f.get('Rokkitt')).toBeDefined();
    expect(f.get('Bitter')).toBeUndefined();
    expect(f.get('Arvo')).toBe(f.fallback);
  });
});
