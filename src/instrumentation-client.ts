import * as Sentry from '@sentry/nextjs'
import { SENTRY_PRIVACY_OPTIONS } from './lib/privacy/sentry-options'
import {
  isCurrentBrowserPathSensitive,
  isSensitiveTelemetryUrl,
} from './lib/privacy/telemetry-policy'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  ...SENTRY_PRIVACY_OPTIONS,

  // Production'da %20 transaction ornekleme (maliyet kontrolu)
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  // Session replay: hata aninda kullanici deneyimini geri oynat
  replaysSessionSampleRate: 0,       // Normal oturumlari kaydetme
  replaysOnErrorSampleRate: 0,       // Hassas alan riski nedeniyle replay tamamen kapali

  // Development'ta Sentry'yi devre disi birak
  enabled: process.env.NODE_ENV === 'production',

  // Session envelopes bypass event filters. Do not collect them on any route.
  integrations: (defaults) => [
    ...defaults.filter(({ name }) => name !== 'BrowserSession' && name !== 'BrowserTracing'),
    Sentry.browserTracingIntegration({
      shouldCreateSpanForRequest: (url) => !isCurrentBrowserPathSensitive() && !isSensitiveTelemetryUrl(url),
    }),
  ],
  beforeBreadcrumb(breadcrumb) {
    if (isCurrentBrowserPathSensitive() || ['url', 'from', 'to'].some(
      (key) => typeof breadcrumb.data?.[key] === 'string' && isSensitiveTelemetryUrl(breadcrumb.data[key]),
    )) return null
    return breadcrumb
  },

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
      // Fail closed even for spans created manually or by another integration.
      || event.spans?.some((span) => [
        span.description?.replace(/^[A-Z]+\s+/, ''),
        span.data?.['url.full'], span.data?.['http.url'], span.data?.url,
      ].some((url) => typeof url === 'string' && isSensitiveTelemetryUrl(url)))
    ) {
      return null
    }
    return event
  },
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
