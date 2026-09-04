import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { GAMES, GAME_SLUGS, type GameSlug } from '@/lib/constants/games'
import { defaultExamRefForType, type ExamType } from '@/lib/constants/exam-types'
import { trDayString } from '@/lib/utils/tr-date'
import {
  parseQuestionRows,
  toDomainQuestion,
  toPublicQuestion,
  type QuestionRow,
} from '@/lib/utils/question-public'
import { selectPersonalizedMock } from '@/lib/study/personalized-mock'
import type { Question } from '@/types/database'
import {
  filterTytSocialQuestionIds,
  issueVerifiedAttempt,
  issueVerifiedExamAttempt,
  toPublicVerifiedQuestions,
} from '@/lib/verified-attempts'
import { isValidUuid } from '@/lib/utils/uuid'
import { DENEME_CONFIGS } from '@/lib/constants/modes'
import { isTytSocialV2LearnerEnabled } from '@/lib/feature-flags/tyt-social-v2-server'

const ipLimiter = createRateLimiter('personalized-mock-ip', 60, 60_000)
const userLimiter = createRateLimiter('personalized-mock-user', 10, 60_000)

const VALID_EXAM_REFS = new Set(['TYT', 'LGS', 'AYT-SAY', 'AYT-EA', 'AYT-SOZ', 'YDT'])
const VALID_GAMES = new Set<string>(GAME_SLUGS)
const HISTORY_LIMIT = 1000
const QUESTION_POOL_LIMIT = 1000
const MOCK_SIZE = 40
const STRATEGY_BLUEPRINT_VERSION = 'personalized-mock-v1'

interface HistoryRow {
  question_id: string
  is_correct: boolean
  is_skipped: boolean | null
  answered_at: string | null
  questions: QuestionRow | null
}

/**
 * GET /api/study/personalized-mock?game=<slug>&exam_ref=<ref>
 *
 * Kullanıcının açık yanlışları, yeterli örneklemdeki zayıf konuları ve deneme
 * kapsamını tek bir 40 soruluk set halinde birleştirir. Seçim aynı kullanıcı,
 * oyun, sınav ve Türkiye takvim gününde deterministiktir; veritabanına snapshot
 * yazmaz. Başlatılan soru dizisi istemcide sabit kalır.
 */
