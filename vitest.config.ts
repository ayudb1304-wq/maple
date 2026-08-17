import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // Vite resolves the "browser" condition, so `server-only` would resolve to
      // the build whose whole job is to throw. Provider modules keep the guard
      // for the real bundler; here it is a no-op.
      'server-only': path.resolve(__dirname, 'test/stubs/server-only.ts'),
    },
  },
});
