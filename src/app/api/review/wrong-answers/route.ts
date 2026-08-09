import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import type { QuestionContent } from '@/types/database'
import { getFsrsReviewRollout } from '@/lib/review/fsrs-rollout'
import { computeDueMap, type DueInfo } from '@/lib/review/due-map'
import {
  getReviewErrorReasonLabel,
  isReviewErrorReasonCode,
  type ReviewErrorReasonCode,
} from '@/lib/review/error-reasons'
import { reviewErrorReasonSchema } from '@/lib/validations/schemas'

// Cift kalkan rate limit (profile/topic-strengths paterni — auth-only endpoint):
//   1. IP limit ONCE — anon flood auth.getUser() quota'sini tuketmesin
//   2. User limit — auth kullanicinin kendi sayfasini asiri sik yenilemesine karsi
const ipLimiter = createRateLimiter('wrong-answers-ip', 60, 60_000)
const userLimiter = createRateLimiter('wrong-answers-user', 30, 60_000)
const reasonLimiter = createRateLimiter('wrong-answers-reason', 20, 60_000)

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MAX_PAGE = 1000
// Yanlis-cevap OLAYLARINI (session_answers satiri) tararken guvenlik sinirlamasi —
// cok-aktif bir kullanicinin binlerce satiri tek istekte cekilmesin. En son 1000
// yanlis-cevap olayi taranir (soru bazinda tekillestirme sonrasi sayfalanan liste
// bundan kucuk olur).
const WRONG_EVENTS_SCAN_LIMIT = 1000

type ReviewStatus = 'acik' | 'duzeltildi'

interface QuestionJoin {
  id: string
  game: GameSlug
  category: string
  subcategory: string | null
  difficulty: number
  content: QuestionContent
}

interface WrongAnswerRow {
  question_id: string
  selected_option: number | null
  answered_at: string
  is_skipped: boolean | null
  questions: QuestionJoin | null
}

interface LastAnswerRow {
  question_id: string
  is_correct: boolean
  is_skipped: boolean | null
  answered_at: string
}

interface WrongAnswerItem {
  questionId: string
  game: GameSlug
  category: string
  subcategory: string | null
  difficulty: number
  content: QuestionContent
  userSelectedOption: number | null
  wrongCount: number
  lastWrongAt: string
  status: ReviewStatus
  /** FSRS tekrar-zamani (konu#7 S4). FSRS rollout disinda her ikisi de null. */
  isDue: boolean | null
  dueAt: string | null
  /** Soru zorlugu `difficulty` ile karismamasi icin FSRS zorlugu ayri adlandirilir. */
  stability: number | null
  fsrsDifficulty: number | null
  retrievability: number | null
  reviewState: 'new' | 'learning' | 'review' | 'relearning' | null
  errorReason: { code: ReviewErrorReasonCode; label: string } | null
}

interface CandidateEntry {
  question: QuestionJoin
  wrongCount: number
  lastWrongOption: number | null
  lastWrongAt: string
}

interface ReviewReasonRow {
  question_id: string
  review_error_annotations:
    | { reason_code: string }
    | { reason_code: string }[]
    | null
}

