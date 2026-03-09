import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Production'da %20 transaction ornekleme (maliyet kontrolu)
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  // Session replay: hata aninda kullanici deneyimini geri oynat
  replaysSessionSampleRate: 0,       // Normal oturumlari kaydetme
  replaysOnErrorSampleRate: 0.5,     // Hata olursa %50 kaydet

  // Development'ta Sentry'yi devre disi birak
  enabled: process.env.NODE_ENV === 'production',

  // Bilinen gereksiz hatalari filtrele
  ignoreErrors: [
    'ResizeObserver loop',
    'Network request failed',
    'Load failed',
    'AbortError',
    'ChunkLoadError',
  ],
})
