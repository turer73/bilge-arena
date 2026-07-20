import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { GAME_SLUGS } from '@/lib/constants/games'
import { isValidUuid } from '@/lib/utils/uuid'
import type { Question } from '@/types/database'
import { toPublicQuestion } from '@/lib/utils/question-public'
import { FEATURES } from '@/lib/constants/premium'
import { computeDueMap } from '@/lib/review/due-map'

// wrong-answers route'undaki (src/app/api/review/wrong-answers/route.ts) ayni
// tarama-sinirlamasi deseni: cok-aktif kullanicida binlerce satir tek istekte
// cekilmesin.
const FSRS_WRONG_SCAN_LIMIT = 1000

// Cift kalkan rate limit (Madde 9 pattern):
//   - IP limit her hit'te ONCE (auth.getUser quota'sini koru)
//   - User limit auth varsa ek katman
const ipLimiter = createRateLimiter('questions-random-ip', 120, 60_000)
const userLimiter = createRateLimiter('questions-random-user', 60, 60_000)

const VALID_GAMES = new Set(GAME_SLUGS)
const VALID_EXAM_REFS = new Set(['TYT', 'LGS', 'AYT-SAY', 'AYT-EA', 'AYT-SOZ'])

/**
 * GET /api/questions/random?game=X&limit=10&category=Y&difficulty=Z&examRef=TYT&excludeIds=uuid1,uuid2&includeReview=true
 *
 * Auth'lu kullanicinin quiz oynamak icin random soru havuzunu doner.
 * Aktif soru havuzundan tam random (RPC select_random_questions, migration 046).
 *
 * Madde 9 #6 (pentest raporu): Browser->Supabase direkt cagri yerine bu proxy.
 * Eski akis: client `supabase.rpc('select_random_questions', ...)` + ayri
 *           `.from('user_question_history').select(...)` + opsiyonel review queries.
 * Yeni akis: server-side auth + service-role RPC + review queries + tek payload.
 *
 * Auth zorunlu — anon kullanici DEMO fallback (frontend tarafinda use-quiz-game
 * 401/empty response'u DEMO_QUESTIONS'a cevirir).
 *
 * Cooldown:
 *   client excludeIds parametresi gondererek son gorulen 50 soruyu disar.
 *   Server tekrar user_question_history'den okumaz (extra query istemiyoruz);
 *   client zaten kendi state'inde tutuyor (use-quiz-game).
 *
 * Review (spaced-repetition):
 *   includeReview=true ise son 7 gunde yanlis cevaplanip dogrulanmamis sorulari
 *   ek olarak doner. Client karistirip %30 review + %70 yeni soru yapar.
 *
 * Cache: no-store (kullaniciya ozel, random degisken)
 * Rate limit: IP 120/dk + user 60/dk
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

  const limitRaw = parseInt(searchParams.get('limit') ?? '10', 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 100) : 10

  const category = searchParams.get('category') || null
  const difficultyRaw = searchParams.get('difficulty')
  const difficulty = difficultyRaw ? parseInt(difficultyRaw, 10) : null
  const examRefRaw = searchParams.get('examRef')
  const examRef = examRefRaw && VALID_EXAM_REFS.has(examRefRaw) ? examRefRaw : null
  const includeReview = searchParams.get('includeReview') === 'true'

  // excludeIds: comma-separated UUID listesi, max 50
  // Klipper review B3/P1: UUID validation ortak helper'da (src/lib/utils/uuid.ts).
  const excludeIdsRaw = searchParams.get('excludeIds') ?? ''
  const clientExcludeIds = excludeIdsRaw
    .split(',')
    .filter(id => isValidUuid(id))
    .slice(0, 50)

  // Review icin %30 ekstra cek
  const fetchLimit = Math.min(limit * 2, 50)

  const admin = createServiceRoleClient()

  // Klipper review B2: cooldown server-of-truth. Eski client-side kod
  // user_question_history'den son 50 soruyu cekiyordu; PR #147 refactor
  // bunu client state'ine birakti, ama sayfa reload = state sifir =
  // kullanici az once gordugu sorularla yine karsilasir. Burada server'da
  // tekrar history'yi okuyup client excludeIds ile birlestiriyoruz.
  let historyExcludeIds: string[] = []
  const { data: historyRows } = await admin
    .from('user_question_history')
    .select('question_id')
    .eq('user_id', user.id)
    .order('last_seen_at', { ascending: false })
    .limit(50)

  if (historyRows && historyRows.length > 0) {
    historyExcludeIds = historyRows
      .map(h => h.question_id as string)
      .filter(id => isValidUuid(id))
  }

  // Client state + server history birlesimi, max 50 (uuid[] perf)
  const mergedExcludeIds = Array.from(new Set([...clientExcludeIds, ...historyExcludeIds])).slice(0, 50)

  // 5) RPC cagri — select_random_questions (migration 046)
  const rpcArgs: {
    p_game: string
    p_limit: number
    p_category?: string
    p_difficulty?: number
    p_exclude_ids?: string[]
    p_exam_ref?: string
  } = {
    p_game: game,
    p_limit: fetchLimit,
  }
  if (category) rpcArgs.p_category = category
  if (difficulty) rpcArgs.p_difficulty = difficulty
  if (mergedExcludeIds.length > 0) rpcArgs.p_exclude_ids = mergedExcludeIds
  if (examRef) rpcArgs.p_exam_ref = examRef

  const initialRpc = await admin.rpc('select_random_questions', rpcArgs)
  const rpcError = initialRpc.error
  let rpcData = initialRpc.data

  // Fallback: cooldown filter sonrasi yeterli soru gelmediyse, exclude'siz tekrar dene
  if (!rpcError && rpcData && (rpcData as Question[]).length < limit && mergedExcludeIds.length > 0) {
    const fallbackArgs = { ...rpcArgs }
    delete fallbackArgs.p_exclude_ids
    const { data: fallbackData, error: fallbackError } = await admin.rpc(
      'select_random_questions',
      fallbackArgs,
    )
    if (!fallbackError && fallbackData && (fallbackData as Question[]).length > (rpcData as Question[]).length) {
      rpcData = fallbackData
    }
  }

  if (rpcError) {
    console.error('[/api/questions/random] RPC error:', rpcError.code)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  const questions = (rpcData ?? []) as Question[]

  // 6) Review questions (opsiyonel, spaced-repetition)
  let reviewQuestions: Question[] = []
  if (includeReview && questions.length > 0) {
    reviewQuestions = await fetchReviewQuestions(admin, user.id, game, category, difficulty)
  }

  return NextResponse.json(
    // Whitelist: RPC tam DB satiri donduruyor; telemetri/ic alanlar sizmasin
    {
      questions: questions.map(toPublicQuestion),
      reviewQuestions: reviewQuestions.map(toPublicQuestion),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * FSRS-tabanli review havuzu (konu#7 karari S1, FEATURES.FSRS_REVIEW=true iken).
 * Kalici FSRS-state YOK: en az bir kez yanlis cevaplanmis her soru icin TUM
 * (dogru+yanlis) session_answers gecmisi kronolojik olarak FSRS'e katlanir
 * (src/lib/review/fsrs.ts), due<=simdi olanlar donulur. Bos donerse cagiran
 * (fetchReviewQuestions) eski 7-gun mantigina otomatik duser.
 */
