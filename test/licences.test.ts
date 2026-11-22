/** The icon licences ship in both builds (M5): `public/licences/` is copied into dist/ and dist-atomm/. */
import { existsSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { describe, expect, test } from 'vitest';
import { ICONS } from '../src/themes';

const read = (path: string) => readFileSync(new NodeURL(`../${path}`, import.meta.url), 'utf8');
const licences = read('src/themes/icons/LICENCES.md');
const PHOSPHOR_COPYRIGHT = 'Copyright (c) 2023 Phosphor Icons';
const ORIGINAL = 'Original work © 2026 Aaron Ellis, distributed with Crease Lightning';

test('public/licences/LICENCES.md matches the copy beside the icons', () => {
  expect(read('public/licences/LICENCES.md')).toBe(licences);
});

describe('every icon names its source', () => {
  test("the file carries Phosphor's MIT licence with its copyright line, and the originals notice", () => {
    expect(licences).toContain(PHOSPHOR_COPYRIGHT);
    expect(licences).toContain('Permission is hereby granted, free of charge');
    expect(licences).toContain(ORIGINAL);
  });

  test.each(ICONS.map((i) => i.id))('%s has a row naming Phosphor (MIT) or an original', (id) => {
    const icon = ICONS.find((i) => i.id === id)!;
    expect(existsSync(new NodeURL(`../src/themes/icons/${id}.svg`, import.meta.url))).toBe(true);
    const row = licences.split('\n').find((l) => l.startsWith(`| \`${id}.svg\` |`));
    expect(row, id).toBeDefined();
    if (icon.licence === 'MIT') {
      expect(row).toContain('Phosphor');
      expect(row).toContain('MIT');
    } else {
      expect(icon.licence).toBe(ORIGINAL);
      expect(row).toContain('Original');
    }
  });
});
