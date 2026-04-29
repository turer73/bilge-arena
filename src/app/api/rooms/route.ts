/**
 * POST /api/rooms — Yeni oda olustur
 * Sprint 1 PR3
 *
 * Flow:
 *   1. Panola Supabase auth.getUser() ile JWT validate
 *   2. Zod schema validation (Codex P1 PR #37 fix kalitim — auth.uid() server-side)
 *   3. Bilge-arena PostgREST RPC: create_room(p_title, p_category, ...)
 *   4. Success: { id, code } | Error: P00xx mapping
 *
 * Plan-deviation #41 (kalitim): host_id parametre olarak GONDERILMEZ — SQL
 * fonksiyonu auth.uid() kullanir. Impersonation defense layer.
 *
 * Rate limit: 5 oda/dakika per user (createRateLimiter pattern).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { createRoomSchema } from '@/lib/rooms/validations'
import { callRpc } from '@/lib/rooms/client'
import { toResponse } from '@/lib/rooms/errors'
import type { CreateRoomResponse } from '@/lib/rooms/types'

const createLimiter = createRateLimiter('rooms-create', 5, 60_000)

export async function POST(req: Request) {
  // 1) Auth (Panola Supabase JWT)
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Yetkisiz', code: 'P0001' },
      { status: 401 },
    )
  }

  // 2) Rate limit
  const rl = await createLimiter.check(user.id)
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Cok hizli istek', code: 'RATE_LIMIT' },
      { status: 429 },
    )
  }

  // 3) Body validate
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

  // 4) Get Panola JWT to forward to bilge-arena PostgREST
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return NextResponse.json(
      { error: 'JWT alinamadi (session expired?)', code: 'P0001' },
      { status: 401 },
    )
  }

  // 5) RPC create_room call
  const { title, category, difficulty, question_count, max_players, per_question_seconds, mode } =
    parsed.data

  const result = await callRpc<CreateRoomResponse>(session.access_token, 'create_room', {
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
