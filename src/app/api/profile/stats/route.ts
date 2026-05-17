import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'

const ipLimiter = createRateLimiter('profile-stats-ip', 60, 60_000)
const userLimiter = createRateLimiter('profile-stats-user', 20, 60_000)

interface AnswerWithQuestion {
  is_correct: boolean
  questions: { game: string; category: string } | null
}

interface CategoryStat {
  category: string
  total: number
  correct: number
  percentage: number
}

interface GameStat {
  game: string
  total: number
  correct: number
  percentage: number
  categories: CategoryStat[]
}

interface RecentGame {
  id: string
  game: string
  mode: string
  correct_count: number
  total_questions: number
  total_xp: number
  completed_at: string | null
}

/**
 * GET /api/profile/stats
 *
 * Auth'lu kullanicinin oyun/kategori bazli basari istatistiklerini ve
 * son 10 oyununu doner. Profile sayfasi acilisinda cagrilir.
 *
 * Madde 9 #7 (pentest raporu): Browser->Supabase direkt cagri yerine bu proxy.
 * Eski akis: client `.from('session_answers').select(...,questions!inner)` JOIN +
 *           `.from('game_sessions').select(...)` paralel.
 * Yeni akis: server-side auth + service-role + aggregation server'da.
 *
 * Auth zorunlu — sadece kendi statslarini gorebilir.
 * Cache: no-store (kullanici-ozel, anlik degisken)
 * Rate limit: IP 60/dk + user 20/dk (profile sayfasi acilisi cok sik degil)
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

  // 4) Service-role: paralel cevaplar + son oyunlar
  const admin = createServiceRoleClient()
  const [answersRes, sessionsRes] = await Promise.all([
    admin
      .from('session_answers')
      .select('is_correct, questions!inner(game, category)')
      .eq('user_id', user.id)
      .returns<AnswerWithQuestion[]>(),
    admin
      .from('game_sessions')
      .select('id, game, mode, correct_count, total_questions, total_xp, completed_at')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(10),
  ])

  if (answersRes.error) {
    console.error('[/api/profile/stats] answers query error:', answersRes.error.code)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  // 5) Server-side aggregation — oyun + kategori bazli
  const gameMap = new Map<string, Map<string, { total: number; correct: number }>>()

  for (const row of answersRes.data ?? []) {
    const q = row.questions
    if (!q?.game || !q?.category) continue

    if (!gameMap.has(q.game)) gameMap.set(q.game, new Map())
    const catMap = gameMap.get(q.game)!

    if (!catMap.has(q.category)) catMap.set(q.category, { total: 0, correct: 0 })
    const stat = catMap.get(q.category)!

    stat.total++
    if (row.is_correct) stat.correct++
  }

  const gameStats: GameStat[] = []
  for (const [game, catMap] of gameMap.entries()) {
    let gameTotal = 0
    let gameCorrect = 0
    const categories: CategoryStat[] = []

    for (const [category, stat] of catMap.entries()) {
      const percentage = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0
      categories.push({ category, total: stat.total, correct: stat.correct, percentage })
      gameTotal += stat.total
      gameCorrect += stat.correct
    }

    categories.sort((a, b) => b.percentage - a.percentage)

    gameStats.push({
      game,
      total: gameTotal,
      correct: gameCorrect,
      percentage: gameTotal > 0 ? Math.round((gameCorrect / gameTotal) * 100) : 0,
      categories,
    })
  }

  gameStats.sort((a, b) => b.total - a.total)

  // 6) Son oyunlar
  const recentGames: RecentGame[] = (sessionsRes.data ?? []).map((s) => ({
    id: s.id,
    game: s.game as string,
    mode: s.mode ?? 'classic',
    correct_count: s.correct_count ?? 0,
    total_questions: s.total_questions ?? 0,
    total_xp: s.total_xp ?? 0,
    completed_at: s.completed_at,
  }))

  return NextResponse.json(
    { gameStats, recentGames },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
