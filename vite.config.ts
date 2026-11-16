import { defineConfig } from 'vite';

// Relative base so the built game works from any folder or static host.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
});
