import { defineConfig } from 'vite';

export default defineConfig({
  base: '/codex-of-duty/',
  server: {
    host: true,
    port: 3000,
  },
  build: {
    target: 'es2022',
  },
});
