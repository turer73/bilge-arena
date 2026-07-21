import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { GAME_SLUGS } from '@/lib/constants/games'
import { isValidUuid } from '@/lib/utils/uuid'
import { trDayString } from '@/lib/utils/tr-date'
import { fetchDueQuestions } from '@/lib/review/due-questions'
import { computeTopicStrengths } from '@/lib/review/topic-strengths'
import { composePlan } from '@/lib/study/compose-plan'
import { toPublicQuestion, type PublicQuestion } from '@/lib/utils/question-public'
import type { Question } from '@/types/database'

// Cift kalkan rate limit (topic-strengths/questions-random deseni ile ayni):
//   - IP limit her hit'te ONCE (auth.getUser quota'sini koru)
//   - User limit auth varsa ek katman
const ipLimiter = createRateLimiter('study-today-ip', 120, 60_000)
const userLimiter = createRateLimiter('study-today-user', 60, 60_000)

const VALID_GAMES = new Set(GAME_SLUGS)

const PLAN_SIZE = 15
const DUE_QUOTA = 6
const WEAK_CATEGORY_COUNT = 2
const WEAK_PER_CATEGORY = 2
const WEAK_MIN_SAMPLE = 5

/**
 * Plan icindeki soru-id'lerini SIRALI olarak tam soru satirina cevirir
 * (RPC/`.in()` sirayi korumaz, snapshot sirasi burada yeniden kurulur).
 */
async function fetchQuestionsInOrder(
  admin: ReturnType<typeof createServiceRoleClient>,
  ids: string[],
): Promise<PublicQuestion[]> {
  if (ids.length === 0) return []
  const { data } = await admin.from('questions').select('*').in('id', ids)
  const byId = new Map(((data ?? []) as Question[]).map((q) => [q.id, q]))
  return ids
    .map((id) => byId.get(id))
    .filter((q): q is Question => !!q)
    .map(toPublicQuestion)
}

/**
 * GET /api/study/today?game=<slug>
 *
 * "Bugunun 15'i" -- kullanicinin bugunku (TR takvim gunu) karma calisma
 * planini doner: varsa oldugu gibi (idempotent, gun boyu sabit snapshot),
 * yoksa uretir ve kalici olarak kaydeder (daily_plan, migration 084).
 *
 * Karma oran (composePlan, src/lib/study/compose-plan.ts): 6 FSRS-due +
 * 4 zayif-kategori + 5 yeni, kademeli doldurma (bir kova eksikse "yeni"ye
 * devrolur). FSRS due dogrudan computeDueMap'e dayanir (FEATURES.FSRS_REVIEW
 * flag'inden BAGIMSIZ -- bu flag genel quiz review-karisiminin rollout
 * anahtari, gunluk plan ayri/yeni bir yuzey).
 *
 * Auth zorunlu. Cache: no-store (kullaniciya ozel).
 */
