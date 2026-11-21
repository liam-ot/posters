import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so tests don't load the dev-server file API
// plugin. Only pure modules are unit-tested (docs/adr/0010).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
