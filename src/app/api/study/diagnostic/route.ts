import { randomUUID } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { GAME_SLUGS } from '@/lib/constants/games'
import {
  selectNextDiagnosticQuestion,
  type DiagnosticAnswerInput,
  type DiagnosticKind,
  type DiagnosticOutcomeInput,
  type DiagnosticPriorStateInput,
  type DiagnosticQuestionInput,
} from '@/lib/diagnostic/adaptive-policy'
import { buildDiagnosticSummary, type DiagnosticSummaryOutcomeInput } from '@/lib/diagnostic/summary'
import type {
  DiagnosticResponsePublic,
  DiagnosticSessionPublic,
  DiagnosticSummaryPublic,
} from '@/lib/diagnostic/public-contract'
import {
  parseQuestionRows,
  toPublicQuestion,
  type PublicQuestion,
} from '@/lib/utils/question-public'

const ipLimiter = createRateLimiter('adaptive-diagnostic-ip', 120, 60_000)
const userLimiter = createRateLimiter('adaptive-diagnostic-user', 60, 60_000)

const PILOT_GAME = 'matematik'
const PILOT_EXAM_REF = 'TYT'
const PILOT_TAXONOMY = 'ba-tyt-math-v1'
const PILOT_OUTCOME_COUNT = 6
const MAX_CATALOG_QUESTIONS = 500
const MAX_CATALOG_MAPPINGS = 1_000

const startSchema = z.object({
  action: z.literal('start'),
  game: z.enum(GAME_SLUGS),
  examRef: z.string().trim().min(2).max(10).regex(/^[A-Z0-9-]+$/),
}).strict()

const answerSchema = z.object({
  action: z.literal('answer'),
  sessionId: z.string().uuid(),
  questionId: z.string().uuid(),
  selectedOption: z.number().int().min(0).max(4),
  responseTimeMs: z.number().int().min(100).max(600_000),
  requestId: z.string().uuid(),
}).strict()

type AdminClient = ReturnType<typeof createServiceRoleClient>

interface SessionRow {
  id: string
  user_id: string
  kind: DiagnosticKind
  status: 'active' | 'completed' | 'abandoned'
  current_question_id: string | null
  answered_count: number
  covered_outcomes: number
  expires_at: string
  created_at: string
}

interface OutcomeRow {
  id: string
  code: string
  title: string
  category: string
  sort_order: number
}

interface PriorStateRow {
  outcome_id: string
  score: number | string
  recommended_difficulty: number
  attempts: number
  correct_attempts: number
  last_diagnosed_at: string
}

interface AnswerRow {
  question_id: string
  outcome_id: string
  difficulty: number
  is_correct: boolean
  sequence: number
  response_time_ms: number
  request_id: string
  next_question_id: string | null
  status_after: 'active' | 'completed' | 'abandoned'
  covered_outcomes_after: number
}

interface Catalog {
  outcomes: DiagnosticSummaryOutcomeInput[]
  policyOutcomes: DiagnosticOutcomeInput[]
  policyQuestions: DiagnosticQuestionInput[]
  priorStates: DiagnosticPriorStateInput[]
  publicQuestionById: Map<string, PublicQuestion>
}

interface StartRpcResult {
  sessionId: string
  currentQuestionId: string
  kind: DiagnosticKind
  answeredCount: number
  coveredOutcomes: number
  expiresAt: string
  resumed: boolean
}

interface RecordRpcResult {
  alreadyProcessed: boolean
  status: 'active' | 'completed' | 'abandoned'
  nextQuestionId: string | null
  answeredCount: number
  coveredOutcomes: number
}

type AuthenticationResult =
  | { ok: true; user: { id: string } }
  | { ok: false; response: NextResponse }

function noStoreJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function validProgress(answered: unknown, covered: unknown): boolean {
  return Number.isInteger(answered)
    && Number(answered) >= 0
    && Number(answered) <= 10
    && Number.isInteger(covered)
    && Number(covered) >= 0
    && Number(covered) <= PILOT_OUTCOME_COUNT
    && Number(covered) <= Number(answered)
}

