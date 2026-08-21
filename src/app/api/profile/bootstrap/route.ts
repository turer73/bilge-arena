import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { userHasPlatformAdminAccess } from '@/lib/supabase/platform-access'

// Limitler stats ile ayni (en agir sorgu stats) — H3
const ipLimiter = createRateLimiter('profile-bootstrap-ip', 60, 60_000)
const userLimiter = createRateLimiter('profile-bootstrap-user', 20, 60_000)

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
 * GET /api/profile/bootstrap
 *
 * Profile + istatistikleri tek seferde doner (H3 — 2 round-trip → 1).
 * Profil sayfasinda kullanilir: auth.getUser() + 3 sorgu paralel.
 *
 * Donus: { profile, isAdmin, gameStats, recentGames }
 *
 * Rate limit: IP 60/dk + user 20/dk (stats ile ayni)
 * Cache: no-store (kullanici-ozel, anlik)
 */
export async function GET(request: NextRequest) {
  // 1) IP rate limit — auth.getUser quota'sini koru
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

  // 4) Paralel: profile + gerçek platform admin izni + cevaplar + oturumlar
  const admin = createServiceRoleClient()
  const [profileRes, isAdmin, answersRes, sessionsRes] = await Promise.all([
    admin.from('profiles').select('*').eq('id', user.id).single(),
    userHasPlatformAdminAccess(admin, user.id),
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

  if (profileRes.error || !profileRes.data) {
    console.error('[/api/profile/bootstrap] profile error:', profileRes.error?.code)
    return NextResponse.json({ error: 'Profil bulunamadi' }, { status: 404 })
  }

  if (answersRes.error) {
    console.error('[/api/profile/bootstrap] answers error:', answersRes.error.code)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  // 5) Server-side aggregation (stats route ile ayni mantik)
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
    { profile: profileRes.data, isAdmin, gameStats, recentGames },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
