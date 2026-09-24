// Emit CommonJS twins of the rolled-up declarations: dist/<entry>.d.ts → .d.cts.
//   (run by `npm run build:lib`, after both Vite builds)
// The package is "type": "module", so TypeScript reads a .d.ts as ESM. A CJS
// consumer under moduleResolution node16/nodenext then can't `require` it
// (TS1479). The `require` export conditions point at these .d.cts files instead.
// The declarations only use `export declare`, which is valid in both formats, so
// a byte copy is enough.
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
for (const entry of ['nutelch', 'hct']) {
  const src = `${dist}${entry}.d.ts`;
  if (!existsSync(src)) throw new Error(`dual-types: missing ${src} — run the lib build first`);
  copyFileSync(src, `${dist}${entry}.d.cts`);
  console.log(`wrote dist/${entry}.d.cts`);
}