function parseStartRpc(value: unknown): StartRpcResult | null {
  if (!isRecord(value)) return null
  if (
    !isUuid(value.sessionId)
    || !isUuid(value.currentQuestionId)
    || (value.kind !== 'initial' && value.kind !== 'recheck')
    || !validProgress(value.answeredCount, value.coveredOutcomes)
    || typeof value.expiresAt !== 'string'
    || !Number.isFinite(Date.parse(value.expiresAt))
    || typeof value.resumed !== 'boolean'
  ) return null
  return {
    sessionId: value.sessionId,
    currentQuestionId: value.currentQuestionId,
    kind: value.kind,
    answeredCount: Number(value.answeredCount),
    coveredOutcomes: Number(value.coveredOutcomes),
    expiresAt: value.expiresAt,
    resumed: value.resumed,
  }
}

function parseRecordRpc(value: unknown): RecordRpcResult | null {
  if (!isRecord(value)) return null
  if (
    typeof value.alreadyProcessed !== 'boolean'
    || !['active', 'completed', 'abandoned'].includes(String(value.status))
    || !(value.nextQuestionId === null || isUuid(value.nextQuestionId))
    || !validProgress(value.answeredCount, value.coveredOutcomes)
  ) return null
  const status = String(value.status) as RecordRpcResult['status']
  if ((status === 'active') !== (value.nextQuestionId !== null)) return null
  return {
    alreadyProcessed: value.alreadyProcessed,
    status,
    nextQuestionId: value.nextQuestionId,
    answeredCount: Number(value.answeredCount),
    coveredOutcomes: Number(value.coveredOutcomes),
  }
}

function unsupported(game: string, examRef: string | null): DiagnosticResponsePublic {
  return { supported: false, game, examRef, session: null, summary: null }
}

function publicSession(input: {
  id: string
  kind: DiagnosticKind
  status: DiagnosticSessionPublic['status']
  expiresAt: string
  answered: number
  coveredOutcomes: number
  question: PublicQuestion | null
}): DiagnosticSessionPublic {
  return {
    id: input.id,
    kind: input.kind,
    status: input.status,
    expiresAt: input.expiresAt,
    progress: {
      answered: input.answered,
      total: 10,
      coveredOutcomes: input.coveredOutcomes,
      totalOutcomes: PILOT_OUTCOME_COUNT,
    },
    question: input.question,
  }
}

async function loadOutcomes(admin: AdminClient): Promise<DiagnosticSummaryOutcomeInput[]> {
  const { data, error } = await admin
    .from('curriculum_outcomes')
    .select('id,code,title,category,sort_order')
    .eq('game', PILOT_GAME)
    .eq('exam_ref', PILOT_EXAM_REF)
    .eq('taxonomy_version', PILOT_TAXONOMY)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(PILOT_OUTCOME_COUNT + 1)
  if (error) throw error
  const rows = (data ?? []) as OutcomeRow[]
  if (rows.length !== PILOT_OUTCOME_COUNT) throw new Error('diagnostic_outcome_scope_invalid')
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    category: row.category,
    sortOrder: row.sort_order,
  }))
}

async function loadPriorRows(
  admin: AdminClient,
  userId: string,
  outcomeIds: string[],
): Promise<PriorStateRow[]> {
  const { data, error } = await admin
    .from('user_diagnostic_outcome_state')
    .select('outcome_id,score,recommended_difficulty,attempts,correct_attempts,last_diagnosed_at')
    .eq('user_id', userId)
    .in('outcome_id', outcomeIds)
  if (error) throw error
  const rows = (data ?? []) as PriorStateRow[]
  if (rows.length !== 0 && rows.length !== PILOT_OUTCOME_COUNT) {
    throw new Error('diagnostic_state_scope_invalid')
  }
  return rows
}

async function loadSummary(
  admin: AdminClient,
  userId: string,
  outcomes?: DiagnosticSummaryOutcomeInput[],
): Promise<DiagnosticSummaryPublic | null> {
  const resolvedOutcomes = outcomes ?? await loadOutcomes(admin)
  const rows = await loadPriorRows(admin, userId, resolvedOutcomes.map((outcome) => outcome.id))
  if (rows.length === 0) return null
  const summary = buildDiagnosticSummary(
    resolvedOutcomes,
    rows.map((row) => ({
      outcomeId: row.outcome_id,
      attempts: Number(row.attempts),
      correctAttempts: Number(row.correct_attempts),
      score: Number(row.score),
      recommendedDifficulty: Number(row.recommended_difficulty),
      lastDiagnosedAt: row.last_diagnosed_at,
    })),
  )
  if (!summary) throw new Error('diagnostic_summary_invalid')
  return summary
}