/**
 * GET /api/review/wrong-answers?game=<slug>&status=acik|duzeltildi&limit=20&page=1
 *
 * Konu#7 karari, Faz-2 dilim-1: ogrenciye gorunur "Yanlislarim" (yanlis defteri).
 * Kullanicinin EN AZ BIR KEZ yanlis cevapladigi sorulari, soru bazinda
 * tekillestirilmis olarak doner. Soru basina son-durum:
 *   - lastAnswer.is_correct === false -> status = 'acik'
 *   - lastAnswer.is_correct === true  -> status = 'duzeltildi' (gecmiste yanlis,
 *     sonra dogru cevaplanmis)
 *
 * YAZMA YOLUNA DOKUNULMAZ — bu route salt-okunur, session_answers'a hicbir
 * INSERT/UPDATE yapmaz (yazma yolu /api/sessions'ta, migration 081 atomik RPC).
 *
 * Guvenlik: auth zorunlu (401 anon). Sadece auth.uid() = user_id filtresiyle
 * KENDI cevaplanmis sorulari donuyor — baska kullanici verisi veya
 * cevaplanmamis soru id'si asla sizdirilmaz (sorgu baslangic noktasi HER ZAMAN
 * session_answers.user_id, questions tablosu degil).
 *
 * Cache: no-store (kullanici-ozel, anlik degisken — profile/stats paterni).
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
  const {
    data: { user },
  } = await cookieClient.auth.getUser()
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

  const gameRaw = searchParams.get('game')
  if (gameRaw && !(gameRaw in GAMES)) {
    return NextResponse.json({ error: 'Gecersiz oyun' }, { status: 400 })
  }
  const game = (gameRaw as GameSlug | null) ?? null

  const statusRaw = searchParams.get('status')
  if (statusRaw && statusRaw !== 'acik' && statusRaw !== 'duzeltildi') {
    return NextResponse.json({ error: 'Gecersiz durum' }, { status: 400 })
  }
  const statusFilter = statusRaw as ReviewStatus | null

  const limitRaw = Number.parseInt(searchParams.get('limit') ?? '', 10)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : DEFAULT_LIMIT

  const pageRaw = Number.parseInt(searchParams.get('page') ?? '', 10)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, MAX_PAGE) : 1

  // 5) Kullanicinin yanlis-cevap OLAYLARI — soru icerigiyle birlikte (JOIN).
  //    questions!inner: soft-delete edilmis (is_active=false) sorular da FK
  //    korundugu icin dahil olur — gecmis kaydin kaybolmamasi tercih edildi.
  const admin = createServiceRoleClient()
  const fsrsRollout = getFsrsReviewRollout(user.id)
  let wrongQuery = admin
    .from('session_answers')
    .select('question_id, selected_option, answered_at, is_skipped, questions!inner(id, game, category, subcategory, difficulty, content)')
    .eq('user_id', user.id)
    .eq('is_correct', false)
    .order('answered_at', { ascending: false })
    .limit(WRONG_EVENTS_SCAN_LIMIT)

  if (game) {
    wrongQuery = wrongQuery.eq('questions.game', game)
  }

  const { data: wrongRows, error: wrongError } = await wrongQuery.returns<WrongAnswerRow[]>()

  if (wrongError) {
    console.error('[/api/review/wrong-answers] wrong-answers sorgu hatasi:', wrongError.code)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  // 6) Soru bazinda tekillestir — satirlar answered_at DESC sirali geldigi icin
  //    bir soru icin ILK gorulen satir = en son yanlis cevap.
  const candidates = new Map<string, CandidateEntry>()
  for (const row of wrongRows ?? []) {
    if (row.is_skipped) continue // atlanan sorular "yanlis cevap" sayilmaz
    if (!row.questions) continue

    const existing = candidates.get(row.question_id)
    if (existing) {
      existing.wrongCount++
      continue
    }
    candidates.set(row.question_id, {
      question: row.questions,
      wrongCount: 1,
      lastWrongOption: row.selected_option,
      lastWrongAt: row.answered_at,
    })
  }

  if (candidates.size === 0) {
    return NextResponse.json(
      { items: [], page, limit, hasMore: false },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  // 7) Bu sorularin GERCEK son-durumunu belirle — en son cevap dogruysa
  //    "duzeltildi", degilse "acik" (yanlis-sonrasi tekrar yanlis dahil).
  const questionIds = Array.from(candidates.keys())
  const { data: lastRows, error: lastError } = await admin
    .from('session_answers')
    .select('question_id, is_correct, is_skipped, answered_at')
    .eq('user_id', user.id)
    .in('question_id', questionIds)
    .or('is_skipped.eq.false,is_skipped.is.null')
    .order('answered_at', { ascending: false })
    .returns<LastAnswerRow[]>()

  if (lastError) {
    console.error('[/api/review/wrong-answers] son-durum sorgu hatasi:', lastError.code)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  const lastStatusByQuestion = new Map<string, boolean>()
  for (const row of lastRows ?? []) {
    // Query filtresine ek savunma: mock/eski veri/istemci farklarinda skip bir
    // yanlis deneme gibi son-durumu veya FSRS kartini degistirmesin.
    if (row.is_skipped) continue
    if (!lastStatusByQuestion.has(row.question_id)) {
      lastStatusByQuestion.set(row.question_id, row.is_correct)
    }
  }

  // Ortak hesaplayici, persistent-read kohortunda review_cards okur; backfill
  // eksiginde yalniz eksik kartlari kanonik cevap gecmisinden katlar. Genel
  // FSRS rollout kapaliysa geriye donuk API davranisi null kalir.
  let dueByQuestion = new Map<string, DueInfo>()
  if (fsrsRollout.enabled) {
    try {
      dueByQuestion = await computeDueMap(admin, user.id, questionIds)
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? 'unknown')
        : 'unknown'
      console.error('[/api/review/wrong-answers] FSRS sorgu hatasi:', code)
      return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
    }
  }

  // Her soru icin yalniz EN SON yanlis review log'un kontrollu nedenini oku.
  // Log/answer/session kimlikleri response'a eklenmez.
  const { data: reasonRows, error: reasonError } = await admin
    .from('review_logs')
    .select('question_id, review_error_annotations(reason_code)')
    .eq('user_id', user.id)
    .eq('rating', 1)
    .in('question_id', questionIds)
    .order('reviewed_at', { ascending: false })
    .order('answer_id', { ascending: false })
    .returns<ReviewReasonRow[]>()

  if (reasonError) {
    console.error('[/api/review/wrong-answers] hata-nedeni sorgu hatasi:', reasonError.code)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  const reasonByQuestion = new Map<string, WrongAnswerItem['errorReason']>()
  const seenReasonQuestionIds = new Set<string>()
  for (const row of reasonRows ?? []) {
    if (seenReasonQuestionIds.has(row.question_id)) continue
    seenReasonQuestionIds.add(row.question_id)
    const embedded = Array.isArray(row.review_error_annotations)
      ? row.review_error_annotations[0]
      : row.review_error_annotations
    const code = embedded?.reason_code
    reasonByQuestion.set(
      row.question_id,
      isReviewErrorReasonCode(code)
        ? { code, label: getReviewErrorReasonLabel(code) }
        : null,
    )
  }

  // 8) Birlestir + status filtresi + en-son-yanlisa-gore sirala
  let items: WrongAnswerItem[] = Array.from(candidates.entries()).map(([questionId, c]) => {
    const lastIsCorrect = lastStatusByQuestion.get(questionId) ?? false
    const status: ReviewStatus = lastIsCorrect ? 'duzeltildi' : 'acik'
    const due = dueByQuestion.get(questionId)
    return {
      questionId,
      game: c.question.game,
      category: c.question.category,
      subcategory: c.question.subcategory,
      difficulty: c.question.difficulty,
      content: c.question.content,
      userSelectedOption: c.lastWrongOption,
      wrongCount: c.wrongCount,
      lastWrongAt: c.lastWrongAt,
      status,
      isDue: due ? due.isDue : null,
      dueAt: due ? due.dueAt : null,
      stability: due ? due.stability : null,
      fsrsDifficulty: due ? due.difficulty : null,
      retrievability: due ? due.retrievability : null,
      reviewState: due ? due.state : null,
      errorReason: reasonByQuestion.get(questionId) ?? null,
    }
  })

  if (statusFilter) {
    items = items.filter((it) => it.status === statusFilter)
  }

  items.sort((a, b) => new Date(b.lastWrongAt).getTime() - new Date(a.lastWrongAt).getTime())

  // 9) Sayfala
  const start = (page - 1) * limit
  const pageItems = items.slice(start, start + limit)
  const hasMore = start + limit < items.length

  return NextResponse.json(
    { items: pageItems, page, limit, hasMore },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * POST /api/review/wrong-answers
 * Body: { questionId, reasonCode }
 *
 * Serbest metin kabul etmez. Sunucu auth kullanicisinin ilgili sorudaki en
 * son Again log'unu bulur; owner kontrolunu migration 094 RPC'si tekrarlar.
 */
