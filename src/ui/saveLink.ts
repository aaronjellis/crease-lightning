/**
 * Save, Open, and Copy link, plus the labs autosave. Copy link puts the design in the URL fragment
 * only when clicked; when the clipboard is blocked, a selectable field shows the link instead.
 */
import { encodeLink, loadJson, saveJson } from '../core/codec';
import type { Params } from '../core/model';
import { slugName } from '../export/slug';
import { track, type Host } from './context';
import { h } from './dom';
import { ACTIONS, FILE_ERROR } from './strings';

export const AUTOSAVE_KEY = 'crease-lightning:design';

/** Local storage, or null when the browser (or Atomm's iframe) blocks it. */
export function safeStorage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    const probe = `${AUTOSAVE_KEY}:probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function readAutosave(storage: Storage | null): Params | null {
  try {
    const text = storage?.getItem(AUTOSAVE_KEY);
    if (!text) return null;
    const r = loadJson(text);
    return r.ok ? r.params : null;
  } catch {
    return null;
  }
}

export function writeAutosave(storage: Storage | null, p: Params): void {
  try {
    storage?.setItem(AUTOSAVE_KEY, saveJson(p));
  } catch {
    // Full or blocked storage: autosave is only a convenience.
  }
}

/** Saves a blob through a temporary download link. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface FileActions {
  el: HTMLElement;
  /** The link field shown when the clipboard is blocked. */
  linkField: HTMLElement;
}

export function fileActions(opts: {
  host: Host;
  params(): Params;
  open(p: Params): void;
  notify(message: string, kind: 'info' | 'error'): void;
  saveBlob(filename: string, blob: Blob): void;
}): FileActions {
  const save = h('button', { type: 'button', class: 'ghost', 'aria-label': ACTIONS.saveLabel }, ACTIONS.save);
  save.addEventListener('click', () => {
    const p = opts.params();
    opts.saveBlob(`${slugName(p.line1)}.json`, new Blob([saveJson(p)], { type: 'application/json' }));
    track('design_saved', { theme: p.theme, size: p.size });
  });

  const file = h('input', { type: 'file', accept: '.json,application/json', class: 'ph-no-capture', hidden: true, 'aria-hidden': 'true', tabindex: -1 });
  const open = h('button', { type: 'button', class: 'ghost', 'aria-label': ACTIONS.openLabel }, ACTIONS.open);
  open.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    let text = '';
    try {
      text = await f.text();
    } catch {
      text = '';
    }
    const r = loadJson(text);
    if (r.ok) {
      opts.open(r.params);
      track('design_opened', { theme: r.params.theme, size: r.params.size });
    } else opts.notify(FILE_ERROR[r.error], 'error');
  });

  // Copy link, with a selectable fallback field.
  const linkInput = h('input', { type: 'text', readonly: true, class: 'text-input ph-no-capture', id: 'cl-link', 'aria-label': ACTIONS.linkField });
  const linkField = h('div', { class: 'link-fallback', hidden: true }, h('p', { text: ACTIONS.copyFallback }), linkInput);
  linkInput.addEventListener('focus', () => linkInput.select());
  const copy = h('button', { type: 'button', class: 'ghost' }, ACTIONS.copyLink);
  copy.addEventListener('click', async () => {
    const url = location.href.split('#')[0] + encodeLink(opts.params());
    try {
      await navigator.clipboard.writeText(url);
      linkField.hidden = true;
      opts.notify(ACTIONS.copied, 'info');
      track('card_link_copied', { theme: opts.params().theme });
    } catch {
      linkInput.value = url;
      linkField.hidden = false;
      linkInput.focus();
      linkInput.select();
    }
  });

  const el = h('div', { class: 'file-actions' }, save, open, opts.host === 'labs' ? copy : null, file);
  return { el, linkField };
}
