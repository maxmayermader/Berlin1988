import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@berlin/shared': r('./packages/shared/src/index.ts'),
      '@berlin/engine': r('./packages/engine/src/index.ts'),
      '@berlin/ai': r('./packages/ai/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/tests/**/*.test.ts'],
    environment: 'node',
  },
});
