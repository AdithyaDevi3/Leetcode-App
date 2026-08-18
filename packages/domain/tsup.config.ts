import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    user: 'src/user.ts',
    content: 'src/content.ts',
    practice: 'src/practice.ts',
    evaluation: 'src/evaluation.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
});
