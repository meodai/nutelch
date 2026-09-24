import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// UMD bundle of the core entry only (global `nutelch`), unchanged from before the
// HCT entry existed. Runs after vite.lib.config.ts, so it must not wipe dist/.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'nutelch',
      fileName: 'nutelch',
      formats: ['umd'],
    },
  },
});
