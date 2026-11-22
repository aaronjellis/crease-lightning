import { unzipSync } from 'fflate';
import { beforeAll, describe, expect, test } from 'vitest';
import { build, type Card } from '../src/core/build';
import { defaultParams } from '../src/core/model';
import { exportBundle, slugName } from '../src/export/bundle';
import { TARGETS } from '../src/export/targets';
import { testFonts } from './helpers/fonts';

let card: Card;
beforeAll(() => {
  card = build(defaultParams('en-US'), { fonts: testFonts() }, 'blade', { strokeCheck: false });
}, 60_000);

const names = async (id: keyof typeof TARGETS) => {
  const { blob } = exportBundle(card, TARGETS[id], { name: 'happy' });
  return Object.keys(unzipSync(new Uint8Array(await blob.arrayBuffer()))).sort();
};

describe('exportBundle', () => {
  test('Cricut bundle holds its files and no DXF', async () => {
    const n = await names('cricut');
    expect(n).toEqual(['happy-both.svg', 'happy-how-to.pdf', 'happy-inner.svg', 'happy-jacket.svg', 'happy.json']);
    expect(n.some((f) => f.endsWith('.dxf'))).toBe(false);
  });
  test('Silhouette adds a DXF; print has no SVGs', async () => {
    expect(await names('silhouette')).toContain('happy.dxf');
    const p = await names('print');
    expect(p).toEqual(['happy-how-to.pdf', 'happy-print.pdf', 'happy.json']);
    expect(p.some((f) => f.endsWith('.svg'))).toBe(false);
  });
  test('every target holds exactly its files', async () => {
    for (const id of Object.keys(TARGETS) as (keyof typeof TARGETS)[]) expect((await names(id)).length).toBe(TARGETS[id].files.length);
  });
  test('json round-trips the design and the filename names the target', async () => {
    const { blob, filename } = exportBundle(card, TARGETS.cricut, { name: 'happy' });
    expect(filename).toBe('happy-cricut.zip');
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(JSON.parse(new TextDecoder().decode(files['happy.json']))).toEqual(card.params);
  });
});

describe('slugName', () => {
  test('slugs line 1', () => {
    expect(slugName('Happy Birthday, Mary-Kate!')).toBe('happy-birthday-mary-kate');
    expect(slugName('  ')).toBe('crease-lightning-card');
    expect(slugName('!!!')).toBe('crease-lightning-card');
  });
});