async function fetchFsrsDueQuestions(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  game: string,
  category: string | null,
  difficulty: number | null,
): Promise<Question[]> {
  // 1) Adaylar: en az bir kez yanlis cevaplanmis sorular (soru-id'ye gore
  // tekillestirilir asagida; tarama en son N yanlis-OLAYIYLA sinirli).
  const { data: wrongRows } = await admin
    .from('session_answers')
    .select('question_id')
    .eq('user_id', userId)
    .eq('is_correct', false)
    .order('answered_at', { ascending: false })
    .limit(FSRS_WRONG_SCAN_LIMIT)

  const candidateIds = Array.from(new Set((wrongRows ?? []).map(r => r.question_id as string)))
  if (candidateIds.length === 0) return []

  // 2) Bu adaylarin TAM (dogru+yanlis) gecmisi FSRS'e katlanir -- paylasilan
  // yardimci (/api/review/wrong-answers ile ayni fold-mantigini kullanir,
  // due-rozeti icin de burada kullaniliyor).
  const dueMap = await computeDueMap(admin, userId, candidateIds)
  const dueIds = Array.from(dueMap.entries())
    .filter(([, info]) => info.isDue)
    .map(([questionId]) => questionId)

  if (dueIds.length === 0) return []

  // Vercel Agent Review bulgusu: dueIds cross-game bir liste (aday-taramasi
  // game'e gore filtrelenmiyor). game/category/difficulty filtreleri ONCE
  // uygulanip DB-tarafinda limit(20) yapilmali -- aksi halde JS-tarafinda
  // slice(0,20) once yapilirsa cok-oyunlu kullanicida istenen oyuna ait ID
  // kalmayabilir (havuz sessizce ac kalir).
  let query = admin
    .from('questions')
    .select('*')
    .in('id', dueIds)
    .eq('game', game)
    .eq('is_active', true)

  if (category) query = query.eq('category', category)
  if (difficulty) query = query.eq('difficulty', difficulty)

  query = query.limit(20)

  const { data } = await query
  return (data as unknown as Question[]) || []
}

