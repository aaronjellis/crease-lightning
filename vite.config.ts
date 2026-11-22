import { defineConfig, type Plugin } from 'vitest/config';

/** The Atomm page is built from `entries/atomm.html`; the submission wants it at the zip root as `index.html`. */
const atommIndex = (): Plugin => ({
  name: 'atomm-index',
  enforce: 'post',
  generateBundle: {
    order: 'post',
    handler(_, bundle) {
      const page = bundle['atomm.html'];
      if (page) {
        page.fileName = 'index.html';
        bundle['index.html'] = page;
        delete bundle['atomm.html'];
      }
    },
  },
});

// The box engine lives in the Kerfuffle submodule; `@kerfuffle` points at its source.
// `vite build` makes the labs site (index.html); `vite build --mode atomm` makes dist-atomm/ from entries/atomm.html.
// `cover.html` (the listing cover) is a dev-only page: neither build includes it.
export default defineConfig(({ mode }) => {
  const atomm = mode === 'atomm';
  return {
    base: './',
    ...(atomm ? { root: 'entries', publicDir: '../public' } : {}),
    resolve: {
      alias: { '@kerfuffle': new URL('./kerfuffle/src', import.meta.url).pathname },
    },
    plugins: atomm ? [atommIndex()] : [],
    // HarfBuzz (text outlines) starts its WebAssembly with a top-level await.
    build: {
      target: 'es2022',
      ...(atomm ? { outDir: '../dist-atomm', emptyOutDir: true, rollupOptions: { input: 'entries/atomm.html' } } : {}),
    },
    // The build worker (R30) loads HarfBuzz, which needs a top-level await: ES module workers only.
    worker: { format: 'es' as const },
    // Pre-bundling would move HarfBuzz away from the .wasm file it loads beside itself.
    optimizeDeps: { exclude: ['harfbuzzjs'] },
    // Kerfuffle's own tests run in Kerfuffle; these are the generator's.
    test: { environment: 'node', include: ['test/**/*.test.ts'], setupFiles: ['test/helpers/yield.ts'] },
  };
});
