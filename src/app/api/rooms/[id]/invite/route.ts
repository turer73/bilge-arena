/**
 * POST /api/rooms/[id]/invite — email ile odaya davet
 *
 * Host (auth.uid()) bir email adresine oda kodu + katilim linki yollar.
 * - Email Zod validate (format + uzunluk)
 * - Rate limit: per user 5/dk + per IP 30/dk (spam koruma — host 50 mail
 *   bombası atmasın)
 * - Oda state lobby olmalı (active/completed odaya davet anlamsız)
 * - Host check: callerin oda host olup olmadığını RPC veya state ile dogrula
 * - Mail Resend ile gonderilir (sendEmail wrapper, audit tag template=room_invite)
 *
 * Memory: feedback_dual_rate_limit_pattern + xff_anti_spoof_helper
 */

import { NextResponse } from 'next/server'
import { getAuthRateLimited, parseBody } from '@/lib/rooms/api-helpers'
import { fetchRoomState } from '@/lib/rooms/server-fetch'
import { inviteRoomSchema } from '@/lib/rooms/validations'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { sendEmail } from '@/lib/email/send'
import { roomInviteEmail } from '@/lib/email/templates/room-invite'

// Spam koruma: host 5 davet/dk yeterli (gercek oda 2-8 oyunculu)
const ipLimiter = createRateLimiter('rooms-invite-ip', 30, 60_000)
const userLimiter = createRateLimiter('rooms-invite-user', 5, 60_000)

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthRateLimited(req, ipLimiter, userLimiter)
  if (!auth.ok) return auth.response

  const validated = await parseBody(req, inviteRoomSchema)
  if (!validated.ok) return validated.response

  const { id } = await ctx.params
  const { email } = validated.data

  // Oda state'ini cek: caller host mu, oda lobby mi
  const state = await fetchRoomState(auth.jwt, id, auth.userId)
  if (!state) {
    return NextResponse.json(
      { error: 'Oda bulunamadi veya erisim yok', code: 'P0002' },
      { status: 404 },
    )
  }

  if (state.room.state !== 'lobby') {
    return NextResponse.json(
      { error: 'Sadece lobby state odaya davet gonderilebilir', code: 'P0003' },
      { status: 400 },
    )
  }

  // Host degil ise reject (host_id RoomState'te tutulur)
  if (state.room.host_id !== auth.userId) {
    return NextResponse.json(
      { error: 'Sadece oda sahibi davet gonderebilir', code: 'P0004' },
      { status: 403 },
    )
  }

  // Host display_name member listesinden cek
  const hostMember = state.members.find((m) => m.user_id === auth.userId)
  const hostName = hostMember?.display_name || 'Bir arkadasin'

  // Mail gonder
  const { subject, html } = roomInviteEmail({
    hostName,
    roomCode: state.room.code,
    game: state.room.category,
    baseUrl: SITE_URL,
  })

  const result = await sendEmail({
    to: email,
    subject,
    html,
    template: 'room_invite',
    userId: auth.userId,
  })

  if (!result.ok) {
    console.error('[RoomInvite] mail gonderilemedi:', result.error)
    return NextResponse.json(
      { error: 'Davet gonderilemedi', code: 'EMAIL_FAILED' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, message_id: result.id }, { status: 200 })
}
