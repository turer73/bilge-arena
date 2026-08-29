import * as Sentry from '@sentry/nextjs'
import { isSensitiveTelemetryUrl } from './src/lib/privacy/telemetry-policy'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  enabled: process.env.NODE_ENV === 'production',
  beforeSend(event) {
    return isSensitiveTelemetryUrl(event.request?.url) ? null : event
  },
  beforeSendTransaction(event) {
    return isSensitiveTelemetryUrl(event.request?.url) ? null : event
  },
})