export async function GET(request: NextRequest) {
  const tytSocialV2Enabled = isTytSocialV2LearnerEnabled()
  const ip = getClientIp(request.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Çok fazla istek' },
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
      { error: 'Çok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
    )
  }

  const { searchParams } = new URL(request.url)
  const gameRaw = searchParams.get('game')
  if (!gameRaw || !VALID_GAMES.has(gameRaw)) {
    return NextResponse.json({ error: 'Geçerli oyun belirtilmedi' }, { status: 400 })
  }
  const game = gameRaw as GameSlug

  const requestedExamRef = searchParams.get('exam_ref')
  if (requestedExamRef && !VALID_EXAM_REFS.has(requestedExamRef)) {
    return NextResponse.json({ error: 'Geçersiz sınav referansı' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('exam_type')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('[/api/study/personalized-mock] profil sorgu hatası:', profileError.code)
    return NextResponse.json({ error: 'Deneme oluşturulamadı' }, { status: 500 })
  }

  const examType = (profile?.exam_type as ExamType | null | undefined) ?? null
  if (examType === 'lgs' && !GAMES[game].examTags.includes('LGS')) {
    return NextResponse.json({ error: 'Sınav tercihiyle uyumsuz oyun' }, { status: 400 })
  }
  if (
    requestedExamRef
    && ((examType === 'lgs' && requestedExamRef !== 'LGS')
      || (examType === 'yks' && requestedExamRef === 'LGS'))
  ) {
    return NextResponse.json({ error: 'Sınav tercihiyle uyumsuz referans' }, { status: 400 })
  }

  const examRef = game === 'wordquest'
    ? null
    : (requestedExamRef ?? defaultExamRefForType(examType))

  let poolQuery = admin
    .from('questions')
    .select('*')
    .eq('game', game)
    .eq('is_active', true)
    .order('id', { ascending: true })
    .limit(QUESTION_POOL_LIMIT)
  if (examRef) poolQuery = poolQuery.eq('exam_ref', examRef)

  let historyQuery = admin
    .from('session_answers')
    .select('question_id, is_correct, is_skipped, answered_at, questions!inner(*)')
    .eq('user_id', user.id)
    .eq('questions.game', game)
    .or('is_skipped.eq.false,is_skipped.is.null')
    .order('answered_at', { ascending: false })
    .limit(HISTORY_LIMIT)
  if (examRef) historyQuery = historyQuery.eq('questions.exam_ref', examRef)

  const [poolResult, historyResult] = await Promise.all([
    poolQuery,
    historyQuery.returns<HistoryRow[]>(),
  ])

  if (poolResult.error || historyResult.error) {
    console.error(
      '[/api/study/personalized-mock] veri sorgu hatası:',
      poolResult.error?.code ?? historyResult.error?.code,
    )
    return NextResponse.json({ error: 'Deneme oluşturulamadı' }, { status: 500 })
  }

  const questionsById = new Map<string, Question>()
  for (const question of parseQuestionRows(poolResult.data)) {
    questionsById.set(question.id, question)
  }
  for (const row of historyResult.data ?? []) {
    if (!row.questions || row.questions.is_active === false) continue
    const question = toDomainQuestion(row.questions)
    if (question) questionsById.set(question.id, question)
  }

  let eligibleHistory = historyResult.data ?? []
  if (tytSocialV2Enabled && game === 'sosyal' && examRef === 'TYT') {
    try {
      const allowedIds = new Set(await filterTytSocialQuestionIds(
        admin,
        user.id,
        [...questionsById.keys()],
      ))
      for (const questionId of questionsById.keys()) {
        if (!allowedIds.has(questionId)) questionsById.delete(questionId)
      }
      eligibleHistory = eligibleHistory.filter(row => allowedIds.has(row.question_id))
    } catch {
      return NextResponse.json(
        { error: 'TYT Sosyal cevaplama düzeni seçilmelidir' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      )
    }
  }

  const generatedFor = trDayString()
  const composition = selectPersonalizedMock({
    game,
    seed: `${user.id}:${game}:${examRef ?? 'all'}:${generatedFor}`,
    candidates: Array.from(questionsById.values()).map(({ id, category }) => ({ id, category })),
    history: eligibleHistory.map((row) => ({
      questionId: row.question_id,
      category: row.questions?.category ?? '',
      isCorrect: row.is_correct,
      isSkipped: row.is_skipped,
      answeredAt: row.answered_at ?? '',
    })),
    size: MOCK_SIZE,
  })

  if (composition.questionIds.length < MOCK_SIZE) {
    return NextResponse.json(
      {
        error: 'Bu sınav için 40 aktif soru bulunamadı',
        available: composition.questionIds.length,
      },
      { status: 422, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  let questions = composition.questionIds
    .map((id) => questionsById.get(id))
    .filter((question): question is Question => Boolean(question))
    .map(toPublicQuestion)

  let attemptId: string
  let expiresAt: string
  let strategyEligible = false
  try {
    // Migration 100 pilot is exam-ref scoped; WordQuest has no exam_ref and
    // deliberately stays on the existing verified-attempt path.
    const strategyEnabled = process.env.MOCK_STRATEGY_ENABLED === 'true'
      && process.env.NEXT_PUBLIC_MOCK_STRATEGY_ENABLED === 'true'
      && game !== 'wordquest'
    const requiresPolicySnapshot = tytSocialV2Enabled && game === 'sosyal' && examRef === 'TYT'
    const requestIdHeader = request.headers.get('x-idempotency-key')
    const ticket = strategyEnabled || requiresPolicySnapshot
      ? await issueVerifiedExamAttempt(admin, {
          userId: user.id,
          game,
          examRef,
          blueprintVersion: STRATEGY_BLUEPRINT_VERSION,
          items: composition.items,
          plannedDurationSec: DENEME_CONFIGS[game].totalTime,
          requestId: requestIdHeader && isValidUuid(requestIdHeader)
            ? requestIdHeader
            : crypto.randomUUID(),
        })
      : await issueVerifiedAttempt(admin, {
          userId: user.id,
          game,
          mode: 'deneme',
          questionIds: questions.map(question => question.id),
          examRef,
          requestId: requestIdHeader && isValidUuid(requestIdHeader)
            ? requestIdHeader
            : crypto.randomUUID(),
        })
    attemptId = ticket.attemptId
    expiresAt = ticket.expiresAt
    strategyEligible = strategyEnabled
      && 'strategyEligible' in ticket
      && ticket.strategyEligible === true
    const verifiedQuestions = toPublicVerifiedQuestions(ticket.questionSnapshots)
    if (
      verifiedQuestions.length !== questions.length
      || verifiedQuestions.some((question, index) => question.id !== questions[index]?.id)
    ) throw new Error('verified_attempt_snapshot_mismatch')
    questions = verifiedQuestions
  } catch {
    console.error('[/api/study/personalized-mock] verified attempt issuance failed')
    return NextResponse.json(
      { error: 'Deneme baslatilamadi' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return NextResponse.json(
    {
      generatedFor,
      game,
      examRef,
      questions,
      breakdown: composition.breakdown,
      attemptId,
      expiresAt,
      strategyEligible,
      ...(strategyEligible ? { blueprintVersion: STRATEGY_BLUEPRINT_VERSION } : {}),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
