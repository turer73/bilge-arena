import * as Sentry from '@sentry/nextjs'
import { SENTRY_PRIVACY_OPTIONS, stripEventUserPii } from './src/lib/privacy/sentry-options'
import { isSensitiveTelemetryUrl } from './src/lib/privacy/telemetry-policy'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  ...SENTRY_PRIVACY_OPTIONS,

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  enabled: process.env.NODE_ENV === 'production',
  beforeSend(event) {
    return isSensitiveTelemetryUrl(event.request?.url) ? null : stripEventUserPii(event)
  },
  beforeSendTransaction(event) {
    return isSensitiveTelemetryUrl(event.request?.url) ? null : stripEventUserPii(event)
  },
})
