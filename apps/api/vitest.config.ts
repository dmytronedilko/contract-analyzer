import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // esbuild (Vitest's default transform) doesn't emit decorator metadata, which Nest DI needs.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Applies migrations to TEST_DATABASE_URL for the integration suites.
    globalSetup: ['src/test/global-setup.ts'],
  },
});
