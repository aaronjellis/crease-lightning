/**
 * Share links carry the whole design in `#d=…`, message text included. Analytics records the page URL,
 * so the labs wrapper takes the fragment off the URL before its analytics script loads (I4): it puts
 * `LINK_FRAGMENT_SNIPPET` in its `<head>`, ahead of the analytics loader. The app then reads the
 * stashed link with `takeLinkFragment`, and opens it as it would from the URL.
 */

/** Where the snippet leaves the fragment, on `window`. */
export const LINK_STASH = '__creaseLightningLink';

/**
 * An inline script for the wrapper's `<head>`. It runs before anything else on the page, needs no
 * build step, and does nothing on a URL without `#d=`.
 */
export const LINK_FRAGMENT_SNIPPET =
  `<script>(function(w){var h=w.location.hash;if(h.indexOf('#d=')===0){w.${LINK_STASH}=h;` +
  `w.history.replaceState(w.history.state,'',w.location.pathname+w.location.search);}})(window);</script>`;

/** The same as the snippet, for pages that run the app's own code first. */
export function stashLinkFragment(w: Window = window): void {
  const hash = w.location.hash;
  if (!hash.startsWith('#d=')) return;
  (w as unknown as Record<string, unknown>)[LINK_STASH] = hash;
  w.history.replaceState(w.history.state, '', w.location.pathname + w.location.search);
}

/** The link the page opened with: the stashed fragment if the snippet ran, else the URL's own. Read once. */
export function takeLinkFragment(w: Window = window): string {
  const store = w as unknown as Record<string, unknown>;
  const stashed = store[LINK_STASH];
  if (typeof stashed === 'string') {
    delete store[LINK_STASH];
    return stashed;
  }
  return w.location.hash;
}
