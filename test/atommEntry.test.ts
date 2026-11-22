// @vitest-environment happy-dom
/**
 * The Atomm page (M7, M8): it renders without waiting on the platform's language, and when the
 * platform's Export is refused because the card can't be exported, the footer says why.
 */
import { afterEach, expect, test, vi } from 'vitest';
import { EMPTY_MESSAGE_NOTE } from '../src/core/build';

const mounted = vi.hoisted(() => ({ count: 0 }));

vi.mock('../src/ui/app', () => ({
  mountApp: (root: HTMLElement) => {
    mounted.count++;
    root.innerHTML = '<div class="cl-app"><aside class="settings"></aside></div>';
    return {
      // An empty message: not exportable, with the empty-message note.
      prepareExport: async () => ({ exportable: false, notes: [{ level: 'warn', message: EMPTY_MESSAGE_NOTE }], checks: [] }),
      stepImages: async () => [],
    };
  },
}));

afterEach(() => {
  delete (window as { atomm?: unknown }).atomm;
});

test('renders at once, applies the language later, and shows why a platform export was refused', async () => {
  document.body.innerHTML = '<div id="app"></div>';
  let exportHandler: ((ctx: { intent?: string }) => unknown) | null = null;
  let answerLocale!: (code: string) => void;
  window.atomm = {
    lifecycle: { on: (_event, handler) => void (exportHandler = handler) },
    app: { getLocale: () => new Promise<string>((r) => (answerLocale = r)) },
  };

  await import('../src/entries/atomm');
  // The app is up before the platform has answered with its language.
  expect(mounted.count).toBe(1);
  expect(document.querySelector('.atomm-footer')).toBeTruthy();
  answerLocale('en-GB');
  await vi.waitFor(() => expect(document.documentElement.lang).toBe('en'));

  expect(exportHandler).toBeTruthy();
  await expect(Promise.resolve(exportHandler!({ intent: 'download' }))).rejects.toThrow(EMPTY_MESSAGE_NOTE);
  expect(document.querySelector('.atomm-footer .export-note')!.textContent).toBe(EMPTY_MESSAGE_NOTE);
});
