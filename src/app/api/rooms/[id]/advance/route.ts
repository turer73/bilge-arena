/**
 * POST /api/rooms/[id]/advance — advance_round RPC wrapper
 * Sprint 1 PR3c
 *
 * Host (auth.uid()) state'i ilerletir. Three transitions:
 *   - active(0) -> active(1): start first round
 *   - reveal(N<count) -> active(N+1): next round
 *   - reveal(N=count) -> completed: game over
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

  const result = await callRpc<null>(auth.jwt, 'advance_round', {
    p_room_id: id,
  })

  if (!result.ok) {
    const { body, status } = toResponse(result.error)
    return NextResponse.json(body, { status })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
