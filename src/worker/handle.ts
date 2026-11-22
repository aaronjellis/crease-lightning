/** What the build worker does with each message: load its own fonts (HarfBuzz runs here) and build. */
import { build } from '../core/build';
import { FontLoader } from '../core/fontLoader';
import { bundledFrom, loadFont } from '../core/fonts';
import type { FromWorker, ToWorker } from './protocol';

let fonts: FontLoader | null = null;
const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);

export async function handle(m: ToWorker): Promise<void> {
  if (m.type === 'init') {
    const bundled = bundledFrom(m.base);
    fonts = new FontLoader((family, text) => loadFont(family, text, { bundled }));
    return;
  }
  if (!fonts) return post({ type: 'failed', id: m.id, reason: 'error', message: 'The build worker was not set up.' });
  let set = fonts.setFor(m.params);
  if (!set) {
    post({ type: 'loading', id: m.id });
    try {
      set = await fonts.ensure(m.params);
    } catch (err) {
      return post({ type: 'failed', id: m.id, reason: 'fonts', message: String(err) });
    }
    post({ type: 'building', id: m.id });
  }
  try {
    post({ type: 'done', id: m.id, card: build(m.params, { fonts: set }, m.target, { strokeCheck: m.strokeCheck }) });
  } catch (err) {
    post({ type: 'failed', id: m.id, reason: 'error', message: err instanceof Error ? `${err.message}\n${err.stack}` : String(err) });
  }
}
