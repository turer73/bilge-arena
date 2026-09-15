import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { GAME_SLUGS, getCategoriesForExam, type GameSlug } from '@/lib/constants/games'
import { isValidUuid } from '@/lib/utils/uuid'
import { trDayString } from '@/lib/utils/tr-date'
import { fetchDueQuestions } from '@/lib/review/due-questions'
import { parseQuestionRows, toPublicQuestion, type PublicQuestion } from '@/lib/utils/question-public'
import { defaultExamRefForType, type ExamType } from '@/lib/constants/exam-types'
import {
  isTytSocialEpochRpcConflict,
  issueVerifiedAttempt,
  readTytSocialLearningSnapshot,
  toPublicVerifiedQuestions,
  type TytSocialLearningEpoch,
} from '@/lib/verified-attempts'
import { buildPlanCandidates } from '@/lib/study/plan-candidates'
import type { PlanOutcomeState } from '@/lib/study/outcome-targets'
import { MASTERY_STATE_COLUMNS, toMasteryStateInput, type MasteryStateRow } from '@/lib/mastery/state-row'
import { composePlanV2 } from '@/lib/study/compose-plan-v2'
import {
  normalizeTodayPlanItems,
  parseDailyPlanRpcSnapshot,
  TODAY_PLAN_CONTENT_UNAVAILABLE,
  TODAY_PLAN_CONTENT_UNAVAILABLE_MESSAGE,
  type TodayPlanItem,
} from '@/lib/study/today-plan-contract'
import type { Question } from '@/types/database'
import type { Json } from '@/types/database.generated'
import {
  isMasteryScopeIntegrityClean,
  parseMasteryScopeIntegrity,
  resolveReleasedMasteryScope,
} from '@/lib/mastery/scope'
import { isTytSocialV2LearnerEnabled } from '@/lib/feature-flags/tyt-social-v2-server'

const ipLimiter = createRateLimiter('study-today-ip', 120, 60_000)
const userLimiter = createRateLimiter('study-today-user', 60, 60_000)

const VALID_GAMES = new Set(GAME_SLUGS)
const VALID_EXAM_REFS = new Set(['TYT', 'LGS', 'AYT-SAY', 'AYT-EA', 'AYT-SOZ', 'YDT'])
const BASE_QUESTION_LIMIT = 300
const OUTCOME_LIMIT = 200
const OUTCOME_MAPPING_QUESTION_CHUNK = 75
const OUTCOME_MAPPING_PAGE_SIZE = 500
const RECENT_QUESTION_LIMIT = 50

function noStoreJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store' },
  })
}

async function fetchOutcomeMappingsForQuestions(
  admin: ReturnType<typeof createServiceRoleClient>,
  questionIds: string[],
) {
  const rows: Array<{ question_id: string; outcome_id: string }> = []
  for (let offset = 0; offset < questionIds.length; offset += OUTCOME_MAPPING_QUESTION_CHUNK) {
    const chunk = questionIds.slice(offset, offset + OUTCOME_MAPPING_QUESTION_CHUNK)
    for (let pageStart = 0; ; pageStart += OUTCOME_MAPPING_PAGE_SIZE) {
      // range() is inclusive. Fixed-size pages avoid PostgREST's server row cap
      // without inventing a per-question mapping cardinality that the DB does
      // not enforce.
      const { data, error } = await admin
        .from('question_outcomes')
        .select('question_id,outcome_id')
        .in('question_id', chunk)
        .order('question_id', { ascending: true })
        .order('outcome_id', { ascending: true })
        .range(pageStart, pageStart + OUTCOME_MAPPING_PAGE_SIZE - 1)
      if (error) throw error
      const page = data ?? []
      rows.push(...page)
      if (page.length < OUTCOME_MAPPING_PAGE_SIZE) break
    }
  }
  return rows
}
/** `.in()` does not preserve the immutable snapshot order, so restore it. */
async function fetchQuestionsInOrder(
  admin: ReturnType<typeof createServiceRoleClient>,
  ids: string[],
  game: GameSlug,
  examRef: string | null,
): Promise<PublicQuestion[] | null> {
  if (ids.length === 0) return []
  const { data, error } = await admin.from('questions').select('*').in('id', ids)
  if (error) throw error
  // A saved plan is immutable evidence, not a pool to silently shorten/refill.
  // Check raw state: the domain parser historically defaults NULL active=true.
  if (!data || data.length !== ids.length || data.some((row) => (
    row.is_active !== true || row.game !== game || row.exam_ref !== examRef
  ))) return null
  const byId = new Map(parseQuestionRows(data).map((question) => [question.id, question]))
  if (byId.size !== ids.length || ids.some((id) => !byId.has(id))) return null
  return ids
    .map((id) => byId.get(id))
    .filter((question): question is Question => !!question)
    .map(toPublicQuestion)
}

