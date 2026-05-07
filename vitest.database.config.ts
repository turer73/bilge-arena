import { defineConfig } from 'vitest/config'

// database/ altındaki Node script testleri için ayrı config
// (frontend vitest.config.ts jsdom + React kullanıyor — burada Node env)
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['database/__tests__/**/*.test.mjs'],
    // eval-judge.mjs gerçek API çağırıyor, CI'da çalışmasın
    exclude: ['database/__tests__/eval-judge.mjs', 'node_modules/**'],
  },
})
