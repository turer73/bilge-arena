/**
 * POST /api/rooms/[id]/start — start_room RPC wrapper
 * Sprint 1 PR3b
 *
 * Lobby state'inden active(0) state'ine gecirir, N rounds pre-create eder.
 * VOID-returning RPC (Codex P1 PR #42 fix kalitim — 204 No Content handling).
 */

import { NextResponse } from 'next/server'
import { getAuthRateLimited, parseEmptyBody } from '@/lib/rooms/api-helpers'
import { callRpc } from '@/lib/rooms/client'
import { toResponse } from '@/lib/rooms/errors'
import { createRateLimiter } from '@/lib/utils/rate-limit'

// Start sadece host'tan gelir, normalde 1 kez per oda — 5/dk fazlasiyla yeter
const ipLimiter = createRateLimiter('rooms-start-ip', 60, 60_000)
const userLimiter = createRateLimiter('rooms-start-user', 5, 60_000)

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthRateLimited(req, ipLimiter, userLimiter)
  if (!auth.ok) return auth.response

  const empty = await parseEmptyBody(req)
  if (!empty.ok) return empty.response

  const { id } = await ctx.params

  const result = await callRpc<null>(auth.jwt, 'start_room', { p_room_id: id })

  if (!result.ok) {
    const { body, status } = toResponse(result.error)
    return NextResponse.json(body, { status })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
