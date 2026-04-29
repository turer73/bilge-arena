/**
 * POST /api/rooms/[id]/reveal — reveal_round RPC wrapper
 * Sprint 1 PR3c
 *
 * Host (auth.uid()) current round'u acar. State active->reveal,
 * answers'larin is_correct + points_awarded hesaplanir, member.score guncellenir.
 * Linear decay score formula (plan-deviation #43): instant=1000, deadline=0.
 * Idempotent: revealed_at IS NOT NULL ise sadece state sync.
 * VOID-returning RPC.
 */

import { NextResponse } from 'next/server'
import { getAuthAndJwt, parseEmptyBody } from '@/lib/rooms/api-helpers'
import { callRpc } from '@/lib/rooms/client'
import { toResponse } from '@/lib/rooms/errors'

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthAndJwt()
  if (!auth.ok) return auth.response

  const empty = await parseEmptyBody(req)
  if (!empty.ok) return empty.response

  const { id } = await ctx.params

  const result = await callRpc<null>(auth.jwt, 'reveal_round', {
    p_room_id: id,
  })

  if (!result.ok) {
    const { body, status } = toResponse(result.error)
    return NextResponse.json(body, { status })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
