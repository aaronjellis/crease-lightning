import { beforeAll, describe, expect, test } from 'vitest';
import { build, type Card } from '../src/core/build';
import { ATOMM_CUT, ATOMM_ENGRAVE } from '../src/core/constants';
import { defaultParams } from '../src/core/model';
import { atommExportFiles } from '../src/export/atomm';
import { testFonts } from './helpers/fonts';

let card: Card;
beforeAll(() => {
  card = build(defaultParams('en-US'), { fonts: testFonts() }, 'laser', { strokeCheck: false });
}, 60_000);

const text = (b: Blob) => b.text();

describe('atommExportFiles', () => {
  test('Open in Studio returns exactly the inner and jacket SVGs', () => {
    const files = atommExportFiles(card, 'openInStudio');
    expect(files.map((f) => f.filename)).toEqual(['happy-birthday-inner.svg', 'happy-birthday-jacket.svg']);
    expect(files.every((f) => f.blob.type === 'image/svg+xml')).toBe(true);
  });

  test('Download adds the design file and the how-to PDF', () => {
    const files = atommExportFiles(card, 'download');
    expect(files).toHaveLength(4);
    expect(files.map((f) => f.filename).sort()).toEqual([
      'happy-birthday-how-to.pdf',
      'happy-birthday-inner.svg',
      'happy-birthday-jacket.svg',
      'happy-birthday.json',
    ]);
  });

  test('every SVG uses only the two Atomm colours', async () => {
    for (const f of atommExportFiles(card, 'download').filter((x) => x.filename.endsWith('.svg'))) {
      const colours = new Set([...(await text(f.blob)).matchAll(/stroke="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toUpperCase()));
      expect(colours.size).toBeGreaterThan(0);
      for (const c of colours) expect([ATOMM_CUT, ATOMM_ENGRAVE]).toContain(c);
    }
  });

  test('folds are perforated by default and scored when Advanced picks score', async () => {
    const inner = async (c: Card) => text(atommExportFiles(c, 'openInStudio')[0].blob);
    expect(await inner(card)).not.toContain(ATOMM_ENGRAVE);
    const scored = build({ ...card.params, advanced: { ...card.params.advanced, foldStyle: 'score' } }, { fonts: testFonts() }, 'laser', { strokeCheck: false });
    expect(await inner(scored)).toContain(ATOMM_ENGRAVE);
  });

  test('the default theme is Birthday with accents and motifs on', () => {
    const p = defaultParams('en-US');
    expect(p.theme).toBe('birthday');
    expect(p.accents).toBe(true);
    expect(p.motifs).toBe(true);
  });
});
