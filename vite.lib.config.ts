import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

// ESM + CJS for both entries: the core ('nutelch') and the HCT add-on
// ('nutelch/hct'). Code they share lands in a common chunk, so importing both
// doesn't duplicate the core. The core's UMD bundle is built separately
// (vite.lib.umd.config.ts): Vite's UMD output supports a single entry only.
export default defineConfig({
  plugins: [dts({ include: ['src'], exclude: ['src/**/*.test.ts', 'src/demo', 'src/eval'], rollupTypes: true })],
  build: {
    outDir: 'dist',
    lib: {
      entry: { nutelch: src('index.ts'), hct: src('hct/index.ts') },
      formats: ['es', 'cjs'],
      fileName: (format, name) => `${name}.${format === 'es' ? 'js' : 'cjs'}`,
    },
  },
});
