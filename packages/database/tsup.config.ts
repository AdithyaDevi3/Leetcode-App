import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/migrations/index.ts'],
  format: ['esm'],
  dts: process.env.TSUP_SKIP_DTS !== 'true',
  clean: true,
  sourcemap: true,
});
