import webpush from 'web-push'

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:iletisim@bilgearena.com'

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE)
}

export interface PushPayload {
  title: string
  body: string
  icon?: string
  url?: string
}

/**
 * Push bildirim gonderim sonucu.
 * - 'sent': basariyla gonderildi
 * - 'expired': abonelik gecersiz (410/404), DB'den silinmeli
 * - 'error': gecici hata (network, server) — abonelik sakla, sonraki firing'de tekrar dene
 */
export type PushSendResult = 'sent' | 'expired' | 'error'

/**
 * Tek bir aboneye push bildirim gonderir.
 * Caller, 'expired' donen aboneligi DB'den silmek istiyor olabilir.
 */
export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<PushSendResult> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn('[Push] VAPID keys not configured')
    return 'error'
  }

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  }

  try {
    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || '/icon-192.png',
        data: { url: payload.url || '/arena' },
      }),
    )
    return 'sent'
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode === 410 || statusCode === 404) {
      return 'expired'
    }
    console.error('[Push] Gonderim hatasi:', err)
    return 'error'
  }
}
