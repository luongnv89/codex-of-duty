import { defineConfig } from 'vite';

// `base: './'` is load-bearing: it makes dist/ portable, so the same build runs
// at a domain root, under /games/{slug}/ on a static host, or from a zip.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    // Phaser is ~1.2MB minified. That is the framework, not a mistake, so the
    // warning is raised rather than left to cry wolf on every single build.
    chunkSizeWarningLimit: 2000,
  },
  // --host on both so a phone on the same wifi can open the game and the touch
  // controls get tested on real hardware instead of in a simulator.
  server: { host: true },
  preview: { host: true },
});
