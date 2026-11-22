/** Dev-only: renders the Atomm listing cover, the Birthday card open at 90 degrees, 1600 x 1200 (4:3). */
import { build } from '../core/build';
import { loadFont } from '../core/fonts';
import { defaultParams } from '../core/model';
import { FontLoader } from '../ui/context';
import { CardScene } from '../view3d/scene';

const status = document.getElementById('status') as HTMLElement;
const out = document.getElementById('out') as HTMLElement;

async function main() {
  const params = defaultParams('en-US');
  const set = await new FontLoader(loadFont).ensure(params);
  const card = build(params, { fonts: set }, 'laser', { strokeCheck: false });
  const scene = new CardScene(document.createElement('canvas'));
  scene.setCard(card);
  const png = await scene.renderPng(1600, 1200, 90, 'three-quarter');
  scene.dispose();
  const url = URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' }));
  const img = Object.assign(document.createElement('img'), { src: url, alt: 'The Birthday card open at 90 degrees' });
  const a = Object.assign(document.createElement('a'), { href: url, download: 'crease-lightning-cover.png', textContent: 'Download crease-lightning-cover.png' });
  out.replaceChildren(a, img);
  status.textContent = 'Done. 1600 x 1200.';
}
main().catch((e) => {
  status.textContent = `Failed: ${e instanceof Error ? e.message : e}`;
});