async function loadCatalog(admin: AdminClient, userId: string): Promise<Catalog> {
  const outcomes = await loadOutcomes(admin)
  const outcomeIds = outcomes.map((outcome) => outcome.id)
  const [questionResult, mappingResult, priorRows] = await Promise.all([
    admin
      .from('questions')
      .select('*')
      .eq('game', PILOT_GAME)
      .eq('exam_ref', PILOT_EXAM_REF)
      .eq('is_active', true)
      .order('id', { ascending: true })
      .limit(MAX_CATALOG_QUESTIONS),
    admin
      .from('question_outcomes')
      .select('question_id,outcome_id')
      .in('outcome_id', outcomeIds)
      .limit(MAX_CATALOG_MAPPINGS),
    loadPriorRows(admin, userId, outcomeIds),
  ])
  if (questionResult.error) throw questionResult.error
  if (mappingResult.error) throw mappingResult.error

  const domainQuestions = parseQuestionRows(questionResult.data)
  const questionById = new Map(domainQuestions.map((question) => [question.id, question]))
  const policyQuestions: DiagnosticQuestionInput[] = []
  for (const mapping of mappingResult.data ?? []) {
    const question = questionById.get(mapping.question_id)
    if (question) {
      policyQuestions.push({
        id: question.id,
        outcomeId: mapping.outcome_id,
        difficulty: question.difficulty,
      })
    }
  }

  return {
    outcomes,
    policyOutcomes: outcomes.map((outcome) => ({ id: outcome.id, sortOrder: outcome.sortOrder })),
    policyQuestions,
    priorStates: priorRows.map((row) => ({
      outcomeId: row.outcome_id,
      score: Number(row.score),
      recommendedDifficulty: Number(row.recommended_difficulty),
    })),
    publicQuestionById: new Map(domainQuestions.map((question) => [question.id, toPublicQuestion(question)])),
  }
}

async function loadSession(admin: AdminClient, userId: string, sessionId: string): Promise<SessionRow | null> {
  const { data, error } = await admin
    .from('adaptive_diagnostic_sessions')
    .select('id,user_id,kind,status,current_question_id,answered_count,covered_outcomes,expires_at,created_at')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as SessionRow | null) ?? null
}

async function loadAnswers(admin: AdminClient, userId: string, sessionId: string): Promise<AnswerRow[]> {
  const { data, error } = await admin
    .from('adaptive_diagnostic_answers')
    .select('question_id,outcome_id,difficulty,is_correct,sequence,response_time_ms,request_id,next_question_id,status_after,covered_outcomes_after')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('sequence', { ascending: true })
    .limit(10)
  if (error) throw error
  return (data ?? []) as AnswerRow[]
}

async function authenticate(request: NextRequest): Promise<AuthenticationResult> {
  const ipRl = await ipLimiter.check(getClientIp(request.headers))
  if (!ipRl.success) {
    return { ok: false, response: NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    ) }
  }
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return { ok: false, response: noStoreJson({ error: 'Yetkisiz' }, { status: 401 }) }
  const userRl = await userLimiter.check(user.id)
  if (!userRl.success) {
    return { ok: false, response: NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
    ) }
  }
  return { ok: true, user }
}

