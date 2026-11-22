/** What Atomm's export hook returns: laser colours only, perforated folds unless Advanced picks a score. */
import type { Card } from '../core/build';
import { saveJson } from '../core/codec';
import { howToPdf } from './pdf';
import { slugName } from './slug';
import { pieceColours, pieceSvg, withFoldStyle } from './svg';
import { TARGETS } from './targets';

export type AtommIntent = 'download' | 'openInStudio';
export interface AtommFile {
  filename: string;
  blob: Blob;
}

/**
 * Open in Studio gets the inner and jacket SVGs, which Studio opens as editable vectors. Download adds the
 * design file and the how-to PDF. `images` are the fold-step pictures for the PDF; omit them without 3D.
 */
export function atommExportFiles(card: Card, intent: AtommIntent, images: { step: string; png: Uint8Array }[] = []): AtommFile[] {
  const name = slugName(card.params.line1);
  const target = TARGETS['xtool-laser'];
  const t = withFoldStyle(target, card.params.advanced.foldStyle);
  const svg = (piece: 'inner' | 'jacket'): AtommFile => ({
    filename: `${name}-${piece}.svg`,
    blob: new Blob([pieceSvg(card[piece], t, pieceColours(card, piece, t))], { type: 'image/svg+xml' }),
  });
  const files = [svg('inner'), svg('jacket')];
  if (intent === 'openInStudio') return files;
  files.push(
    { filename: `${name}.json`, blob: new Blob([saveJson(card.params)], { type: 'application/json' }) },
    { filename: `${name}-how-to.pdf`, blob: new Blob([howToPdf(card, t, images, name) as BlobPart], { type: 'application/pdf' }) }
  );
  return files;
}