export async function GET(request: NextRequest) {
  // 1) IP rate limit ONCE — anon flood auth.getUser() quota tuketmesin
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

  // 4) Game param validation
  const { searchParams } = new URL(request.url)
  const game = searchParams.get('game')
  if (!game || !VALID_GAMES.has(game as never)) {
    return NextResponse.json({ error: 'Gecerli oyun belirtilmedi' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const planDate = trDayString()

  // 5) Bugunku plan zaten var mi? (idempotent -- gun boyu sabit snapshot)
  const { data: existing } = await admin
    .from('daily_plan')
    .select('*')
    .eq('user_id', user.id)
    .eq('game', game)
    .eq('plan_date', planDate)
    .maybeSingle()

  if (existing) {
    const questions = await fetchQuestionsInOrder(admin, existing.question_ids as string[])
    return NextResponse.json(
      {
        planDate: existing.plan_date,
        game,
        questions,
        completedIds: (existing.completed_ids as string[]) ?? [],
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  // 6) Yok -- uret. 6a) FSRS-due (computeDueMap uzerinden, flag'siz).
  const dueQuestions = await fetchDueQuestions(admin, user.id, game)
  const dueIds = dueQuestions.slice(0, DUE_QUOTA).map((q) => q.id)

  const selected = new Set<string>(dueIds)

  // 6b) Zayif-kategori (min orneklem total>=5, en dusuk basari yuzdesine
  // sahip 2 kategori, her birinden ~2 soru). Aggregation hatasi olursa
  // (yeni kullanici / sorgu hatasi) sessizce atlanir -- slotlar "yeni"ye devrolur.
  const weakIds: string[] = []
  try {
    const strengths = await computeTopicStrengths(admin, user.id, game)
    const weakCategories = strengths
      .filter((s) => s.total >= WEAK_MIN_SAMPLE)
      .sort((a, b) => a.percentage - b.percentage)
      .slice(0, WEAK_CATEGORY_COUNT)

    for (const wc of weakCategories) {
      const excludeIds = Array.from(selected)
      const { data } = await admin.rpc('select_random_questions', {
        p_game: game,
        p_limit: WEAK_PER_CATEGORY,
        p_category: wc.category,
        ...(excludeIds.length > 0 ? { p_exclude_ids: excludeIds } : {}),
      })
      for (const row of (data ?? []) as Question[]) {
        if (!selected.has(row.id)) {
          selected.add(row.id)
          weakIds.push(row.id)
        }
      }
    }
  } catch (e) {
    console.error('[/api/study/today] zayif-kategori hesaplama hatasi, atlaniyor:', e)
  }

  // 6c) Yeni sorular -- kalan TUM slotlari doldurur (kademeli doldurma).
  // excludeIds: su ana kadar secilenler + kullanicinin son gordugu 50 soru
  // (questions/random ile ayni cooldown deseni).
  const kalan = PLAN_SIZE - dueIds.length - weakIds.length
  let newIds: string[] = []
  if (kalan > 0) {
    const { data: historyRows } = await admin
      .from('user_question_history')
      .select('question_id')
      .eq('user_id', user.id)
      .order('last_seen_at', { ascending: false })
      .limit(50)

    const historyIds = ((historyRows ?? []) as { question_id: string }[])
      .map((h) => h.question_id)
      .filter((id) => isValidUuid(id))

    const excludeIds = Array.from(new Set([...selected, ...historyIds])).slice(0, 50)

    const { data: newData } = await admin.rpc('select_random_questions', {
      p_game: game,
      p_limit: kalan,
      ...(excludeIds.length > 0 ? { p_exclude_ids: excludeIds } : {}),
    })
    newIds = ((newData ?? []) as Question[]).map((q) => q.id)
  }

  const questionIds = composePlan({ dueIds, weakIds, newIds, size: PLAN_SIZE })

  // 7) Kaydet -- ayni gun icin es-zamanli iki GET yarisirsa (UNIQUE ihlali),
  // ikinci istek kendi ürettigini atip DB'deki gercek satiri okur (idempotent).
  const { data: inserted, error: insertError } = await admin
    .from('daily_plan')
    .insert({
      user_id: user.id,
      game,
      plan_date: planDate,
      question_ids: questionIds,
      completed_ids: [],
    })
    .select('*')
    .single()

  let planRow = inserted
  if (insertError) {
    if (insertError.code === '23505') {
      const { data: raceWinner } = await admin
        .from('daily_plan')
        .select('*')
        .eq('user_id', user.id)
        .eq('game', game)
        .eq('plan_date', planDate)
        .maybeSingle()
      planRow = raceWinner
    } else {
      console.error('[/api/study/today] plan insert hatasi:', insertError.code)
      return NextResponse.json({ error: 'Plan olusturulamadi' }, { status: 500 })
    }
  }

  if (!planRow) {
    return NextResponse.json({ error: 'Plan olusturulamadi' }, { status: 500 })
  }

  const questions = await fetchQuestionsInOrder(admin, planRow.question_ids as string[])

  return NextResponse.json(
    {
      planDate: planRow.plan_date,
      game,
      questions,
      completedIds: (planRow.completed_ids as string[]) ?? [],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * PATCH /api/study/today  body: { game: string, questionIds: string[] }
 *
 * Bugunku planin completed_ids alanina isaretlenen soru-id'lerini set-union
 * ile ekler (dedup). Yalniz planin KENDI question_ids'ine ait olan id'ler
 * kabul edilir -- plan-disi id'ler sessizce yok sayilir.
 */
export async function PATCH(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const userRl = await userLimiter.check(user.id)
  if (!userRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
    )
  }

  const body = await request.json().catch(() => null) as { game?: string; questionIds?: unknown } | null
  const game = body?.game
  if (!game || !VALID_GAMES.has(game as never)) {
    return NextResponse.json({ error: 'Gecerli oyun belirtilmedi' }, { status: 400 })
  }

  const incomingIds = Array.isArray(body?.questionIds)
    ? (body.questionIds as unknown[]).filter((id): id is string => isValidUuid(id))
    : []

  const admin = createServiceRoleClient()
  const planDate = trDayString()

  const { data: existing } = await admin
    .from('daily_plan')
    .select('*')
    .eq('user_id', user.id)
    .eq('game', game)
    .eq('plan_date', planDate)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Plan bulunamadi' }, { status: 404 })
  }

  // Plan-disi id'leri yok say -- yalniz planin kendi question_ids'ine sinirlanir.
  const planIds = new Set(existing.question_ids as string[])
  const validIncoming = incomingIds.filter((id) => planIds.has(id))

  const mergedCompleted = Array.from(
    new Set([...(existing.completed_ids as string[] ?? []), ...validIncoming]),
  )

  const { data: updated, error } = await admin
    .from('daily_plan')
    .update({ completed_ids: mergedCompleted })
    .eq('id', existing.id)
    .select('completed_ids')
    .single()

  if (error) {
    console.error('[/api/study/today] completed_ids guncelleme hatasi:', error.code)
    return NextResponse.json({ error: 'Guncellenemedi' }, { status: 500 })
  }

  return NextResponse.json(
    { completedIds: (updated.completed_ids as string[]) ?? [] },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
