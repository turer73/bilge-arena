/**
 * POST /api/rooms — Yeni oda olustur
 * Sprint 1 PR3
 *
 * Flow:
 *   1. IP-first + user-id çift rate limit ve JWT validate
 *   2. Zod schema validation (Codex P1 PR #37 fix kalitim — auth.uid() server-side)
 *   3. Bilge-arena PostgREST RPC: create_room(p_title, p_category, ...)
 *   4. Success: { id, code } | Error: P00xx mapping
 *
 * Plan-deviation #41 (kalitim): host_id parametre olarak GONDERILMEZ — SQL
 * fonksiyonu auth.uid() kullanir. Impersonation defense layer.
 *
 * Rate limit: 20 oda/dakika per IP + 5 oda/dakika per user. IP limiti
 * auth lookup'tan önce uygulanır; anonim flood Supabase Auth kotasını tüketmez.
 */

import { NextResponse } from 'next/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { createRoomSchema } from '@/lib/rooms/validations'
import { callRpc } from '@/lib/rooms/client'
import { toResponse } from '@/lib/rooms/errors'
import type { CreateRoomResponse } from '@/lib/rooms/types'
import { getAuthRateLimited } from '@/lib/rooms/api-helpers'

const createIpLimiter = createRateLimiter('rooms-create-ip', 20, 60_000)
const createUserLimiter = createRateLimiter('rooms-create-user', 5, 60_000)

export async function POST(req: Request) {
  // 1) IP-first + authenticated user çift kalkan; helper 429'da Retry-After döner.
  const auth = await getAuthRateLimited(req, createIpLimiter, createUserLimiter)
  if (!auth.ok) return auth.response

  // 2) Body validate
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Gecersiz JSON', code: 'BAD_JSON' },
      { status: 400 },
    )
  }

  const parsed = createRoomSchema.safeParse(body)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message).join(', ')
    return NextResponse.json(
      { error: `Validation: ${issues}`, code: 'VALIDATION' },
      { status: 400 },
    )
  }

  // 3) RPC create_room call
  const { title, category, difficulty, question_count, max_players, per_question_seconds, mode } =
    parsed.data

  const result = await callRpc<CreateRoomResponse>(auth.jwt, 'create_room', {
    p_title: title,
    p_category: category,
    p_difficulty: difficulty,
    p_question_count: question_count,
    p_max_players: max_players,
    p_per_question_seconds: per_question_seconds,
    p_mode: mode,
  })

  if (!result.ok) {
    const { body: errBody, status } = toResponse(result.error)
    return NextResponse.json(errBody, { status })
  }

  return NextResponse.json(
    { id: result.data.id, code: result.data.code },
    { status: 201 },
  )
}

/**
 * Diger HTTP method'lar — ileride GET (list rooms) eklenebilir.
 * Suanda yalnizca POST.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'GET /api/rooms henuz desteklenmiyor', code: 'NOT_IMPLEMENTED' },
    { status: 501 },
  )
}
