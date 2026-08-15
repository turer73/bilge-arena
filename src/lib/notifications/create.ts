import type { createServiceRoleClient } from '@/lib/supabase/service-role'

export type NotificationType =
  | 'submission_approved'
  | 'submission_rejected'
  | 'error_report_rewarded'

export interface NewNotification {
  userId: string
  type: NotificationType
  title: string
  body?: string
  /** in-app deep link (örn. /arena/soru-gonder) */
  link?: string
}

/**
 * Tek bildirim yaratır (service-role ile — notifications tablosuna client
 * yazamaz, Madde 9 paterni). Bildirim akıştaki YAN ETKİ olduğundan hata
 * fırlatmaz: log'lar ve sessizce geçer (ana işlem — onay/red — bildirim
 * yazılamadı diye geri alınmamalı).
 */
export async function createNotification(
  svc: ReturnType<typeof createServiceRoleClient>,
  n: NewNotification,
): Promise<void> {
  const { error } = await svc.from('notifications').insert({
    user_id: n.userId,
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    link: n.link ?? null,
  })
  if (error) {
    console.error('[notifications] insert hatası:', error.code)
  }
}
