/**
 * Writes contact-sheet.svg at the repo root: every icon at its minimum height and at 30 mm, as the hole
 * it cuts (dark) in the paper (light), labelled with id, name, source, groups, and a tick or cross for
 * "sheet stays one piece", "no paper island", and "no thin stroke". Run: npm run contact-sheet.
 */
import { writeFileSync } from 'node:fs';
import { bounds, difference, outerCount, scale, type Poly } from '@kerfuffle/engine/geom';
import { MIN_STROKE_BLADE_MM } from '../src/core/constants';
import { thinArea } from '../src/core/text';
import { ICONS } from '../src/themes';

const PX = 3; // sheet units per mm
const CELL_W = 340;
const CELL_H = 190;
const COLS = 6;
const GAP_MM = 30;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mark = (ok: boolean) => (ok ? '✓' : '✗');
const PHOSPHOR_PREFIX = /^https:\/\/github\.com\/phosphor-icons\/core \(Phosphor Icons 2\.1\.1, fill weight\): /;
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
  // The sheet stays one piece when the icon is cut from it, and no paper detail inside floats.
  const sb = bounds(small)!;
  const sheet = difference([[{ x: sb.x - 5, y: sb.y - 5 }, { x: sb.x + sb.w + 5, y: sb.y - 5 }, { x: sb.x + sb.w + 5, y: sb.y + sb.h + 5 }, { x: sb.x - 5, y: sb.y + sb.h + 5 }]], small);
  const one = outerCount(sheet) === 1;
  const islands = small.filter((c) => !outerCount([c])).length === 0;
  const stroke = thinArea(small, MIN_STROKE_BLADE_MM) < 0.05;
  const ok = one && islands && stroke;
  const baseY = oy + 60 + 30 * PX;
  const wSmall = (bounds(small)?.w ?? 0) * PX;
  return [
    `<rect x="${ox + 4}" y="${oy + 4}" width="${CELL_W - 8}" height="${CELL_H - 8}" fill="none" stroke="#cccccc" stroke-width="0.5"/>`,
    `<rect x="${ox + 6}" y="${oy + 60}" width="${CELL_W - 12}" height="${30 * PX + 8}" fill="#f4efe4"/>`,
    `<text x="${ox + 10}" y="${oy + 20}" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="700" fill="#111111">${esc(icon.id)}<tspan font-weight="400" fill="#555555">  ${esc(icon.name)}</tspan></text>`,
    `<text x="${ox + 10}" y="${oy + 33}" font-family="Helvetica, Arial, sans-serif" font-size="8" fill="#333333">${esc(shorten(PHOSPHOR_PREFIX.test(icon.source) ? `Phosphor fill: ${icon.source.replace(PHOSPHOR_PREFIX, '')} (MIT)` : icon.source.replace('Original artwork for this project', 'Original'), 62))}</text>`,
    `<text x="${ox + 10}" y="${oy + 44}" font-family="Helvetica, Arial, sans-serif" font-size="7" fill="#333333">${esc(shorten(icon.themes.join(', '), 70))}</text>`,
    `<text x="${ox + 10}" y="${oy + 55}" font-family="Helvetica, Arial, sans-serif" font-size="8" fill="#333333">min ${icon.minHeightMm} mm   one piece ${mark(one)}   no island ${mark(islands)}   stroke ${mark(stroke)}</text>`,
    `<path d="${path(small, ox + 12, baseY)}" fill="${ok ? '#111111' : '#d00000'}" fill-rule="evenodd"/>`,
    `<path d="${path(big, ox + 12 + wSmall + GAP_MM, baseY)}" fill="${ok ? '#111111' : '#d00000'}" fill-rule="evenodd"/>`,
  ].join('\n');
});

const rows = Math.ceil(ICONS.length / COLS);
const W = COLS * CELL_W;
const H = rows * CELL_H;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n<rect width="${W}" height="${H}" fill="#ffffff"/>\n${cells.join('\n')}\n</svg>\n`;
writeFileSync(new URL('../contact-sheet.svg', import.meta.url), svg);
console.log(`Wrote contact-sheet.svg: ${ICONS.length} icons.`);