/**
 * Son 7 gunde yanlis cevaplanan ve sonrasinda dogru cevaplanmamis sorulari getirir.
 * Spaced repetition icin "zayif sorular" havuzu (FEATURES.FSRS_REVIEW=false iken
 * kullanilan mantik; FSRS acikken de bos/hata durumunda fallback olarak calisir).
 */
async function fetchReviewQuestions(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  game: string,
  category: string | null,
  difficulty: number | null,
): Promise<Question[]> {
  if (FEATURES.FSRS_REVIEW) {
    try {
      const dueQuestions = await fetchFsrsDueQuestions(admin, userId, game, category, difficulty)
      if (dueQuestions.length > 0) return dueQuestions
    } catch (e) {
      console.error('[/api/questions/random] FSRS fold hatasi, 7-gun fallback:', e)
    }
    // dueQuestions bos veya hata -> asagidaki 7-gun mantigina bilerek dusuluyor
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // NOT (disc#1372): session_answers'ta created_at kolonu YOK, yalniz answered_at
  // var -- eski kod created_at'a filtreliyordu (PostgREST hatasi -> data=null ->
  // sessizce bos donuyordu, review-karistirma fiilen hic calismiyordu). Fix.
  const { data: wrongAnswers } = await admin
    .from('session_answers')
    .select('question_id')
    .eq('user_id', userId)
    .eq('is_correct', false)
    .gte('answered_at', sevenDaysAgo)

  if (!wrongAnswers || wrongAnswers.length === 0) return []

  const wrongIds = Array.from(new Set(wrongAnswers.map(a => a.question_id)))

  const { data: correctAfter } = await admin
    .from('session_answers')
    .select('question_id')
    .eq('user_id', userId)
    .eq('is_correct', true)
    .in('question_id', wrongIds)
    .gte('answered_at', sevenDaysAgo)

  const correctedIds = new Set((correctAfter || []).map(a => a.question_id))
  const reviewIds = wrongIds.filter(id => !correctedIds.has(id))

  if (reviewIds.length === 0) return []

  // Ayni duzeltme (Vercel Agent Review, PR#274): reviewIds de game'e gore
  // filtrelenmemis cross-game bir liste -- once filtre, sonra DB-tarafinda limit.
  let query = admin
    .from('questions')
    .select('*')
    .in('id', reviewIds)
    .eq('game', game)
    .eq('is_active', true)

  if (category) query = query.eq('category', category)
  if (difficulty) query = query.eq('difficulty', difficulty)

  query = query.limit(20)

  const { data } = await query

  return (data as unknown as Question[]) || []
}
