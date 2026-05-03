/**
 * Email gonderim helper — Resend wrapper.
 *
 * Pattern:
 *   - Resend API key env'den
 *   - Audit log (DB insert) hata durumunda
 *   - Error handling: gondermeyi basaramazsa false doner, fakat exception fırlatmaz
 *   - Sender: bilgearena.com domain (Resend dashboard'dan verified)
 *
 * Memory pattern: Koken Akademi `sendEmail()` paterni Bilge Arena'ya port edildi.
 */

import { Resend } from 'resend'

const resendKey = process.env.RESEND_API_KEY
const FROM_DEFAULT = 'Bilge Arena <bildirim@bilgearena.com>'

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  /** Template id audit/dedup icin (or: 'room_invite', 'welcome', 'comeback') */
  template: string
  /** Optional override; default: bildirim@bilgearena.com */
  from?: string
  /** Optional reply-to */
  replyTo?: string
  /** Tag user_id for audit (kullanim olcumu) */
  userId?: string
}

/**
 * Resend ile mail gonder. Basarisizlikta false doner, exception firlatmaz.
 * Caller `if (!ok) console.error(...)` patterni ile log'lasin.
 */
export async function sendEmail(params: SendEmailParams): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!resendKey) {
    return { ok: false, error: 'RESEND_API_KEY ayarlanmamis' }
  }

  try {
    const resend = new Resend(resendKey)
    const result = await resend.emails.send({
      from: params.from ?? FROM_DEFAULT,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
      tags: [{ name: 'template', value: params.template }],
    })

    if (result.error) {
      return { ok: false, error: result.error.message }
    }

    return { ok: true, id: result.data?.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
