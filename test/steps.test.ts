/**
 * Machine steps follow the card (M1, M9, M10, R32), and the how-to PDF stays small (M13).
 */
import { zlibSync } from 'fflate';
import { beforeAll, describe, expect, test } from 'vitest';
import { build, MAT_NOTE, needsBigMat, type Card } from '../src/core/build';
import { FOLD_STEPS } from '../src/core/foldSteps';
import { defaultParams, withSize, type FoldStyle, type Params } from '../src/core/model';
import { howToPdf } from '../src/export/pdf';
import { stepsFor, TARGETS, withFoldStyle, type TargetId } from '../src/export/targets';
import { testFonts } from './helpers/fonts';

const P0 = defaultParams('en-US');
const make = (p: Params) => build(p, { fonts: testFonts() }, 'blade', { strokeCheck: false });
const folded = (p: Params, foldStyle: FoldStyle): Params => ({ ...p, advanced: { ...p.advanced, foldStyle } });

let small: Card;
let a5: Card;
let shortSpine: Card;
beforeAll(() => {
  small = make(P0);
  a5 = make(withSize(P0, 'a5'));
  shortSpine = make({ ...P0, spine: 'short' });
}, 60_000);

const steps = (id: TargetId, card: Card) => stepsFor(TARGETS[id], card);

describe('Cricut (R32)', () => {
  test('score: each sheet attaches its own score, so the two sheets cut on their own mats', () => {
    expect(steps('cricut', small)).toEqual([
      'Upload `<name>-both.svg` in Design Space.',
      'Change Inner-Score and Jacket-Score to Score.',
      'Select Inner-Cut and Inner-Score and click Attach. Do the same for Jacket-Cut and Jacket-Score.',
      'Click Make it.',
    ]);
  });
  test('a card past the 12 × 12 mat adds the mat note to Make it', () => {
    expect(steps('cricut', a5).at(-1)).toBe(`Click Make it. ${MAT_NOTE}`);
  });
  test('perforated: no Score layer to change or attach (M1)', () => {
    const card = make(folded(P0, 'perforate'));
    expect(steps('cricut', card)).toEqual(['Upload `<name>-both.svg` in Design Space.', 'Click Make it.']);
  });
});

describe('the mat note follows the card, not the size name (M9)', () => {
  test('A5 and a short-spine 5 × 7 need the big mat; a long-spine 5 × 7 does not', () => {
    expect(needsBigMat(a5)).toBe(true);
    expect(needsBigMat(shortSpine)).toBe(true);
    expect(needsBigMat(small)).toBe(false);
  });
  test.each(['cricut', 'xtool-c1', 'silhouette'] as const)('%s says so when the card needs it', (id) => {
    expect(steps(id, a5).join(' ')).toContain(MAT_NOTE);
    expect(steps(id, shortSpine).join(' ')).toContain(MAT_NOTE);
    expect(steps(id, small).join(' ')).not.toContain(MAT_NOTE);
  });
  test('the laser, other cutters and print never mention a mat', () => {
    for (const id of ['xtool-laser', 'other', 'print'] as const) expect(steps(id, a5).join(' ')).not.toContain('mat');
  });
});

describe('fold style (M1)', () => {
  test('xTool laser: perforated says red lines cut; with Score, blue lines score and red lines cut', () => {
    expect(steps('xtool-laser', small)[0]).toBe('Open the SVGs in xTool Studio. Red lines cut, including the short fold perforations.');
    expect(steps('xtool-laser', make(folded(P0, 'score')))[0]).toBe('Open the SVGs in xTool Studio. Blue lines score and red lines cut.');
  });
  test('xTool C1 and Silhouette drop their Score step when perforated', () => {
    const perf = make(folded(P0, 'perforate'));
    expect(steps('xtool-c1', small)).toContain('Set the Score layer to Score and the Cut layer to Cut.');
    expect(steps('xtool-c1', perf).join(' ')).not.toMatch(/score/i);
    expect(steps('silhouette', small)).toContain('Set the SCORE layer to a light pass or the scoring tool.');
    expect(steps('silhouette', perf).join(' ')).not.toMatch(/score/i);
  });
  test('the DXF step says the units (M4)', () => {
    expect(steps('silhouette', small)[0]).toBe('Open `<name>.dxf` in Silhouette Studio. Units: millimetres.');
  });
  test('withFoldStyle is applied before the steps are written', () => {
    expect(stepsFor(withFoldStyle(TARGETS.cricut, 'perforate'), small)).toEqual(steps('cricut', make(folded(P0, 'perforate'))));
  });
});

describe('creasing is a folding step only (M10)', () => {
  test('no machine step mentions creasing; FOLD_STEPS has it once', () => {
    for (const id of Object.keys(TARGETS) as TargetId[]) expect(steps(id, small).join(' ')).not.toMatch(/crease/i);
    expect(FOLD_STEPS.filter((s) => /crease/i.test(s.text))).toHaveLength(1);
  });
  test('Other cutter gets its own cut step', () => {
    expect(steps('other', small)).toEqual(['Cut the inner sheet and the jacket from your files; the cut and score layers are separated.']);
  });
  test('the how-to PDF prints the crease step once', () => {
    const pdf = new TextDecoder('latin1').decode(howToPdf(small, TARGETS.other));
    expect(pdf.match(/Crease every/g)).toHaveLength(1);
  });
});

/** A minimal RGBA PNG encoder, for a test still like the 3D view's (transparent background). */
function png(w: number, h: number, pixel: (x: number, y: number) => [number, number, number, number]): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Uint8Array) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, w);
  new DataView(ihdr.buffer).setUint32(4, h);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array(h * (1 + 4 * w));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(pixel(x, y), y * (1 + 4 * w) + 1 + 4 * x);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) (out.set(p, o), (o += p.length));
  return out;
}

describe('how-to PDF size (M13)', () => {
  test('four 800 × 600 stills stay under 1 MB', () => {
    // A shaded card on a transparent background: what made the old PDF 5.7 MB (stored raw).
    const still = png(800, 600, (x, y) => {
      const g = (x * 7 + y * 13) % 5;
      const card = x > 150 && x < 650 && y > 100 && y < 500;
      return card ? [200 + ((x >> 3) % 40) + g, 190 + ((y >> 3) % 50) + g, 180 + (((x + y) >> 4) % 30), 255] : [0, 0, 0, 0];
    });
    const images = FOLD_STEPS.map((s) => ({ step: s.id, png: still }));
    const pdf = howToPdf(small, TARGETS.cricut, images);
    expect(pdf.length).toBeLessThan(1024 * 1024);
  });
  test('a JPEG still is embedded as JPEG', () => {
    const jpeg = Uint8Array.from(
      atob(
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
      ),
      (c) => c.charCodeAt(0)
    );
    const pdf = new TextDecoder('latin1').decode(howToPdf(small, TARGETS.cricut, [{ step: FOLD_STEPS[0].id, png: jpeg }]));
    expect(pdf).toContain('/DCTDecode');
  });
});
