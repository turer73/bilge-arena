import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { challengeActionSchema } from '@/lib/validations/schemas'
import { isValidUuid } from '@/lib/utils/uuid'

const getIpLimiter = createRateLimiter('challenge-get-ip', 60, 60_000)
const getUserLimiter = createRateLimiter('challenge-get-user', 30, 60_000)

// H-150-3: PATCH rate limit (klipper review)
const patchIpLimiter = createRateLimiter('challenge-patch-ip', 30, 60_000)
const patchUserLimiter = createRateLimiter('challenge-patch-user', 10, 60_000)

// Klipper review P1: UUID validation ortak helper'a tasindi (B3 strict regex)

/**
 * GET /api/challenges/[id]
 *
 * Duello detayini + ilgili sorulari tek payload doner.
 * Sadece duelloya katilan iki kullanici (challenger / opponent) erisebilir.
 *
 * Madde 9 #9 (pentest raporu): Duello sayfasi eskiden /api/challenges (liste)
 * cagirip filter ediyordu + ayrica client'tan `.from('questions').select(*).in(...)`
 * yaparak soru detaylarini cekiyordu. Bu refactor iki cagrinin yerine tek
 * server-side endpoint koyar; client questions tablosuna dogrudan dokunmaz.
 *
 * Cache: no-store (duello durumu hizla degisebilir)
 * Rate limit: IP 60/dk + user 30/dk
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1) IP rate limit
  const ip = getClientIp(request.headers)
  const ipRl = await getIpLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  // 2) Auth
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  // 3) User rate limit
  const userRl = await getUserLimiter.check(user.id)
  if (!userRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
    )
  }

  // 4) Param validation
  const { id } = await params
  if (!id || !isValidUuid(id)) {
    return NextResponse.json({ error: 'id gecersiz' }, { status: 400 })
  }

  const admin = createServiceRoleClient()

  // 5) Duelloyu cek + katilim kontrolu (challenger veya opponent)
  const { data: challenge, error: cErr } = await admin
    .from('challenges')
    .select('*')
    .eq('id', id)
    .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
    .maybeSingle()

  if (cErr) {
    console.error('[/api/challenges/[id] GET] challenge query error:', cErr.code)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  if (!challenge) {
    return NextResponse.json({ error: 'Duello bulunamadi' }, { status: 404 })
  }

  // 6) Sorulari cek (challenge.question_ids ile)
  const questionIds: string[] = Array.isArray(challenge.question_ids) ? challenge.question_ids : []
  if (questionIds.length === 0) {
    return NextResponse.json(
      { challenge, questions: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const { data: qs, error: qErr } = await admin
    .from('questions')
    .select('*')
    .in('id', questionIds)

  if (qErr) {
    console.error('[/api/challenges/[id] GET] questions query error:', qErr.code)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  // 7) question_ids sirasini koru
  const qMap = new Map((qs ?? []).map(q => [q.id, q]))
  const orderedQuestions = questionIds
    .map(qid => qMap.get(qid))
    .filter(Boolean)

  return NextResponse.json(
    { challenge, questions: orderedQuestions },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * PATCH /api/challenges/[id] — Duello kabul/reddet
 * Body: { action: 'accept' | 'decline' }
 *
 * Rate limit: IP 30/dk + user 10/dk (H-150-3 klipper review)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1) IP rate limit
  const ip = getClientIp(req.headers)
  const ipRl = await patchIpLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  // 2) Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  // 3) User rate limit
  const userRl = await patchUserLimiter.check(user.id)
  if (!userRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
    )
  }

  // 4) Param + body validation
  const { id } = await params
  if (!id || !isValidUuid(id)) {
    return NextResponse.json({ error: 'id gecersiz' }, { status: 400 })
  }

  const body = await req.json()
  const parsed = challengeActionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Gecersiz aksiyon' }, { status: 400 })
  }
  const { action } = parsed.data

  const svc = createServiceRoleClient()

  // H-150-4: .single() → .maybeSingle() — sorgu hatalarini gizlemez
  const { data: challenge, error: cErr } = await svc
    .from('challenges')
    .select('*')
    .eq('id', id)
    .eq('opponent_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (cErr) {
    console.error('[/api/challenges/[id] PATCH] query error:', cErr.code)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  if (!challenge) {
    return NextResponse.json({ error: 'Duello bulunamadi veya zaten cevaplanmis' }, { status: 404 })
  }

  if (new Date(challenge.expires_at) < new Date()) {
    await svc.from('challenges').update({ status: 'expired' }).eq('id', id)
    return NextResponse.json({ error: 'Duellonun suresi dolmus' }, { status: 400 })
  }

  const newStatus = action === 'accept' ? 'accepted' : 'declined'
  await svc.from('challenges').update({ status: newStatus }).eq('id', id)

  return NextResponse.json({ status: newStatus })
}
