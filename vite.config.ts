import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { outDir: 'dist-demo' },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // material-color-utilities (test-only cross-check) uses extensionless ESM imports.
    server: { deps: { inline: ['@material/material-color-utilities'] } },
  },
});
