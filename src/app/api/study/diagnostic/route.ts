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
import {
  isMissingDiagnosticResolver,
  LEGACY_ADAPTIVE_DIAGNOSTIC_SCOPE,
  resolveReleasedDiagnosticScope,
  supportsAdaptiveDiagnosticScope,
  type ReleasedDiagnosticScope,
} from '@/lib/diagnostic/scope'
import { resolveReleasedMasteryScope } from '@/lib/mastery/scope'
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

const MAX_CATALOG_QUESTIONS_PER_OUTCOME = 50
const QUESTION_ID_BATCH_SIZE = 100

const startSchema = z.object({
  action: z.literal('start'),
  game: z.enum(GAME_SLUGS),
  examRef: z.string().min(2).max(10).regex(/^[A-Z0-9-]+$/),
}).strict()

const answerSchema = z.object({
  action: z.literal('answer'),
  sessionId: z.string().uuid(),
  questionId: z.string().uuid(),
  // Diagnostic revisions may carry 2-10 options. Keep the HTTP contract
  // aligned with the immutable DB snapshot gate (indexes 0-9).
  selectedOption: z.number().int().min(0).max(9),
  responseTimeMs: z.number().int().min(100).max(600_000),
  requestId: z.string().uuid(),
}).strict()

const snapshotQuestionSchema = z.object({
  id: z.string().uuid(),
  game: z.enum(GAME_SLUGS),
  category: z.string(),
  subcategory: z.string().nullable(),
  topic: z.string().nullable(),
  difficulty: z.number().int().min(1).max(5),
  level_tag: z.string().nullable(),
  base_points: z.number().int().nonnegative(),
  content: z.object({
    question: z.string(),
    options: z.array(z.string()).min(2).max(10),
    sentence: z.string().optional(),
    passage: z.string().optional(),
    context: z.string().optional(),
    type: z.string().optional(),
  }).strict(),
}).strict()

type AdminClient = ReturnType<typeof createServiceRoleClient>

async function callAdminRpc(
  admin: AdminClient,
  name: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: { code?: string } | null }> {
  return await admin.rpc(name as never, args as never) as unknown as {
    data: unknown
    error: { code?: string } | null
  }
}

