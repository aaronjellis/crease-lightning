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

  test('every Atomm SVG uses only the two Atomm colours and no banned features', async () => {
    const scored = build({ ...card.params, advanced: { ...card.params.advanced, foldStyle: 'score' } }, { fonts: testFonts() }, 'laser', { strokeCheck: false });
    const banned = [/<defs/i, /<use[\s>]/i, /transform=/i, /clipPath/i, /<mask/i, /stroke-dasharray/i, /<style/i, /class=/i];
    for (const c of [card, scored]) {
      for (const intent of ['openInStudio', 'download'] as const) {
        for (const f of atommExportFiles(c, intent).filter((x) => x.filename.endsWith('.svg'))) {
          const svg = await text(f.blob);
          const hex = new Set([...svg.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toUpperCase()));
          expect(hex.size).toBeGreaterThan(0);
          for (const h of hex) expect([ATOMM_CUT, ATOMM_ENGRAVE], f.filename).toContain(h);
          for (const re of banned) expect(svg, `${f.filename} ${re}`).not.toMatch(re);
        }
      }
    }
  });

  test('folds are perforated by default and scored when Advanced picks score', async () => {
    const inner = async (c: Card) => text(atommExportFiles(c, 'openInStudio')[0].blob);
    expect(await inner(card)).not.toContain(ATOMM_ENGRAVE);
    const scored = build({ ...card.params, advanced: { ...card.params.advanced, foldStyle: 'score' } }, { fonts: testFonts() }, 'laser', { strokeCheck: false });
    expect(await inner(scored)).toContain(ATOMM_ENGRAVE);
  });

  test("the default theme is Birthday with its first style's decorations", () => {
    const p = defaultParams('en-US');
    expect(p.theme).toBe('birthday');
    expect(p.decor.style).toBe('confetti');
    expect(p.decor.items.length).toBeGreaterThan(0);
  });
});