function unavailablePlan(game: GameSlug, examRef: string | null) {
  // No question IDs, partial progress, content, or attempt ticket on conflict.
  return noStoreJson({
    code: TODAY_PLAN_CONTENT_UNAVAILABLE,
    error: TODAY_PLAN_CONTENT_UNAVAILABLE_MESSAGE,
    game,
    examRef,
    recovery: 'manual_practice',
  }, { status: 409 })
}

async function respondWithTicket(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  game: GameSlug,
  planDate: string,
  examRef: string | null,
  questions: PublicQuestion[],
  completedIds: string[],
  items: TodayPlanItem[],
  planId?: string,
) {
  const returnedIds = new Set(questions.map((question) => question.id))
  const safeCompletedIds = completedIds.filter((id) => returnedIds.has(id))
  const safeItems = items.filter((item) => returnedIds.has(item.questionId))

  if (questions.length === 0) {
    return noStoreJson({
      planDate,
      game,
      examRef,
      questions,
      completedIds: [],
      items: [],
      attemptId: null,
      expiresAt: null,
    })
  }

  try {
    const ticket = await issueVerifiedAttempt(admin, {
      userId,
      game,
      mode: 'practice',
      questionIds: questions.map((question) => question.id),
      examRef,
      sourcePlanId: planId,
      requestId: crypto.randomUUID(),
    })
    const verifiedQuestions = toPublicVerifiedQuestions(ticket.questionSnapshots)
    if (
      verifiedQuestions.length !== questions.length
      || verifiedQuestions.some((question, index) => question.id !== questions[index]?.id)
    ) throw new Error('verified_attempt_snapshot_mismatch')
    return noStoreJson({
      planDate,
      game,
      examRef,
      questions: verifiedQuestions,
      completedIds: safeCompletedIds,
      items: safeItems,
      attemptId: ticket.attemptId,
      expiresAt: ticket.expiresAt,
    })
  } catch {
    // Quarantine may occur after the first read. The DB issuer remains the
    // authority. Re-read once to classify known content drift, never retry
    // issuance or rewrite the immutable plan. Infrastructure failures stay 500.
    try {
      if (await fetchQuestionsInOrder(admin, questions.map((question) => question.id), game, examRef) === null) {
        return unavailablePlan(game, examRef)
      }
    } catch {
      // A failed read is unknown state, not proof of content unavailability.
    }
    console.error('[/api/study/today] verified attempt issuance failed')
    return noStoreJson({ error: 'Plan baslatilamadi' }, { status: 500 })
  }
}

