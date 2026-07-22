import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { summarizeMastery } from '@/lib/mastery/status'

const ipLimiter = createRateLimiter('mastery-map-ip', 120, 60_000)
const userLimiter = createRateLimiter('mastery-map-user', 60, 60_000)

interface OutcomeRow {
  id: string
  code: string
  game: string
  category: string
  title: string
  description: string | null
  exam_ref: string | null
}

interface StateRow {
  outcome_id: string
  attempts: number
  correct_attempts: number
  weighted_earned: number | string
  weighted_possible: number | string
  delayed_correct: number
  last_answered_at: string | null
}

/**
 * GET /api/profile/mastery?game=matematik&exam_ref=TYT
 *
 * Auth'lu kullanicinin yalniz kendi kazanım kanitini doner. Ham cevaplar ve
 * user_id sizdirilmaz; tablolara browser'dan dogrudan erisim kapali tutulur.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  const cookieClient = await createClient()
  const {
    data: { user },
  } = await cookieClient.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const userRl = await userLimiter.check(user.id)
  if (!userRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
    )
  }

  const { searchParams } = new URL(request.url)
  const gameRaw = searchParams.get('game')
  if (!gameRaw || !(gameRaw in GAMES)) {
    return NextResponse.json({ error: 'Gecerli oyun belirtilmedi' }, { status: 400 })
  }
  const game = gameRaw as GameSlug

  const examRefRaw = searchParams.get('exam_ref')
  const examRef = examRefRaw?.trim().toUpperCase() || null
  if (examRef && !/^[A-Z0-9-]{2,10}$/.test(examRef)) {
    return NextResponse.json({ error: 'Gecersiz sinav referansi' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  try {
    let outcomeQuery = supabase
      .from('curriculum_outcomes')
      .select('id, code, game, category, title, description, exam_ref')
      .eq('game', game)
      .eq('is_active', true)

    if (examRef) outcomeQuery = outcomeQuery.eq('exam_ref', examRef)

    const { data: outcomeData, error: outcomeError } = await outcomeQuery.order('sort_order', {
      ascending: true,
    })
    if (outcomeError) throw outcomeError

    const outcomes = (outcomeData ?? []) as OutcomeRow[]
    if (outcomes.length === 0) {
      return NextResponse.json(
        { game, examRef, outcomes: [], pilot: true },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const { data: stateData, error: stateError } = await supabase
      .from('user_outcome_state')
      .select('outcome_id, attempts, correct_attempts, weighted_earned, weighted_possible, delayed_correct, last_answered_at')
      .eq('user_id', user.id)
      .in('outcome_id', outcomes.map((outcome) => outcome.id))
    if (stateError) throw stateError

    const states = new Map(
      ((stateData ?? []) as StateRow[]).map((state) => [state.outcome_id, state]),
    )
    const responseOutcomes = outcomes.map((outcome) => {
      const state = states.get(outcome.id)
      const summary = summarizeMastery({
        attempts: state?.attempts ?? 0,
        correctAttempts: state?.correct_attempts ?? 0,
        weightedEarned: Number(state?.weighted_earned ?? 0),
        weightedPossible: Number(state?.weighted_possible ?? 0),
        delayedCorrect: state?.delayed_correct ?? 0,
      })

      return {
        code: outcome.code,
        title: outcome.title,
        description: outcome.description,
        game: outcome.game,
        category: outcome.category,
        examRef: outcome.exam_ref,
        ...summary,
        lastAnsweredAt: state?.last_answered_at ?? null,
      }
    })

    return NextResponse.json(
      { game, examRef, outcomes: responseOutcomes, pilot: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[MasteryMap] sorgu hatasi:', (error as { code?: string } | null)?.code)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }
}
