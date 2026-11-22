/** Zips dist-atomm/ into crease-lightning-atomm.zip (the Atomm submission). Run: npm run package:atomm. */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { zipSync } from 'fflate';

const dir = 'dist-atomm';
if (!existsSync(join(dir, 'index.html'))) throw new Error('dist-atomm/index.html is missing. Run npm run build:atomm first.');

const files = {};
const walk = (d) => {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else files[relative(dir, p).split(sep).join('/')] = new Uint8Array(readFileSync(p));
  }
};
walk(dir);
const zip = zipSync(files, { level: 9 });
writeFileSync('crease-lightning-atomm.zip', zip);
console.log(`crease-lightning-atomm.zip: ${Object.keys(files).length} files, ${(zip.length / 1024 / 1024).toFixed(2)} MB`);
