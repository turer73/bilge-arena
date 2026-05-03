import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { GAMES, type GameSlug } from '@/lib/constants/games'

// Cift kalkan rate limit (auth-only endpoint icin sidebar'dan dusuk esikler):
//   1. IP limit (her hit'te ONCE): 120 req/dk
//      - Auth-only ama anon flood IP-level kesilir (auth.getUser quota'sini koru)
//      - Game page change ortalama saniyeler icinde, 120/dk fazlasiyla yetiyor
//   2. User limit (auth varsa): 60 req/dk
//      - Tek kullanicinin game/category degisimi nadir (her oyun render'inda 1)
const ipLimiter = createRateLimiter('topic-strengths-ip', 120, 60_000)
const userLimiter = createRateLimiter('topic-strengths-user', 60, 60_000)

interface AnswerWithQuestion {
  is_correct: boolean
  questions: { game: string; category: string }
}

interface TopicStrength {
  label: string
  percentage: number
}

/**
 * GET /api/profile/topic-strengths?game=<slug>
 *
 * Auth'lu kullanicinin belirli bir oyundaki konu bazli basari yuzdelerini
 * doner. Sidebar konu gucu paneli icin (game pages, sidebar render).
 *
 * Madde 9 #4 (pentest raporu): Browser->Supabase direkt cagri yerine bu proxy.
 * Eski akis: client createClient + .from('session_answers').select(...).
 * Yeni akis: server-side auth + service-role + edge cache.
 *
 * Auth zorunlu — kullanici sadece **kendi** topic strengths'ini gorebilir
 * (auth.uid() = filter, currentUserId param kabul edilmez).
 *
 * Aggregation server-side (eski client-side aggregation cok bandwidth wastes):
 *   session_answers + questions JOIN -> kategori bazli toplam/dogru ->
 *   yuzde (%X dogru) -> sirali liste.
 *
 * Cache: no-store (Codex PR #86 P1 fix). Browser HTTP cache URL-keyed; ayni
 * URL ile user A logout + user B login (60s icinde) -> user B'nin response'i
 * user A'nin cached topics'i olur. Cookie/auth degisikligi cache key'i degil.
 * Vary: Cookie alternatif ama Vercel edge cache ile karmasik. no-store en
 * acik guvenli secim, server-side query maliyeti dusuk (auth-only, low freq).
 *
 * Rate limit: IP 120/dk + user 60/dk (auth-only flow, sidebar'dan dusuk freq).
 */
export async function GET(request: NextRequest) {
  // 1. IP rate limit ONCE — anon flood auth.getUser() quota tuketmesin
  const ip = getClientIp(request.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  // 2. Auth check — yetkisiz 401
  const cookieClient = await createClient()
  const {
    data: { user },
  } = await cookieClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  // 3. User-id rate limit (auth varsa ek katman)
  const userRl = await userLimiter.check(user.id)
  if (!userRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
    )
  }

  // 4. Game param validation — sadece tanimli slug'lar
  const { searchParams } = new URL(request.url)
  const gameRaw = searchParams.get('game')
  if (!gameRaw || !(gameRaw in GAMES)) {
    return NextResponse.json({ error: 'Gecerli oyun belirtilmedi' }, { status: 400 })
  }
  const game = gameRaw as GameSlug

  // 5. Service-role query — kullanicinin kendi cevaplari, oyun bazli
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('session_answers')
    .select('is_correct, questions!inner(game, category)')
    .eq('user_id', user.id)
    .eq('questions.game', game)
    .returns<AnswerWithQuestion[]>()

  if (error) {
    console.error('[TopicStrengths] sorgu hatasi:', error.code)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { topics: [], game },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  // 6. Server-side aggregation (eski client-side aggregation'in yerine)
  const catMap = new Map<string, { total: number; correct: number }>()
  for (const row of data) {
    const q = row.questions
    if (!q?.category) continue
    if (!catMap.has(q.category)) catMap.set(q.category, { total: 0, correct: 0 })
    const stat = catMap.get(q.category)!
    stat.total++
    if (row.is_correct) stat.correct++
  }

  const topics: TopicStrength[] = Array.from(catMap.entries())
    .map(([category, stat]) => ({
      label: category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' '),
      percentage: stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0,
    }))
    .sort((a, b) => b.percentage - a.percentage)

  return NextResponse.json(
    { topics, game },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
