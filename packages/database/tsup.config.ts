import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/migrations/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
});
