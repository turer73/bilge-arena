/**
 * POST /api/rooms/[id]/kick — kick_member RPC wrapper
 * Sprint 1 PR3b
 *
 * Host (auth.uid()) bir uyeyi soft-delete eder. Kicked member is_active=FALSE.
 * Body: { target_user_id: UUID }
 * VOID-returning RPC.
 */

import { NextResponse } from 'next/server'
import { getAuthAndJwt, parseBody } from '@/lib/rooms/api-helpers'
import { callRpc } from '@/lib/rooms/client'
import { toResponse } from '@/lib/rooms/errors'
import { kickMemberSchema } from '@/lib/rooms/validations'

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthAndJwt()
  if (!auth.ok) return auth.response

  const validated = await parseBody(req, kickMemberSchema)
  if (!validated.ok) return validated.response

  const { id } = await ctx.params

  const result = await callRpc<null>(auth.jwt, 'kick_member', {
    p_room_id: id,
    p_target_user_id: validated.data.target_user_id,
  })

  if (!result.ok) {
    const { body, status } = toResponse(result.error)
    return NextResponse.json(body, { status })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
