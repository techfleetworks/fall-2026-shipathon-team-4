import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so unit tests don't load the PWA plugin.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
