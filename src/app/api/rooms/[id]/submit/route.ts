/**
 * POST /api/rooms/[id]/submit — submit_answer RPC wrapper
 * Sprint 1 PR3c
 *
 * Player (auth.uid()) current round'a cevap verir. Anti-cheat:
 * is_correct=NULL, points_awarded=0; reveal_round'da hesaplanir.
 * Body: { answer_value: string }
 * VOID-returning RPC.
 *
 * NOT: Codex P1 PR #38+#39 race+lockorder fix kalitim. submit hata vermiyorsa
 * round.revealed_at IS NULL altinda + room state='active' altinda + UNIQUE
 * room_id+user_id altinda RPC FOR SHARE on round + FOR SHARE on rooms ile
 * deadlock-free serialize ediliyor.
 */

import { NextResponse } from 'next/server'
import { getAuthRateLimited, parseBody } from '@/lib/rooms/api-helpers'
import { callRpc } from '@/lib/rooms/client'
import { toResponse } from '@/lib/rooms/errors'
import { submitAnswerSchema } from '@/lib/rooms/validations'
import { createRateLimiter } from '@/lib/utils/rate-limit'

// Yuksek frekans: 10 soru x 5sn min = 12/dk gercek max. 60/dk per user
// botabuse + leaderboard manipulation engeller, gercek kullanima genis margin
const ipLimiter = createRateLimiter('rooms-submit-ip', 240, 60_000)
const userLimiter = createRateLimiter('rooms-submit-user', 60, 60_000)

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthRateLimited(req, ipLimiter, userLimiter)
  if (!auth.ok) return auth.response

  const validated = await parseBody(req, submitAnswerSchema)
  if (!validated.ok) return validated.response

  const { id } = await ctx.params

  const result = await callRpc<null>(auth.jwt, 'submit_answer', {
    p_room_id: id,
    p_answer_value: validated.data.answer_value,
  })

  if (!result.ok) {
    const { body, status } = toResponse(result.error)
    return NextResponse.json(body, { status })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
