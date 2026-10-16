import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Next.js compile-time `server-only` paketi vitest'te yok, no-op stub
      'server-only': path.resolve(__dirname, './src/test/server-only-stub.ts'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./src/test/setup-mocks.tsx', './src/test/setup-dom.ts'],
    // Paket suresinin ~%70'i her dosyada yeniden kurulan jsdom'du. DOM'a dokunmayan .ts
    // testleri node ortaminda kosar; .tsx (bilesen) testleri jsdom'da. Istisnalar dosya
    // basinda `// @vitest-environment <ortam>` yorumuyla, gerekcesiyle birlikte yazilir.
    // Yeni bir .ts testi window/document/localStorage'a dokunan kodu sinayacaksa jsdom
    // yorumunu ekle; yoksa kod node'da sessizce sunucu dalina girebilir.
    projects: [
      { extends: true, test: { name: 'node', environment: 'node', include: ['src/**/*.{test,spec}.ts'] } },
      { extends: true, test: { name: 'jsdom', environment: 'jsdom', include: ['src/**/*.{test,spec}.tsx'] } },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/test/**',
        'src/types/**',
        'src/**/*.d.ts',
        'src/app/layout.tsx',
        'src/app/arena/layout.tsx', // layout server-component wiring (root layout gibi)
        'src/app/**/loading.tsx',
        // Prototip → gercek kod kopru demosu (noindex showcase, mock veri)
        'src/app/mobil-demo/**',
      ],
    },
  },
})
