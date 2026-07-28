import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import type { QuestionContent } from '@/types/database'
import { foldQuestionCard, isCardDue, type ReviewEvent } from '@/lib/review/fsrs'
import { getFsrsReviewRollout } from '@/lib/review/fsrs-rollout'

// Cift kalkan rate limit (profile/topic-strengths paterni — auth-only endpoint):
//   1. IP limit ONCE — anon flood auth.getUser() quota'sini tuketmesin
//   2. User limit — auth kullanicinin kendi sayfasini asiri sik yenilemesine karsi
const ipLimiter = createRateLimiter('wrong-answers-ip', 60, 60_000)
const userLimiter = createRateLimiter('wrong-answers-user', 30, 60_000)

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
}

interface CandidateEntry {
  question: QuestionJoin
  wrongCount: number
  lastWrongOption: number | null
  lastWrongAt: string
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
  // FSRS rollout acikken lastRows (zaten cekilmis, ekstra sorgu YOK)
  // ayni zamanda FSRS fold icin soru-basina olay-listesine gruplanir.
  const eventsByQuestion = new Map<string, ReviewEvent[]>()
  for (const row of lastRows ?? []) {
    // Query filtresine ek savunma: mock/eski veri/istemci farklarinda skip bir
    // yanlis deneme gibi son-durumu veya FSRS kartini degistirmesin.
    if (row.is_skipped) continue
    if (!lastStatusByQuestion.has(row.question_id)) {
      lastStatusByQuestion.set(row.question_id, row.is_correct)
    }
    if (fsrsRollout.enabled) {
      const list = eventsByQuestion.get(row.question_id) ?? []
      list.push({ isCorrect: row.is_correct, answeredAt: row.answered_at })
      eventsByQuestion.set(row.question_id, list)
    }
  }

  const dueByQuestion = new Map<string, { isDue: boolean; dueAt: string }>()
  if (fsrsRollout.enabled) {
    const now = new Date()
    for (const [questionId, events] of eventsByQuestion) {
      const card = foldQuestionCard(events)
      dueByQuestion.set(questionId, { isDue: isCardDue(card, now), dueAt: card.due.toISOString() })
    }
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