export async function POST(request: NextRequest) {
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

  const userRl = await reasonLimiter.check(user.id)
  if (!userRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
    )
  }

  const parsed = reviewErrorReasonSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Gecersiz veri' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const { data: logs, error: logError } = await admin
    .from('review_logs')
    .select('id')
    .eq('user_id', user.id)
    .eq('question_id', parsed.data.questionId)
    .eq('rating', 1)
    .order('reviewed_at', { ascending: false })
    .order('answer_id', { ascending: false })
    .limit(1)
    .returns<{ id: string }[]>()

  if (logError) {
    console.error('[/api/review/wrong-answers] review-log sorgu hatasi:', logError.code)
    return NextResponse.json({ error: 'Hata nedeni kaydedilemedi' }, { status: 500 })
  }
  const latestWrongLog = logs?.[0]
  if (!latestWrongLog) {
    return NextResponse.json({ error: 'Yanlis cevap bulunamadi' }, { status: 404 })
  }

  const { error: rpcError } = await admin.rpc('set_review_error_reason', {
    p_user_id: user.id,
    p_review_log_id: latestWrongLog.id,
    p_reason_code: parsed.data.reasonCode,
  })
  if (rpcError) {
    const status = rpcError.code === 'P0002' ? 404
      : rpcError.code === '42501' ? 403
        : rpcError.code === '22023' ? 400
          : 500
    console.error('[/api/review/wrong-answers] hata-nedeni RPC hatasi:', rpcError.code)
    return NextResponse.json({ error: 'Hata nedeni kaydedilemedi' }, { status })
  }

  const code = parsed.data.reasonCode
  return NextResponse.json(
    { errorReason: { code, label: getReviewErrorReasonLabel(code) } },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
