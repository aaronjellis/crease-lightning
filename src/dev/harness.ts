/** Dev harness for the 3D view: the Birthday default card with an angle slider, Open, Close and Fold it. */
import { build } from '../core/build';
import { FALLBACK_FAMILY, loadFont, SLAB_FONTS, type FontSet } from '../core/fonts';
import { FOLD_STEPS } from '../core/foldSteps';
import { defaultParams } from '../core/model';
import { CardScene } from '../view3d/scene';

const $ = <E extends HTMLElement>(sel: string) => document.querySelector<E>(sel)!;
const status = $<HTMLParagraphElement>('#status');
const angle = $<HTMLInputElement>('#angle');
const angleOut = $<HTMLOutputElement>('#angle-out');

async function bundledFonts(text: string): Promise<FontSet> {
  const families = SLAB_FONTS.filter((f) => f.bundled).map((f) => f.family);
  const loaded = await Promise.all(families.map((f) => loadFont(f, text)));
  const byFamily = new Map(loaded.filter((l, i) => l.usedFamily === families[i]).map((l) => [l.usedFamily, l.font]));
  const fallback = byFamily.get(FALLBACK_FAMILY) ?? loaded[0].font;
  return { get: (family) => byFamily.get(family), fallback };
}

const scene = new CardScene($<HTMLCanvasElement>('#scene'));
scene.onTheta = (deg) => {
  angle.value = String(Math.round(deg));
  angleOut.value = `${Math.round(deg)}°`;
};

angle.addEventListener('input', () => scene.setTheta(Number(angle.value)));
$('#open').addEventListener('click', () => void scene.animateTo(90));
$('#close').addEventListener('click', () => void scene.animateTo(0));
document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) =>
  b.addEventListener('click', () => {
    const i = b.dataset.step === 'off' ? null : Number(b.dataset.step);
    scene.setFoldStep(i);
    $('#step-text').textContent = i === null ? '' : `${i + 1}. ${FOLD_STEPS[i].text}`;
  })
);
$('#png').addEventListener('click', async () => {
  const bytes = await scene.renderPng(800, 600, 90, 'three-quarter');
  const img = $<HTMLImageElement>('#still');
  img.src = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
  img.hidden = false;
});

const params = defaultParams(navigator.language);
const card = build(params, { fonts: await bundledFonts(params.line1 + params.line2) }, 'blade', { strokeCheck: false });
scene.setCard(card);
status.textContent = `${params.size}, ${card.panels.length} panels. ${card.notes.map((n) => n.message).join(' ')}`;
// For poking at the scene from devtools.
Object.assign(window, { cardScene: scene, card });
