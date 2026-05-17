import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { GAME_SLUGS } from '@/lib/constants/games'

const ipLimiter = createRateLimiter('profile-difficulty-ip', 120, 60_000)
const userLimiter = createRateLimiter('profile-difficulty-user', 60, 60_000)

const VALID_GAMES = new Set(GAME_SLUGS)

/**
 * GET /api/profile/difficulty?game=X&category=Y
 *
 * Auth'lu kullanicinin user_topic_progress'inden oyun/kategori bazli ortalama
 * basari hesaplayip onerilen zorluk seviyesini doner.
 *
 * Madde 9 #7 (pentest raporu): Browser->Supabase direkt cagri yerine bu proxy.
 * Eski akis: client `.from('user_topic_progress').select(...).eq('user_id', x)`.
 * Yeni akis: server-side auth + service-role + aggregation.
 *
 * Response:
 *   { difficulty: number | null }
 *
 * Basari -> Zorluk:
 *   %0-30 -> 1, %30-50 -> 2, %50-70 -> 3, %70-85 -> 4, %85+ -> 5
 *   < 10 soru gorulmusse null (varsayilan zorluk kullanilsin)
 *
 * Cache: no-store (kullanici-ozel)
 * Rate limit: IP 120/dk + user 60/dk (quiz baslangicinda cagrilir)
 */
export async function GET(request: NextRequest) {
  // 1) IP rate limit
  const ip = getClientIp(request.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  // 2) Auth check
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  // 3) User rate limit
  const userRl = await userLimiter.check(user.id)
  if (!userRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
    )
  }

  // 4) Query param validation
  const { searchParams } = new URL(request.url)
  const game = searchParams.get('game')
  if (!game || !VALID_GAMES.has(game as never)) {
    return NextResponse.json({ error: 'Gecerli oyun belirtilmedi' }, { status: 400 })
  }
  const category = searchParams.get('category') || null

  // 5) Service-role query
  const admin = createServiceRoleClient()
  let query = admin
    .from('user_topic_progress')
    .select('questions_seen, correct')
    .eq('user_id', user.id)
    .eq('game', game)

  if (category) query = query.eq('category', category)

  const { data, error } = await query

  if (error) {
    console.error('[/api/profile/difficulty] query error:', error.code)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { difficulty: null },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const totalSeen = data.reduce((sum, row) => sum + (row.questions_seen || 0), 0)
  const totalCorrect = data.reduce((sum, row) => sum + (row.correct || 0), 0)

  if (totalSeen < 10) {
    return NextResponse.json(
      { difficulty: null },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const accuracy = (totalCorrect / totalSeen) * 100
  let difficulty: number
  if (accuracy >= 85) difficulty = 5
  else if (accuracy >= 70) difficulty = 4
  else if (accuracy >= 50) difficulty = 3
  else if (accuracy >= 30) difficulty = 2
  else difficulty = 1

  return NextResponse.json(
    { difficulty },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
