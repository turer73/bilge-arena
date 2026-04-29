/**
 * POST /api/rooms/join — join_room RPC wrapper
 * Sprint 1 PR3b
 *
 * Caller (auth.uid()) lobby state'indeki bir odaya code ile katilir.
 * Returns: room_id (UUID) - client kullaniciyi /api/rooms/[id]/... 'a yonlendirebilir.
 * RETURNS UUID (NOT VOID) - 200 + JSON body.
 *
 * NOT: Bu endpoint /[id]/ pattern disinda — code odanin id'sini bilmez,
 * code lookup ile room_id keşfedilir.
 */

import { NextResponse } from 'next/server'
import { getAuthAndJwt, parseBody } from '@/lib/rooms/api-helpers'
import { callRpc } from '@/lib/rooms/client'
import { toResponse } from '@/lib/rooms/errors'
import { joinRoomSchema } from '@/lib/rooms/validations'

export async function POST(req: Request) {
  const auth = await getAuthAndJwt()
  if (!auth.ok) return auth.response

  const validated = await parseBody(req, joinRoomSchema)
  if (!validated.ok) return validated.response

  // join_room SQL function returns UUID (string in PostgREST JSON)
  const result = await callRpc<string>(auth.jwt, 'join_room', {
    p_code: validated.data.code,
  })

  if (!result.ok) {
    const { body, status } = toResponse(result.error)
    return NextResponse.json(body, { status })
  }

  return NextResponse.json({ room_id: result.data }, { status: 200 })
}
