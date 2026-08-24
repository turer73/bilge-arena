import * as Sentry from '@sentry/nextjs'
import {
  isCurrentBrowserPathSensitive,
  isSensitiveTelemetryUrl,
} from './src/lib/privacy/telemetry-policy'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Production'da %20 transaction ornekleme (maliyet kontrolu)
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  // Session replay: hata aninda kullanici deneyimini geri oynat
  replaysSessionSampleRate: 0,       // Normal oturumlari kaydetme
  replaysOnErrorSampleRate: 0,       // Hassas alan riski nedeniyle replay tamamen kapali

  // Development'ta Sentry'yi devre disi birak
  enabled: process.env.NODE_ENV === 'production',

  // Bilinen gereksiz hatalari filtrele
  ignoreErrors: [
    'ResizeObserver loop',
    'Network request failed',
    'Load failed',
    'AbortError',
    'ChunkLoadError',
    // AdSense/reklam script hataları — bot'lar ve adblocker'lardan gelir
    'Failed to fetch',
    'googlesyndication',
    'adsbygoogle',
  ],
  // Bot/crawler'lardan gelen hataları filtrele
  beforeSend(event) {
    if (
      isCurrentBrowserPathSensitive()
      || isSensitiveTelemetryUrl(event.request?.url)
    ) {
      return null
    }
    const ua = event.request?.headers?.['User-Agent'] || ''
    if (/HeadlessChrome|bot|crawl|spider|Vercel/i.test(ua)) {
      return null
    }
    return event
  },
  beforeSendTransaction(event) {
    if (
      isCurrentBrowserPathSensitive()
      || isSensitiveTelemetryUrl(event.request?.url)
    ) {
      return null
    }
    return event
  },
})
