/**
 * Writes contact-sheet.svg at the repo root: every icon at its minimum height and at 30 mm, labelled with
 * id, source, licence, and a tick or cross for "one piece" and "no thin stroke". Run: npm run contact-sheet.
 */
import { writeFileSync } from 'node:fs';
import { bounds, outerCount, scale, type Poly } from '@kerfuffle/engine/geom';
import { MIN_STROKE_BLADE_MM } from '../src/core/constants';
import { thinArea } from '../src/core/text';
import { ICONS } from '../src/themes';

const PX = 3; // sheet units per mm
const CELL_W = 280;
const CELL_H = 190;
const COLS = 4;
const GAP_MM = 30;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mark = (ok: boolean) => (ok ? '✓' : '✗');
const MATERIAL_PREFIX = /^https:\/\/github\.com\/marella\/material-symbols \(Material Symbols, weight 700, rounded, filled\)/;
const shorten = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A poly as one path, y flipped so up is up, bottom-left at (x, baseY). */
function path(poly: Poly, x: number, baseY: number): string {
  return poly
    .map((c) => `M${c.map((p) => `${(x + p.x * PX).toFixed(2)} ${(baseY - p.y * PX).toFixed(2)}`).join('L')}Z`)
    .join('');
}

const cells = ICONS.map((icon, n) => {
  const ox = (n % COLS) * CELL_W;
  const oy = Math.floor(n / COLS) * CELL_H;
  const small = scale(icon.poly, icon.minHeightMm);
  const big = scale(icon.poly, 30);
  const one = outerCount(small) === 1 && outerCount(big) === 1;
  const stroke = thinArea(small, MIN_STROKE_BLADE_MM) < 0.05;
  const baseY = oy + 60 + 30 * PX;
  const wSmall = (bounds(small)?.w ?? 0) * PX;
  return [
    `<rect x="${ox + 4}" y="${oy + 4}" width="${CELL_W - 8}" height="${CELL_H - 8}" fill="none" stroke="#cccccc" stroke-width="0.5"/>`,
    `<text x="${ox + 10}" y="${oy + 20}" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="700" fill="#111111">${esc(icon.id)}</text>`,
    `<text x="${ox + 10}" y="${oy + 33}" font-family="Helvetica, Arial, sans-serif" font-size="8" fill="#333333">${esc(shorten(icon.source.replace(MATERIAL_PREFIX, 'Material Symbols 700 rounded'), 62))}</text>`,
    `<text x="${ox + 10}" y="${oy + 44}" font-family="Helvetica, Arial, sans-serif" font-size="6.5" fill="#333333">${esc(icon.licence)}</text>`,
    `<text x="${ox + 10}" y="${oy + 55}" font-family="Helvetica, Arial, sans-serif" font-size="8" fill="#333333">min ${icon.minHeightMm} mm   one piece ${mark(one)}   stroke ${mark(stroke)}</text>`,
    `<path d="${path(small, ox + 12, baseY)}" fill="${one && stroke ? '#111111' : '#d00000'}" fill-rule="evenodd"/>`,
    `<path d="${path(big, ox + 12 + wSmall + GAP_MM, baseY)}" fill="${one && stroke ? '#111111' : '#d00000'}" fill-rule="evenodd"/>`,
  ].join('\n');
});

const rows = Math.ceil(ICONS.length / COLS);
const W = COLS * CELL_W;
const H = rows * CELL_H;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n<rect width="${W}" height="${H}" fill="#ffffff"/>\n${cells.join('\n')}\n</svg>\n`;
writeFileSync(new URL('../contact-sheet.svg', import.meta.url), svg);
console.log(`Wrote contact-sheet.svg: ${ICONS.length} icons.`);