/** GET /api/study/today?game=<slug>&exam_ref=<ref>&choice_category=<slug> */
export async function GET(request: NextRequest) {
  const tytSocialV2Enabled = isTytSocialV2LearnerEnabled()
  const ipRl = await ipLimiter.check(getClientIp(request.headers))
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return noStoreJson({ error: 'Yetkisiz' }, { status: 401 })

  const userRl = await userLimiter.check(user.id)
  if (!userRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
    )
  }

  const { searchParams } = new URL(request.url)
  const rawGame = searchParams.get('game')
  if (!rawGame || !VALID_GAMES.has(rawGame as GameSlug)) {
    return noStoreJson({ error: 'Gecerli oyun belirtilmedi' }, { status: 400 })
  }
  const game = rawGame as GameSlug
  const requestedExamRef = searchParams.get('exam_ref')
  if (requestedExamRef && !VALID_EXAM_REFS.has(requestedExamRef)) {
    return noStoreJson({ error: 'Gecersiz sinav referansi' }, { status: 400 })
  }
  const choiceCategory = searchParams.get('choice_category')

  const admin = createServiceRoleClient()
  const planDate = trDayString()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('exam_type')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('[/api/study/today] profile exam query failed:', profileError.code)
    return noStoreJson({ error: 'Plan olusturulamadi' }, { status: 500 })
  }
  const examType = (profile?.exam_type as ExamType | null | undefined) ?? null
  if (
    requestedExamRef
    && ((examType === 'lgs' && requestedExamRef !== 'LGS')
      || (examType === 'yks' && requestedExamRef === 'LGS'))
  ) {
    return noStoreJson({ error: 'Sinav tercihiyle uyumsuz referans' }, { status: 400 })
  }
  const examRef = game === 'wordquest'
    ? null
    : (requestedExamRef ?? defaultExamRefForType(examType))
  if (choiceCategory && !getCategoriesForExam(game, examRef).includes(choiceCategory)) {
    return noStoreJson({ error: 'Gecersiz secim kategorisi' }, { status: 400 })
  }

  let lookupQuery = admin
    .from('daily_plan')
    .select('*')
    .eq('user_id', user.id)
    .eq('game', game)
    .eq('plan_date', planDate)
  lookupQuery = examRef === null
    ? lookupQuery.is('exam_ref', null)
    : lookupQuery.eq('exam_ref', examRef)
  const { data: existing, error: lookupError } = await lookupQuery.maybeSingle()
  if (lookupError) {
    console.error('[/api/study/today] plan lookup failed:', lookupError.code)
    return noStoreJson({ error: 'Plan olusturulamadi' }, { status: 500 })
  }

  if (existing) {
    const questionIds = existing.question_ids as string[]
    const legacyCompletedIds = (existing.completed_ids as string[]) ?? []
    const { data: itemRows, error: itemError } = await admin
      .from('daily_plan_items')
      .select('question_id,position,slot_type,source_type,completed_at')
      .eq('plan_id', existing.id)
      .order('position', { ascending: true })
    if (itemError) {
      console.error('[/api/study/today] item lookup failed:', itemError.code)
      return noStoreJson({ error: 'Plan olusturulamadi' }, { status: 500 })
    }
    const items = normalizeTodayPlanItems(itemRows ?? [], questionIds, legacyCompletedIds)
    if (!items) return noStoreJson({ error: 'Plan olusturulamadi' }, { status: 500 })
    const completedIds = (itemRows ?? []).length > 0
      ? items.filter((item) => item.completed).map((item) => item.questionId)
      : legacyCompletedIds
    try {
      const questions = await fetchQuestionsInOrder(admin, questionIds, game, examRef)
      if (questions === null) return unavailablePlan(game, examRef)
      return respondWithTicket(
        admin,
        user.id,
        game,
        existing.plan_date,
        (existing.exam_ref as string | null) ?? null,
        questions,
        completedIds,
        items,
        existing.id,
      )
    } catch (error) {
      console.error('[/api/study/today] snapshot question query failed:', (error as { code?: string })?.code)
      return noStoreJson({ error: 'Plan olusturulamadi' }, { status: 500 })
    }
  }

  const masteryDisplayExamRef = game === 'wordquest' ? 'YDT' : examRef
  const scopeResolution = masteryDisplayExamRef
    ? await resolveReleasedMasteryScope(
      (args) => admin.rpc('resolve_released_curriculum_scope', args),
      game,
      masteryDisplayExamRef,
    )
    : { scope: null, error: false as const }
  if (scopeResolution.error) {
    console.error('[/api/study/today] curriculum scope resolution failed:', scopeResolution.code ?? 'invalid')
    return noStoreJson({ error: 'Plan olusturulamadi' }, { status: 500 })
  }
  let masteryScope = scopeResolution.scope
  if (masteryScope) {
    const integrityResult = await admin.rpc('curriculum_scope_integrity', {
      p_game: game,
      p_display_exam_ref: masteryScope.displayExamRef,
      p_taxonomy_version: masteryScope.taxonomyVersion,
    })
    if (integrityResult.error) {
      console.error('[/api/study/today] curriculum scope integrity failed:', integrityResult.error.code ?? 'invalid')
      return noStoreJson({ error: 'Plan olusturulamadi' }, { status: 500 })
    }
    if (!isMasteryScopeIntegrityClean(parseMasteryScopeIntegrity(integrityResult.data))) {
      console.warn('[/api/study/today] released curriculum scope failed integrity; outcome personalization disabled')
      masteryScope = null
    }
  }

  let baseQuery = admin
    .from('questions')
    .select('*')
    .eq('game', game)
    .eq('is_active', true)
  baseQuery = examRef === null
    ? baseQuery.is('exam_ref', null)
    : baseQuery.eq('exam_ref', examRef)

  const outcomePromise = masteryScope
    ? admin
      .from('curriculum_outcomes')
      .select('id,code,category,sort_order')
      .eq('game', game)
      .eq('exam_ref', masteryScope.displayExamRef)
      .eq('taxonomy_version', masteryScope.taxonomyVersion)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
      .limit(OUTCOME_LIMIT)
    : Promise.resolve({ data: [], error: null })

  const duePromise = fetchDueQuestions(admin, user.id, game, null, null, examRef, 'exact')
    .then((data) => ({ data, error: null as unknown }))
    .catch((error: unknown) => ({ data: null, error }))
  const [dueResult, baseResult, outcomeResult, historyResult] = await Promise.all([
    duePromise,
    baseQuery.order('id', { ascending: true }).limit(BASE_QUESTION_LIMIT),
    outcomePromise,
    admin
      .from('user_question_history')
      .select('question_id')
      .eq('user_id', user.id)
      .order('last_seen_at', { ascending: false })
      .limit(RECENT_QUESTION_LIMIT),
  ])

  if (dueResult.error || baseResult.error || outcomeResult.error || historyResult.error) {
    const error = dueResult.error
      ?? baseResult.error
      ?? outcomeResult.error
      ?? historyResult.error
    console.error('[/api/study/today] candidate query failed:', (error as { code?: string } | null)?.code)
    return noStoreJson({ error: 'Plan olusturulamadi' }, { status: 500 })
  }

  let dueQuestions = dueResult.data ?? []
  let baseQuestions = parseQuestionRows(baseResult.data)
  const isScopedSocial = tytSocialV2Enabled && game === 'sosyal' && examRef === 'TYT'
  let tytSocialStates: MasteryStateRow[] | null = null
  let tytSocialEpoch: TytSocialLearningEpoch | null = null
  let allowedOutcomeCategories: Set<string> | null = null
  if (isScopedSocial) {
    try {
      const selection = await readTytSocialLearningSnapshot(admin, user.id, [
        ...dueQuestions.map(question => question.id),
        ...baseQuestions.map(question => question.id),
      ])
      if (selection.status !== 'active') {
        return noStoreJson(
          { error: selection.status === 'setup_required'
            ? 'TYT Sosyal cevaplama düzeni seçilmelidir'
            : 'Plan olusturulamadi' },
          { status: selection.status === 'setup_required' ? 409 : 503 },
        )
      }
      if (masteryScope && selection.context.taxonomyVersion !== masteryScope.taxonomyVersion) {
        return noStoreJson({ error: 'Plan olusturulamadi' }, { status: 503 })
      }
      const allowedIds = new Set(selection.allowedQuestionIds)
      dueQuestions = dueQuestions.filter(question => allowedIds.has(question.id))
      baseQuestions = baseQuestions.filter(question => allowedIds.has(question.id))
      tytSocialStates = selection.states
      tytSocialEpoch = {
        policyVersion: selection.context.policyVersion,
        selectionEventId: selection.context.selectionEventId,
      }
      if (masteryScope) allowedOutcomeCategories = new Set(selection.context.allowedCategories)
    } catch {
      return noStoreJson({ error: 'Plan olusturulamadi' }, { status: 500 })
    }
  }
  const outcomes = (outcomeResult.data ?? [])
    .filter((row) => !allowedOutcomeCategories || allowedOutcomeCategories.has(row.category))
    .map((row) => ({
      id: row.id,
      code: row.code,
      category: row.category,
      sortOrder: row.sort_order,
    }))
  const outcomeIds = outcomes.map((outcome) => outcome.id)
  const outcomeIdSet = new Set(outcomeIds)

  let outcomeStates: PlanOutcomeState[] = []
  let mappings: Array<{ questionId: string; outcomeId: string }> = []

  if (outcomeIds.length > 0) {
    const [stateResult, mappingResult] = await Promise.all([
      isScopedSocial
        ? Promise.resolve({ data: tytSocialStates, error: null })
        : admin
          .from('user_outcome_state')
          .select(MASTERY_STATE_COLUMNS)
          .eq('user_id', user.id)
          .in('outcome_id', outcomeIds)
          .limit(OUTCOME_LIMIT),
      fetchOutcomeMappingsForQuestions(
        admin,
        baseQuestions.map((question) => question.id),
      )
        .then((data) => ({ data, error: null as { code?: string } | null }))
        .catch((error: unknown) => ({
          data: null,
          error: error as { code?: string },
        })),
    ])
    if (stateResult.error || mappingResult.error || !Array.isArray(stateResult.data)) {
      console.error(
        '[/api/study/today] outcome evidence query failed:',
        (stateResult.error ?? mappingResult.error)?.code,
      )
      return noStoreJson({ error: 'Plan olusturulamadi' }, { status: 500 })
    }
    outcomeStates = (stateResult.data as MasteryStateRow[])
      .filter((row) => outcomeIdSet.has(row.outcome_id))
      .map(toMasteryStateInput)
    mappings = (mappingResult.data ?? [])
      .filter((row) => outcomeIdSet.has(row.outcome_id))
      .map((row) => ({ questionId: row.question_id, outcomeId: row.outcome_id }))
  }

  const recentQuestionIds = (historyResult.data ?? [])
    .map((row) => row.question_id)
    .filter((id): id is string => isValidUuid(id))
  const seed = `${user.id}|${planDate}|${game}|${examRef ?? 'none'}`
  const draft = composePlanV2(buildPlanCandidates({
    seed,
    dueQuestions,
    baseQuestions,
    outcomes,
    outcomeStates,
    mappings,
    recentQuestionIds,
    selectedCategory: choiceCategory,
  }))

  if (draft.length === 0) {
    return respondWithTicket(admin, user.id, game, planDate, examRef, [], [], [])
  }
  const rpcItems = draft.map((item) => ({
    position: item.position,
    question_id: item.questionId,
    slot_type: item.slotType,
    source_type: item.sourceType,
    source_ref: item.sourceRef,
  }))
  let createResult: Awaited<ReturnType<typeof admin.rpc>>
  try {
    if (isScopedSocial) {
      if (!tytSocialEpoch) {
        return noStoreJson({ error: 'Plan olusturulamadi' }, { status: 500 })
      }
      createResult = await admin.rpc('create_tyt_social_daily_plan_for_epoch', {
        p_user_id: user.id,
        p_plan_date: planDate,
        p_items: rpcItems as Json,
        p_expected_policy_version: tytSocialEpoch.policyVersion,
        p_expected_selection_event_id: tytSocialEpoch.selectionEventId,
      })
    } else {
      createResult = await admin.rpc('create_daily_plan_v2', {
        p_user_id: user.id,
        p_game: game,
        p_plan_date: planDate,
        // The SQL contract uses NULL for games without an exam scope.
        p_exam_ref: examRef as string,
        p_items: rpcItems as Json,
      })
    }
  } catch {
    return noStoreJson({ error: 'Plan olusturulamadi' }, { status: 500 })
  }
  const { data: rpcData, error: createError } = createResult
  if (createError) {
    if (isScopedSocial && isTytSocialEpochRpcConflict(createError)) {
      return noStoreJson(
        { error: 'TYT Sosyal cevaplama düzeni değişti. Yeniden deneyin.' },
        { status: 409 },
      )
    }
    console.error('[/api/study/today] atomic plan create failed:', createError.code)
    return noStoreJson({ error: 'Plan olusturulamadi' }, { status: 500 })
  }

  const snapshot = parseDailyPlanRpcSnapshot(rpcData)
  if (
    !snapshot
    || snapshot.game !== game
    || snapshot.planDate !== planDate
    || snapshot.examRef !== examRef
  ) {
    console.error('[/api/study/today] invalid atomic plan response')
    return noStoreJson({ error: 'Plan olusturulamadi' }, { status: 500 })
  }
  const items = normalizeTodayPlanItems(snapshot.items, snapshot.questionIds, snapshot.completedIds)
  if (!items) return noStoreJson({ error: 'Plan olusturulamadi' }, { status: 500 })
  const completedIds = snapshot.items.length > 0
    ? items.filter((item) => item.completed).map((item) => item.questionId)
    : snapshot.completedIds

  try {
    const questions = await fetchQuestionsInOrder(admin, snapshot.questionIds, game, examRef)
    if (questions === null) return unavailablePlan(game, examRef)
    return respondWithTicket(
      admin,
      user.id,
      game,
      snapshot.planDate,
      snapshot.examRef,
      questions,
      completedIds,
      items,
      snapshot.planId,
    )
  } catch (error) {
    console.error('[/api/study/today] created question query failed:', (error as { code?: string })?.code)
    return noStoreJson({ error: 'Plan olusturulamadi' }, { status: 500 })
  }
}

