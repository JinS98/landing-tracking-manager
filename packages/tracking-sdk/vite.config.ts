import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'LandingTrackingSdk',
      formats: ['iife'],
      fileName: () => 'landing-tracking-sdk.iife.js',
    },
  },
});
