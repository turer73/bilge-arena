/**
 * POST /api/rooms/[id]/cancel — cancel_room RPC wrapper
 * Sprint 1 PR3b
 *
 * Host (auth.uid()) odayi iptal eder. State 'completed', audit_log
 * 'room_canceled' action ile distinguish.
 * Body: { reason: string } (default 'host_canceled')
 * VOID-returning RPC.
 */

import { NextResponse } from 'next/server'
import { getAuthAndJwt, parseBody } from '@/lib/rooms/api-helpers'
import { callRpc } from '@/lib/rooms/client'
import { toResponse } from '@/lib/rooms/errors'
import { cancelRoomSchema } from '@/lib/rooms/validations'

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthAndJwt()
  if (!auth.ok) return auth.response

  const validated = await parseBody(req, cancelRoomSchema)
  if (!validated.ok) return validated.response

  const { id } = await ctx.params

  const result = await callRpc<null>(auth.jwt, 'cancel_room', {
    p_room_id: id,
    p_reason: validated.data.reason,
  })

  if (!result.ok) {
    const { body, status } = toResponse(result.error)
    return NextResponse.json(body, { status })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
