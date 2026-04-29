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
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.tsx'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/test/**',
        'src/types/**',
        'src/**/*.d.ts',
        'src/app/layout.tsx',
        'src/app/**/loading.tsx',
      ],
    },
  },
})