interface SessionRow {
  id: string
  user_id: string
  game: string
  exam_ref: string
  taxonomy_version: string
  kind: DiagnosticKind
  status: 'active' | 'completed' | 'abandoned'
  current_question_id: string | null
  current_question_revision_id: string | null
  current_question_correct_option: number | null
  current_question_option_count: number | null
  current_question_outcome_id: string | null
  current_question_difficulty: number | null
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
  selected_option: number | null
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

interface RuntimeDiagnosticScope extends ReleasedDiagnosticScope {
  engine: 'v3' | 'legacy'
}

function bindPolicyQuestionsToRecordedEvidence(
  questions: readonly DiagnosticQuestionInput[],
  answers: readonly DiagnosticAnswerInput[],
): DiagnosticQuestionInput[] {
  const evidenceByQuestionId = new Map(
    answers.map((answer) => [answer.questionId, {
      id: answer.questionId,
      outcomeId: answer.outcomeId,
      difficulty: answer.difficulty,
    }]),
  )

  return [
    ...questions.filter((question) => !evidenceByQuestionId.has(question.id)),
    ...evidenceByQuestionId.values(),
  ]
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

function validProgress(
  answered: unknown,
  covered: unknown,
  scope: ReleasedDiagnosticScope,
): boolean {
  return Number.isInteger(answered)
    && Number(answered) >= 0
    && Number(answered) <= scope.questionCount
    && Number.isInteger(covered)
    && Number(covered) >= 0
    && Number(covered) <= scope.outcomeCount
    && Number(covered) <= Number(answered)
}

function parseStartRpc(value: unknown, scope: ReleasedDiagnosticScope): StartRpcResult | null {
  if (!isRecord(value)) return null
  if (
    !isUuid(value.sessionId)
    || !isUuid(value.currentQuestionId)
    || (value.kind !== 'initial' && value.kind !== 'recheck')
    || !validProgress(value.answeredCount, value.coveredOutcomes, scope)
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

function parseRecordRpc(value: unknown, scope: ReleasedDiagnosticScope): RecordRpcResult | null {
  if (!isRecord(value)) return null
  if (
    typeof value.alreadyProcessed !== 'boolean'
    || !['active', 'completed', 'abandoned'].includes(String(value.status))
    || !(value.nextQuestionId === null || isUuid(value.nextQuestionId))
    || !validProgress(value.answeredCount, value.coveredOutcomes, scope)
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
  return { supported: false, game, examRef, policy: null, session: null, summary: null }
}

async function resolveLegacyMathScope(admin: AdminClient): Promise<RuntimeDiagnosticScope | null> {
  const legacy = LEGACY_ADAPTIVE_DIAGNOSTIC_SCOPE
  const resolution = await resolveReleasedMasteryScope(
    (args) => admin.rpc('resolve_released_curriculum_scope', args),
    legacy.game,
    legacy.displayExamRef,
  )
  if (resolution.error) throw new Error('diagnostic_scope_resolution_failed')
  const scope = resolution.scope
  if (!(
    scope?.diagnosticEnabled
    && supportsAdaptiveDiagnosticScope({
      game: scope.game,
      examRef: scope.displayExamRef,
      questionExamRef: scope.questionExamRef,
      taxonomyVersion: scope.taxonomyVersion,
    })
  )) return null
  return { ...legacy, engine: 'legacy' }
}

async function resolveAdaptiveDiagnosticScope(
  admin: AdminClient,
  game: (typeof GAME_SLUGS)[number],
  examRef: string,
): Promise<RuntimeDiagnosticScope | null> {
  const resolution = await resolveReleasedDiagnosticScope(
    (args) => callAdminRpc(admin, 'resolve_released_diagnostic_scope', args),
    game,
    examRef,
  )
  if (!resolution.error) return resolution.scope ? { ...resolution.scope, engine: 'v3' } : null
  if (!isMissingDiagnosticResolver(resolution.code)) {
    throw new Error('diagnostic_scope_resolution_failed')
  }
  if (
    game !== LEGACY_ADAPTIVE_DIAGNOSTIC_SCOPE.game
    || examRef !== LEGACY_ADAPTIVE_DIAGNOSTIC_SCOPE.displayExamRef
  ) return null
  return resolveLegacyMathScope(admin)
}

function publicSession(input: {
  id: string
  kind: DiagnosticKind
  status: DiagnosticSessionPublic['status']
  expiresAt: string
  answered: number
  coveredOutcomes: number
  question: PublicQuestion | null
  scope: ReleasedDiagnosticScope
}): DiagnosticSessionPublic {
  return {
    id: input.id,
    kind: input.kind,
    status: input.status,
    expiresAt: input.expiresAt,
    progress: {
      answered: input.answered,
      total: input.scope.questionCount,
      coveredOutcomes: input.coveredOutcomes,
      totalOutcomes: input.scope.outcomeCount,
    },
    question: input.question,
  }
}

async function loadOutcomes(
  admin: AdminClient,
  scope: ReleasedDiagnosticScope,
): Promise<DiagnosticSummaryOutcomeInput[]> {
  const { data, error } = await admin
    .from('curriculum_outcomes')
    .select('id,code,title,category,sort_order')
    .eq('game', scope.game)
    .eq('exam_ref', scope.displayExamRef)
    .eq('taxonomy_version', scope.taxonomyVersion)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(scope.outcomeCount + 1)
  if (error) throw error
  const rows = (data ?? []) as OutcomeRow[]
  if (rows.length !== scope.outcomeCount) throw new Error('diagnostic_outcome_scope_invalid')
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
  scope: ReleasedDiagnosticScope,
): Promise<PriorStateRow[]> {
  const { data, error } = await admin
    .from('user_diagnostic_outcome_state')
    .select('outcome_id,score,recommended_difficulty,attempts,correct_attempts,last_diagnosed_at')
    .eq('user_id', userId)
    .in('outcome_id', outcomeIds)
  if (error) throw error
  const rows = (data ?? []) as PriorStateRow[]
  if (rows.length !== 0 && rows.length !== scope.outcomeCount) {
    throw new Error('diagnostic_state_scope_invalid')
  }
  return rows
}

async function loadSummary(
  admin: AdminClient,
  userId: string,
  scope: ReleasedDiagnosticScope,
  outcomes?: DiagnosticSummaryOutcomeInput[],
): Promise<DiagnosticSummaryPublic | null> {
  const resolvedOutcomes = outcomes ?? await loadOutcomes(admin, scope)
  const rows = await loadPriorRows(admin, userId, resolvedOutcomes.map((outcome) => outcome.id), scope)
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
    { outcomeCount: scope.outcomeCount, maxPerOutcome: scope.maxPerOutcome },
  )
  if (!summary) throw new Error('diagnostic_summary_invalid')
  return summary
}

async function loadCatalog(
  admin: AdminClient,
  userId: string,
  scope: ReleasedDiagnosticScope,
): Promise<Catalog> {
  const outcomes = await loadOutcomes(admin, scope)
  const outcomeIds = outcomes.map((outcome) => outcome.id)
  const [mappingResults, priorRows] = await Promise.all([
    Promise.all(outcomeIds.map((outcomeId) => admin
      .from('question_outcomes')
      .select('question_id,outcome_id')
      .eq('outcome_id', outcomeId)
      .eq('is_primary', true)
      .eq('mapping_source', 'taxonomy_auto')
      .order('question_id', { ascending: true })
      .limit(MAX_CATALOG_QUESTIONS_PER_OUTCOME))),
    loadPriorRows(admin, userId, outcomeIds, scope),
  ])
  for (const result of mappingResults) if (result.error) throw result.error
  const mappingRows = mappingResults.flatMap((result, index) => (
    (result.data ?? []).filter((mapping) => mapping.outcome_id === outcomeIds[index])
  ))
  const questionIds = [...new Set(mappingRows.map((mapping) => mapping.question_id))]
  const questionBatches = Array.from(
    { length: Math.ceil(questionIds.length / QUESTION_ID_BATCH_SIZE) },
    (_, index) => questionIds.slice(index * QUESTION_ID_BATCH_SIZE, (index + 1) * QUESTION_ID_BATCH_SIZE),
  )
  const questionResults = await Promise.all(questionBatches.map((ids) => {
    let query = admin
      .from('questions')
      .select('*')
      .in('id', ids)
      .eq('game', scope.game)
      .eq('is_active', true)
    query = scope.questionExamRef === null
      ? query.is('exam_ref', null)
      : query.eq('exam_ref', scope.questionExamRef)
    return query.order('id', { ascending: true })
  }))
  for (const result of questionResults) if (result.error) throw result.error

  const domainQuestions = parseQuestionRows(questionResults.flatMap((result) => result.data ?? []))
  const questionById = new Map(domainQuestions.map((question) => [question.id, question]))
  const policyQuestions: DiagnosticQuestionInput[] = []
  for (const mapping of mappingRows) {
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
    .select('id,user_id,game,exam_ref,taxonomy_version,kind,status,current_question_id,current_question_revision_id,current_question_correct_option,current_question_option_count,current_question_outcome_id,current_question_difficulty,answered_count,covered_outcomes,expires_at,created_at')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as SessionRow | null) ?? null
}

async function loadAnswers(
  admin: AdminClient,
  userId: string,
  sessionId: string,
  questionCount: number,
): Promise<AnswerRow[]> {
  const { data, error } = await admin
    .from('adaptive_diagnostic_answers')
    .select('question_id,outcome_id,difficulty,is_correct,selected_option,sequence,response_time_ms,request_id,next_question_id,status_after,covered_outcomes_after')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('sequence', { ascending: true })
    .limit(questionCount)
  if (error) throw error
  return (data ?? []) as AnswerRow[]
}

async function loadSnapshotQuestion(
  admin: AdminClient,
  userId: string,
  sessionId: string,
  scope: ReleasedDiagnosticScope,
): Promise<PublicQuestion> {
  const { data, error } = await admin.rpc('get_adaptive_diagnostic_question_v2', {
    p_user_id: userId,
    p_session_id: sessionId,
  })
  if (error) throw error
  const parsed = snapshotQuestionSchema.safeParse(data)
  if (!parsed.success || parsed.data.game !== scope.game) {
    throw new Error('diagnostic_question_snapshot_invalid')
  }
  return parsed.data as PublicQuestion
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
  const rawExamRef = searchParams.get('exam_ref')
  const examRef = rawExamRef?.trim() ?? null
  if (!game || !GAME_SLUGS.some((candidate) => candidate === game)) {
    return noStoreJson({ error: 'Gecerli oyun belirtilmedi' }, { status: 400 })
  }
  if (
    !examRef
    || rawExamRef !== examRef
    || examRef !== examRef.toUpperCase()
    || !/^[A-Z0-9-]{2,10}$/.test(examRef)
  ) {
    return noStoreJson({ error: 'Gecersiz sinav referansi' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  try {
    const scope = await resolveAdaptiveDiagnosticScope(
      admin,
      game as (typeof GAME_SLUGS)[number],
      examRef,
    )
    if (!scope) return noStoreJson(unsupported(game, examRef))
    const [{ data: latest, error: latestError }, summary] = await Promise.all([
      admin
        .from('adaptive_diagnostic_sessions')
        .select('id,user_id,game,exam_ref,taxonomy_version,kind,status,current_question_id,current_question_revision_id,current_question_correct_option,current_question_option_count,current_question_outcome_id,current_question_difficulty,answered_count,covered_outcomes,expires_at,created_at')
        .eq('user_id', auth.user.id)
        .eq('game', scope.game as never)
        .eq('exam_ref', scope.displayExamRef as never)
        .eq('taxonomy_version', scope.taxonomyVersion as never)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      loadSummary(admin, auth.user.id, scope),
    ])
    if (latestError) throw latestError

    const session = latest as SessionRow | null
    let publicSessionValue: DiagnosticSessionPublic | null = null
    if (session) {
      if (
        session.game !== scope.game
        || session.exam_ref !== scope.displayExamRef
        || session.taxonomy_version !== scope.taxonomyVersion
      ) throw new Error('diagnostic_session_scope_invalid')
      const expired = session.status === 'active' && Date.parse(session.expires_at) <= Date.now()
      let question: PublicQuestion | null = null
      if (session.status === 'active' && !expired && session.current_question_id) {
        question = await loadSnapshotQuestion(admin, auth.user.id, session.id, scope)
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
        scope,
      })
    }

    return noStoreJson({
      supported: true,
      game: scope.game,
      examRef: scope.displayExamRef,
      policy: {
        version: scope.policyVersion,
        questionCount: scope.questionCount,
        outcomeCount: scope.outcomeCount,
        maxPerOutcome: scope.maxPerOutcome,
      },
      session: publicSessionValue,
      summary,
    } satisfies DiagnosticResponsePublic)
  } catch (error) {
    console.error('[AdaptiveDiagnostic] GET failed:', (error as { code?: string } | null)?.code ?? 'internal')
    return noStoreJson({ error: 'Kisa tarama yuklenemedi' }, { status: 500 })
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
    try {
      const scope = await resolveAdaptiveDiagnosticScope(admin, parsed.data.game, parsed.data.examRef)
      if (!scope) return noStoreJson(unsupported(parsed.data.game, parsed.data.examRef))
      const catalog = await loadCatalog(admin, auth.user.id, scope)
      const sessionId = randomUUID()
      const kind: DiagnosticKind = catalog.priorStates.length === scope.outcomeCount ? 'recheck' : 'initial'
      const first = selectNextDiagnosticQuestion({
        kind,
        seed: sessionId,
        questionCount: scope.questionCount,
        maxPerOutcome: scope.maxPerOutcome,
        outcomes: catalog.policyOutcomes,
        questions: catalog.policyQuestions,
        priorStates: catalog.priorStates,
        answers: [],
      })
      if (!first) throw new Error('diagnostic_first_question_unavailable')

      const { data, error } = scope.engine === 'v3'
        ? await callAdminRpc(admin, 'start_adaptive_diagnostic_v3', {
          p_user_id: auth.user.id,
          p_session_id: sessionId,
          p_game: scope.game,
          p_display_exam_ref: scope.displayExamRef,
          p_first_question_id: first.questionId,
        })
        : await admin.rpc('start_adaptive_diagnostic', {
          p_user_id: auth.user.id,
          p_session_id: sessionId,
          p_first_question_id: first.questionId,
        })
      if (error) throw error
      const result = parseStartRpc(data, scope)
      if (!result) throw new Error('diagnostic_start_result_invalid')
      const resultMappings = catalog.policyQuestions.filter((question) => question.id === result.currentQuestionId)
      const question = await loadSnapshotQuestion(admin, auth.user.id, result.sessionId, scope)
      if (question.id !== result.currentQuestionId || resultMappings.length !== 1) throw new Error('diagnostic_start_question_invalid')
      const summary = await loadSummary(admin, auth.user.id, scope, catalog.outcomes)

      return noStoreJson({
        supported: true,
        game: scope.game,
        examRef: scope.displayExamRef,
        policy: {
          version: scope.policyVersion,
          questionCount: scope.questionCount,
          outcomeCount: scope.outcomeCount,
          maxPerOutcome: scope.maxPerOutcome,
        },
        session: publicSession({
          id: result.sessionId,
          kind: result.kind,
          status: 'active',
          expiresAt: result.expiresAt,
          answered: result.answeredCount,
          coveredOutcomes: result.coveredOutcomes,
          question,
          scope,
        }),
        summary,
      } satisfies DiagnosticResponsePublic)
    } catch (error) {
      console.error('[AdaptiveDiagnostic] start failed:', (error as { code?: string } | null)?.code ?? 'internal')
      return noStoreJson({ error: 'Kisa tarama baslatilamadi' }, { status: 500 })
    }
  }

  if (action === 'answer') {
    const parsed = answerSchema.safeParse(rawBody)
    if (!parsed.success) return noStoreJson({ error: 'Gecersiz istek' }, { status: 400 })
    const body = parsed.data

    try {
      const session = await loadSession(admin, auth.user.id, body.sessionId)
      if (!session) return noStoreJson({ error: 'Kisa tarama bulunamadi' }, { status: 404 })
      if (
        !GAME_SLUGS.includes(session.game as (typeof GAME_SLUGS)[number])
        || !/^[A-Z0-9-]{2,10}$/.test(session.exam_ref)
        || !/^ba-[a-z0-9-]+-v[0-9]+$/.test(session.taxonomy_version)
      ) throw new Error('diagnostic_session_scope_invalid')
      const scope = await resolveAdaptiveDiagnosticScope(
        admin,
        session.game as (typeof GAME_SLUGS)[number],
        session.exam_ref,
      )
      if (!scope || scope.taxonomyVersion !== session.taxonomy_version) {
        return noStoreJson({ error: 'Tarama kapsamı artık geçerli değil' }, { status: 409 })
      }
      const [catalog, recordedAnswers] = await Promise.all([
        loadCatalog(admin, auth.user.id, scope),
        loadAnswers(admin, auth.user.id, body.sessionId, scope.questionCount),
      ])
      const replay = recordedAnswers.find((answer) => (
        answer.request_id === body.requestId || answer.question_id === body.questionId
      ))

      let isCorrect: boolean
      let selectedOption = body.selectedOption
      let responseTimeMs = body.responseTimeMs
      let nextQuestionId: string | null
      if (replay) {
        isCorrect = replay.is_correct
        selectedOption = replay.selected_option ?? body.selectedOption
        responseTimeMs = replay.response_time_ms
        nextQuestionId = replay.next_question_id
      } else {
        if (session.status !== 'active' || session.current_question_id !== body.questionId) {
          return noStoreJson({ error: 'Soru artık geçerli değil' }, { status: 409 })
        }
        const publicQuestion = await loadSnapshotQuestion(admin, auth.user.id, session.id, scope)
        if (publicQuestion.id !== body.questionId) throw new Error('diagnostic_question_snapshot_invalid')
        if (
          !session.current_question_revision_id
          || session.current_question_correct_option === null
          || session.current_question_option_count === null
          || !session.current_question_outcome_id
          || session.current_question_difficulty === null
        ) throw new Error('diagnostic_question_snapshot_missing')
        if (
          session.current_question_option_count !== publicQuestion.content.options.length
          || body.selectedOption >= session.current_question_option_count
        ) {
          return noStoreJson({ error: 'Gecersiz secenek' }, { status: 400 })
        }
        isCorrect = session.current_question_correct_option === body.selectedOption

        const policyAnswers: DiagnosticAnswerInput[] = recordedAnswers.map((answer) => ({
          questionId: answer.question_id,
          outcomeId: answer.outcome_id,
          difficulty: Number(answer.difficulty),
          isCorrect: answer.is_correct,
        }))
        const answersWithCurrentEvidence: DiagnosticAnswerInput[] = [...policyAnswers, {
          questionId: body.questionId,
          outcomeId: session.current_question_outcome_id,
          difficulty: session.current_question_difficulty,
          isCorrect,
        }]
        const next = selectNextDiagnosticQuestion({
          kind: session.kind,
          seed: session.id,
          questionCount: scope.questionCount,
          maxPerOutcome: scope.maxPerOutcome,
          outcomes: catalog.policyOutcomes,
          questions: bindPolicyQuestionsToRecordedEvidence(
            catalog.policyQuestions,
            answersWithCurrentEvidence,
          ),
          priorStates: catalog.priorStates,
          answers: answersWithCurrentEvidence,
        })
        nextQuestionId = next?.questionId ?? null
      }

      const recordArgs = {
        p_user_id: auth.user.id,
        p_session_id: body.sessionId,
        p_question_id: body.questionId,
        p_selected_option: selectedOption,
        p_response_time_ms: responseTimeMs,
        p_request_id: body.requestId,
        // NULL marks the server-authoritative end of the adaptive sequence.
        p_next_question_id: nextQuestionId as string,
      }
      const { data, error } = scope.engine === 'v3'
        ? await callAdminRpc(admin, 'record_adaptive_diagnostic_answer_v3', recordArgs)
        : await admin.rpc('record_adaptive_diagnostic_answer_v2', recordArgs)
      if (error) throw error
      const result = parseRecordRpc(data, scope)
      if (!result) throw new Error('diagnostic_record_result_invalid')
      const question = result.nextQuestionId
        ? await loadSnapshotQuestion(admin, auth.user.id, session.id, scope)
        : null
      if (question && question.id !== result.nextQuestionId) throw new Error('diagnostic_next_question_snapshot_mismatch')
      if (result.status === 'active' && !question) throw new Error('diagnostic_next_question_invalid')
      const summary = await loadSummary(admin, auth.user.id, scope, catalog.outcomes)

      return noStoreJson({
        supported: true,
        game: scope.game,
        examRef: scope.displayExamRef,
        policy: {
          version: scope.policyVersion,
          questionCount: scope.questionCount,
          outcomeCount: scope.outcomeCount,
          maxPerOutcome: scope.maxPerOutcome,
        },
        session: publicSession({
          id: session.id,
          kind: session.kind,
          status: result.status,
          expiresAt: session.expires_at,
          answered: result.answeredCount,
          coveredOutcomes: result.coveredOutcomes,
          question,
          scope,
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
