/** The download: one zip with everything the chosen machine needs. */
import { zipSync, strToU8 } from 'fflate';
import type { Card } from '../core/build';
import { saveJson } from '../core/codec';
import { cardDxf } from './dxf';
import { DEFAULT_NAME, slugName } from './slug';
import { howToPdf, printPdf } from './pdf';
import { bothSvg, pieceColours, pieceSvg, withFoldStyle } from './svg';
import type { Target } from './targets';

export { DEFAULT_NAME, slugName };

export function exportBundle(
  card: Card,
  target: Target,
  opts: { name: string; images?: { step: string; png: Uint8Array }[] }
): { filename: string; blob: Blob } {
  const name = slugName(opts.name);
  const t = withFoldStyle(target, card.params.advanced.foldStyle);
  const files: Record<string, Uint8Array> = {};
  for (const f of target.files) {
    if (f === 'inner-svg') files[`${name}-inner.svg`] = strToU8(pieceSvg(card.inner, t, pieceColours(card, 'inner', t)));
    else if (f === 'jacket-svg') files[`${name}-jacket.svg`] = strToU8(pieceSvg(card.jacket, t, pieceColours(card, 'jacket', t)));
    else if (f === 'both-svg') files[`${name}-both.svg`] = strToU8(bothSvg(card, t));
    else if (f === 'dxf') files[`${name}.dxf`] = strToU8(cardDxf(card, t));
    else if (f === 'print-pdf') files[`${name}-print.pdf`] = printPdf(card);
    else if (f === 'howto-pdf') files[`${name}-how-to.pdf`] = howToPdf(card, t, opts.images, name);
    else files[`${name}.json`] = strToU8(saveJson(card.params));
  }
  const zip = zipSync(files);
  return { filename: `${name}-${target.id}.zip`, blob: new Blob([zip as BlobPart], { type: 'application/zip' }) };
}
