/** The icon licences ship in both builds (M5): `public/licences/` is copied into dist/ and dist-atomm/. */
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { expect, test } from 'vitest';

const read = (path: string) => readFileSync(new NodeURL(`../${path}`, import.meta.url), 'utf8');

test.each(['LICENCES.md', 'LICENSE-APACHE-2.0.txt'])('public/licences/%s matches the copy beside the icons', (file) => {
  expect(read(`public/licences/${file}`)).toBe(read(`src/themes/icons/${file}`));
});