export async function GET(request: NextRequest) {
  const auth = await authenticate(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const game = searchParams.get('game')
  const examRef = searchParams.get('exam_ref')?.trim().toUpperCase() ?? null
  if (!game || !GAME_SLUGS.some((candidate) => candidate === game)) {
    return noStoreJson({ error: 'Gecerli oyun belirtilmedi' }, { status: 400 })
  }
  if (examRef && !/^[A-Z0-9-]{2,10}$/.test(examRef)) {
    return noStoreJson({ error: 'Gecersiz sinav referansi' }, { status: 400 })
  }
  if (game !== PILOT_GAME || examRef !== PILOT_EXAM_REF) {
    return noStoreJson(unsupported(game, examRef))
  }

  const admin = createServiceRoleClient()
  try {
    const [{ data: latest, error: latestError }, summary] = await Promise.all([
      admin
        .from('adaptive_diagnostic_sessions')
        .select('id,user_id,kind,status,current_question_id,answered_count,covered_outcomes,expires_at,created_at')
        .eq('user_id', auth.user.id)
        .eq('game', PILOT_GAME)
        .eq('exam_ref', PILOT_EXAM_REF)
        .eq('taxonomy_version', PILOT_TAXONOMY)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      loadSummary(admin, auth.user.id),
    ])
    if (latestError) throw latestError

    const session = latest as SessionRow | null
    let publicSessionValue: DiagnosticSessionPublic | null = null
    if (session) {
      const expired = session.status === 'active' && Date.parse(session.expires_at) <= Date.now()
      let question: PublicQuestion | null = null
      if (session.status === 'active' && !expired && session.current_question_id) {
        const catalog = await loadCatalog(admin, auth.user.id)
        const matches = catalog.policyQuestions.filter((candidate) => candidate.id === session.current_question_id)
        if (matches.length !== 1) throw new Error('diagnostic_current_mapping_invalid')
        question = catalog.publicQuestionById.get(session.current_question_id) ?? null
      }
      if (session.status === 'active' && !expired && !question) {
        throw new Error('diagnostic_current_question_invalid')
      }
      publicSessionValue = publicSession({
        id: session.id,
        kind: session.kind,
        status: expired ? 'expired' : session.status,
        expiresAt: session.expires_at,
        answered: session.answered_count,
        coveredOutcomes: session.covered_outcomes,
        question,
      })
    }

    return noStoreJson({
      supported: true,
      game: PILOT_GAME,
      examRef: PILOT_EXAM_REF,
      session: publicSessionValue,
      summary,
    } satisfies DiagnosticResponsePublic)
  } catch (error) {
    console.error('[AdaptiveDiagnostic] GET failed:', (error as { code?: string } | null)?.code ?? 'internal')
    return noStoreJson({ error: 'Tanilama yuklenemedi' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request)
  if (!auth.ok) return auth.response

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return noStoreJson({ error: 'Gecersiz istek' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const action = isRecord(rawBody) ? rawBody.action : null
  if (action === 'start') {
    const parsed = startSchema.safeParse(rawBody)
    if (!parsed.success) return noStoreJson({ error: 'Gecersiz istek' }, { status: 400 })
    if (parsed.data.game !== PILOT_GAME || parsed.data.examRef !== PILOT_EXAM_REF) {
      return noStoreJson(unsupported(parsed.data.game, parsed.data.examRef))
    }

    try {
      const catalog = await loadCatalog(admin, auth.user.id)
      const sessionId = randomUUID()
      const kind: DiagnosticKind = catalog.priorStates.length === PILOT_OUTCOME_COUNT ? 'recheck' : 'initial'
      const first = selectNextDiagnosticQuestion({
        kind,
        seed: sessionId,
        outcomes: catalog.policyOutcomes,
        questions: catalog.policyQuestions,
        priorStates: catalog.priorStates,
        answers: [],
      })
      if (!first) throw new Error('diagnostic_first_question_unavailable')

      const { data, error } = await admin.rpc('start_adaptive_diagnostic', {
        p_user_id: auth.user.id,
        p_session_id: sessionId,
        p_first_question_id: first.questionId,
      })
      if (error) throw error
      const result = parseStartRpc(data)
      if (!result) throw new Error('diagnostic_start_result_invalid')
      const resultMappings = catalog.policyQuestions.filter((question) => question.id === result.currentQuestionId)
      const question = catalog.publicQuestionById.get(result.currentQuestionId) ?? null
      if (!question || resultMappings.length !== 1) throw new Error('diagnostic_start_question_invalid')
      const summary = await loadSummary(admin, auth.user.id, catalog.outcomes)

      return noStoreJson({
        supported: true,
        game: PILOT_GAME,
        examRef: PILOT_EXAM_REF,
        session: publicSession({
          id: result.sessionId,
          kind: result.kind,
          status: 'active',
          expiresAt: result.expiresAt,
          answered: result.answeredCount,
          coveredOutcomes: result.coveredOutcomes,
          question,
        }),
        summary,
      } satisfies DiagnosticResponsePublic)
    } catch (error) {
      console.error('[AdaptiveDiagnostic] start failed:', (error as { code?: string } | null)?.code ?? 'internal')
      return noStoreJson({ error: 'Tanilama baslatilamadi' }, { status: 500 })
    }
  }

  if (action === 'answer') {
    const parsed = answerSchema.safeParse(rawBody)
    if (!parsed.success) return noStoreJson({ error: 'Gecersiz istek' }, { status: 400 })
    const body = parsed.data

    try {
      const session = await loadSession(admin, auth.user.id, body.sessionId)
      if (!session) return noStoreJson({ error: 'Tanilama bulunamadi' }, { status: 404 })
      const [catalog, recordedAnswers] = await Promise.all([
        loadCatalog(admin, auth.user.id),
        loadAnswers(admin, auth.user.id, body.sessionId),
      ])
      const replay = recordedAnswers.find((answer) => (
        answer.request_id === body.requestId || answer.question_id === body.questionId
      ))

      let isCorrect: boolean
      let responseTimeMs = body.responseTimeMs
      let nextQuestionId: string | null
      if (replay) {
        isCorrect = replay.is_correct
        responseTimeMs = replay.response_time_ms
        nextQuestionId = replay.next_question_id
      } else if (session.status === 'active' && Date.parse(session.expires_at) <= Date.now()) {
        isCorrect = false
        nextQuestionId = null
      } else {
        if (session.status !== 'active' || session.current_question_id !== body.questionId) {
          return noStoreJson({ error: 'Soru artık geçerli değil' }, { status: 409 })
        }
        const publicQuestion = catalog.publicQuestionById.get(body.questionId)
        const policyMatches = catalog.policyQuestions.filter((question) => question.id === body.questionId)
        if (!publicQuestion || policyMatches.length !== 1) throw new Error('diagnostic_question_mapping_invalid')
        if (body.selectedOption >= publicQuestion.content.options.length) {
          return noStoreJson({ error: 'Gecersiz secenek' }, { status: 400 })
        }
        const domainQuestionResult = await admin.from('questions').select('*').eq('id', body.questionId).maybeSingle()
        if (domainQuestionResult.error) throw domainQuestionResult.error
        const domainQuestion = parseQuestionRows(domainQuestionResult.data ? [domainQuestionResult.data] : [])[0]
        if (!domainQuestion) throw new Error('diagnostic_grade_question_invalid')
        isCorrect = domainQuestion.content.answer === body.selectedOption

        const policyAnswers: DiagnosticAnswerInput[] = recordedAnswers.map((answer) => ({
          questionId: answer.question_id,
          outcomeId: answer.outcome_id,
          difficulty: Number(answer.difficulty),
          isCorrect: answer.is_correct,
        }))
        const currentPolicyQuestion = policyMatches[0]
        const next = selectNextDiagnosticQuestion({
          kind: session.kind,
          seed: session.id,
          outcomes: catalog.policyOutcomes,
          questions: catalog.policyQuestions,
          priorStates: catalog.priorStates,
          answers: [...policyAnswers, {
            questionId: body.questionId,
            outcomeId: currentPolicyQuestion.outcomeId,
            difficulty: currentPolicyQuestion.difficulty,
            isCorrect,
          }],
        })
        nextQuestionId = next?.questionId ?? null
      }

      const { data, error } = await admin.rpc('record_adaptive_diagnostic_answer', {
        p_user_id: auth.user.id,
        p_session_id: body.sessionId,
        p_question_id: body.questionId,
        p_is_correct: isCorrect,
        p_response_time_ms: responseTimeMs,
        p_request_id: body.requestId,
        p_next_question_id: nextQuestionId,
      })
      if (error) throw error
      const result = parseRecordRpc(data)
      if (!result) throw new Error('diagnostic_record_result_invalid')
      const question = result.nextQuestionId
        ? (catalog.publicQuestionById.get(result.nextQuestionId) ?? null)
        : null
      if (result.status === 'active' && !question) throw new Error('diagnostic_next_question_invalid')
      const summary = await loadSummary(admin, auth.user.id, catalog.outcomes)

      return noStoreJson({
        supported: true,
        game: PILOT_GAME,
        examRef: PILOT_EXAM_REF,
        session: publicSession({
          id: session.id,
          kind: session.kind,
          status: result.status,
          expiresAt: session.expires_at,
          answered: result.answeredCount,
          coveredOutcomes: result.coveredOutcomes,
          question,
        }),
        summary,
      } satisfies DiagnosticResponsePublic)
    } catch (error) {
      console.error('[AdaptiveDiagnostic] answer failed:', (error as { code?: string } | null)?.code ?? 'internal')
      return noStoreJson({ error: 'Cevap kaydedilemedi' }, { status: 500 })
    }
  }

  return noStoreJson({ error: 'Gecersiz istek' }, { status: 400 })
}
