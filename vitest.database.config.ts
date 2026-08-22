import { defineConfig } from 'vitest/config'

// database/ altındaki Node script testleri için ayrı config
// (frontend vitest.config.ts jsdom + React kullanıyor — burada Node env)
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['database/__tests__/**/*.test.mjs'],
    exclude: ['node_modules/**'],
  },
})
