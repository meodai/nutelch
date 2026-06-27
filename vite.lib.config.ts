import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [dts({ include: ['src'], exclude: ['src/**/*.test.ts'], rollupTypes: true })],
  build: {
    outDir: 'dist',
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'nutelch',
      fileName: 'nutelch',
    },
  },
});
