import type { init } from '@sentry/nextjs'

type SentryInitOptions = NonNullable<Parameters<typeof init>[0]>

// Sentry MIGRATION.md "keep the v10 default" listesindeki PII basliklari.
const PII_KEY_DENYLIST = ['forwarded', '-ip', 'remote-', 'via', '-user']

/**
 * Client, server ve edge Sentry.init cagrilarinin ortak gizlilik tabani.
 *
 * - dataCollection: Sentry 11'de bos birakilirsa kullanici/IP, cerez, HTTP
 *   govdeleri ve DB sorgu verisi toplanir. Bu taban v10'un sendDefaultPii
 *   kapali davranisini aynen korur.
 * - traceLifecycle: Sentry 11 span streaming'i varsayilan yapti; o modda
 *   beforeSendTransaction hic cagrilmaz ve telemetry-policy'deki hassas rota
 *   filtresi devre disi kalir. 'static' transaction modelini ve filtreyi
 *   korur. Sentry v12'de kalkacak; o zaman filtre ignoreSpans/tracesSampler'a
 *   tasinmali.
 */
export const SENTRY_PRIVACY_OPTIONS = {
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: {
      request: { deny: [...PII_KEY_DENYLIST] },
      response: { deny: [...PII_KEY_DENYLIST] },
    },
    httpBodies: [],
    urlQueryParams: { deny: [...PII_KEY_DENYLIST] },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    graphQL: { document: false, variables: false },
  },
  traceLifecycle: 'static',
} satisfies Pick<SentryInitOptions, 'dataCollection' | 'traceLifecycle'>