/** PATCH /api/study/today body: { game, questionIds, examRef } */
export async function PATCH(request: NextRequest) {
  const ipRl = await ipLimiter.check(getClientIp(request.headers))
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return noStoreJson({ error: 'Yetkisiz' }, { status: 401 })

  const userRl = await userLimiter.check(user.id)
  if (!userRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
    )
  }

  const body = await request.json().catch(() => null) as {
    game?: string
    questionIds?: unknown
    examRef?: unknown
  } | null
  const rawGame = body?.game
  if (!rawGame || !VALID_GAMES.has(rawGame as GameSlug)) {
    return noStoreJson({ error: 'Gecerli oyun belirtilmedi' }, { status: 400 })
  }
  const patchExamRef = typeof body?.examRef === 'string' ? body.examRef : null
  if (patchExamRef && !VALID_EXAM_REFS.has(patchExamRef)) {
    return noStoreJson({ error: 'Gecersiz sinav referansi' }, { status: 400 })
  }
  const incomingIds = Array.isArray(body?.questionIds)
    ? [...new Set(body.questionIds.filter((id): id is string => typeof id === 'string' && isValidUuid(id)))].slice(0, 15)
    : []

  const admin = createServiceRoleClient()
  const planDate = trDayString()
  let existingQuery = admin
    .from('daily_plan')
    .select('*')
    .eq('user_id', user.id)
    .eq('game', rawGame)
    .eq('plan_date', planDate)
  existingQuery = patchExamRef === null
    ? existingQuery.is('exam_ref', null)
    : existingQuery.eq('exam_ref', patchExamRef)
  const { data: existing, error: lookupError } = await existingQuery.maybeSingle()
  if (lookupError) {
    console.error('[/api/study/today] completion lookup failed:', lookupError.code)
    return noStoreJson({ error: 'Guncellenemedi' }, { status: 500 })
  }
  if (!existing) return noStoreJson({ error: 'Plan bulunamadi' }, { status: 404 })

  const planIds = new Set(existing.question_ids as string[])
  const validIncoming = incomingIds.filter((id) => planIds.has(id))
  const { data, error } = await admin.rpc('complete_daily_plan_items', {
    p_user_id: user.id,
    p_plan_id: existing.id,
    p_question_ids: validIncoming,
  })
  if (error) {
    console.error('[/api/study/today] atomic completion failed:', error.code)
    return noStoreJson({ error: 'Guncellenemedi' }, { status: 500 })
  }
  const snapshot = parseDailyPlanRpcSnapshot(data)
  if (!snapshot || snapshot.planId !== existing.id) {
    return noStoreJson({ error: 'Guncellenemedi' }, { status: 500 })
  }
  const items = normalizeTodayPlanItems(snapshot.items, snapshot.questionIds, snapshot.completedIds)
  if (!items) return noStoreJson({ error: 'Guncellenemedi' }, { status: 500 })
  return noStoreJson({
    completedIds: items.filter((item) => item.completed).map((item) => item.questionId),
    items,
  })
}
