import * as Sentry from '@sentry/nextjs'

type CronHandler = (request: Request) => Promise<Response>

/**
 * Vercel cron route'larını izler.
 *
 * - Hata alarmı (her zaman): handler 5xx döndürür ya da istisna atarsa
 *   Sentry'ye `cron` etiketli bir hata gider. 2026-10'a kadar 5 cron'un 4'ü
 *   sessizce düşebiliyordu (derin inceleme 4.3).
 * - Kaçırılan koşu (isteğe bağlı): `SENTRY_CRON_MONITORS=1` ise Sentry Crons
 *   check-in'i gönderilir; monitör şemadaki zamanlamayla upsert edilir ve
 *   cron hiç koşmazsa Sentry uyarır. Sentry Crons monitör başına ücretli
 *   olabildiği için varsayılan kapalıdır.
 *
 * Yetkisiz istekler (yanlış ya da eksik CRON_SECRET) izlenmez: dışarıdan
 * gelen bir deneme ne "başarılı koşu" ne de alarm üretmeli.
 *
 * `disabledStatus`: route'un "özellik kapalı" için döndürdüğü durum kodu
 * (ör. lig cron'u bayrak kapalıyken 503). Bu yanıt alarm üretmez; bilinçli
 * kapalı bir özellik her koşuda hata olarak görünmemeli.
 */
export function withCronMonitor(
  slug: string,
  schedule: string,
  handler: CronHandler,
  options: { disabledStatus?: number } = {},
): CronHandler {
  return async (request) => {
    const secret = process.env.CRON_SECRET
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
      return handler(request)
    }

    const checkIns = process.env.SENTRY_CRON_MONITORS === '1'
    const checkInId = checkIns
      ? Sentry.captureCheckIn(
          { monitorSlug: slug, status: 'in_progress' },
          {
            schedule: { type: 'crontab', value: schedule },
            timezone: 'Etc/UTC',
            checkinMargin: 5,
            maxRuntime: 10,
          },
        )
      : null
    const finish = (status: 'ok' | 'error') => {
      if (checkInId) Sentry.captureCheckIn({ checkInId, monitorSlug: slug, status })
    }

    try {
      const response = await handler(request)
      if (response.status >= 500 && response.status !== options.disabledStatus) {
        Sentry.captureMessage(`[cron:${slug}] failed with HTTP ${response.status}`, {
          level: 'error',
          tags: { cron: slug },
        })
        finish('error')
      } else {
        finish('ok')
      }
      return response
    } catch (error) {
      Sentry.captureException(error, { tags: { cron: slug } })
      finish('error')
      throw error
    } finally {
      await Sentry.flush(2000)
    }
  }
}
