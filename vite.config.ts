// vitest/config re-exports Vite's own defineConfig with the `test` key typed.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, host: true },
  build: { target: 'es2022', sourcemap: true },

  test: {
    // Vitest defaults to 5s, which suits a web app and not a simulation: the
    // balance tests run whole matches at 60Hz and the slowest sits at ~5.7s,
    // so on the default it passes or fails depending on what else the machine
    // is doing. This is headroom, not permission to hang.
    testTimeout: 30_000,
  },
});
