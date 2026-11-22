/**
 * The Atomm build: xTool's generator gallery. Layout 2 (themes left, settings right), Atomm's own export
 * button and `export` hook, laser colours only. Outside the platform a stand-in button saves the files.
 */
import '../ui/atomm.css';
import { atommExportFiles, type AtommFile, type AtommIntent } from '../export/atomm';
import { mountApp } from '../ui/app';
import { exportNote } from '../ui/exportState';
import { h } from '../ui/dom';
import { downloadBlob } from '../ui/saveLink';

interface AtommSdk {
  lifecycle: { on(event: 'export', handler: (ctx: { intent?: string }) => unknown): void };
  app?: { getLocale?: () => string | Promise<string> };
}
declare global {
  interface Window {
    atomm?: AtommSdk;
  }
}

/** Only English copy exists so far; any other platform language falls back to it. */
const LOCALES = ['en'];
export const pickLocale = (code: unknown): string => {
  const base = typeof code === 'string' ? code.toLowerCase().split(/[-_]/)[0] : '';
  return LOCALES.includes(base) ? base : 'en';
};

/** Gives up on a call after `ms`, so a platform that never answers can't hold up the page. */
const within = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms))]);

/** The platform's language, read once before the first render; any failure keeps English (R28). */
async function platformLocale(): Promise<string> {
  try {
    const sdk = window.atomm ?? (document.readyState === 'complete' ? undefined : await within(new Promise<AtommSdk | undefined>((r) => addEventListener('load', () => r(window.atomm), { once: true })), 1500));
    return pickLocale(await within(Promise.resolve().then(() => sdk?.app?.getLocale?.()), 1500));
  } catch {
    return 'en';
  }
}

async function main() {
  const root = document.getElementById('app');
  if (!root) return;
  document.documentElement.lang = await platformLocale();
  start(root);
}

function start(root: HTMLElement) {
  const app = mountApp(root, 'atomm');

  /** One export-ready card and its fold-step pictures, built from the design as it is now. */
  const files = async (intent: AtommIntent): Promise<AtommFile[]> => {
    const card = await app.prepareExport('laser');
    if (!card.exportable) throw new Error(exportNote(card) || "This card can't be exported yet.");
    return atommExportFiles(card, intent, intent === 'download' ? await app.stepImages().catch(() => []) : []);
  };

  // The platform's export slot sits in the settings rail footer; the button inside stands in off-platform.
  const fallback = h('button', { type: 'button', class: 'primary export-fallback', 'data-export-fallback': '' }, 'Export');
  const slot = h('div', { 'data-atomm-export-button': '' }, fallback);
  const status = h('p', { class: 'export-note', 'aria-live': 'polite' });
  root.querySelector('.settings')?.append(h('div', { class: 'atomm-footer' }, status, slot));

  fallback.addEventListener('click', async () => {
    fallback.disabled = true;
    status.textContent = '';
    try {
      const out = await files('download');
      for (const f of out) downloadBlob(f.filename, f.blob);
      status.textContent = `Saved ${out.length} files.`;
    } catch (e) {
      status.textContent = e instanceof Error ? e.message : String(e);
    } finally {
      fallback.disabled = false;
    }
  });

  const register = () =>
    window.atomm?.lifecycle?.on('export', async ({ intent }) => files(intent === 'openInStudio' ? 'openInStudio' : 'download'));
  if (window.atomm) register();
  else addEventListener('load', register, { once: true });
}

void main();
