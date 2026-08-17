import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/logger.ts', 'src/tracing.ts', 'src/metrics.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});
