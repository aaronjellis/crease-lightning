import { defineConfig } from 'vitest/config';

// The box engine lives in the Kerfuffle submodule; `@kerfuffle` points at its source.
export default defineConfig({
  base: './',
  resolve: {
    alias: { '@kerfuffle': new URL('./kerfuffle/src', import.meta.url).pathname },
  },
  // HarfBuzz (text outlines) starts its WebAssembly with a top-level await.
  build: { target: 'es2022' },
  // Pre-bundling would move HarfBuzz away from the .wasm file it loads beside itself.
  optimizeDeps: { exclude: ['harfbuzzjs'] },
  // Kerfuffle's own tests run in Kerfuffle; these are the generator's.
  test: { environment: 'node', include: ['test/**/*.test.ts'], setupFiles: ['test/helpers/yield.ts'] },
});
