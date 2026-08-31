import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { buildMasteryMapResponse } from '@/lib/mastery/build-response'
import type { CurriculumNodeType } from '@/lib/mastery/graph'
import type { MasteryCoveragePublic } from '@/lib/mastery/public-contract'
import {
  isMissingDiagnosticResolver,
  resolveReleasedDiagnosticScope,
  supportsAdaptiveDiagnosticScope,
} from '@/lib/diagnostic/scope'
import {
  isMasteryScopeIntegrityClean,
  parseMasteryScopeIntegrity,
  resolveReleasedMasteryScope,
} from '@/lib/mastery/scope'

const ipLimiter = createRateLimiter('mastery-map-ip', 120, 60_000)
const userLimiter = createRateLimiter('mastery-map-user', 60, 60_000)

interface NodeRow {
  id: string
  code: string
  node_type: string
  title: string
  parent_id: string | null
  sort_order: number
}

interface OutcomeRow {
  id: string
  node_id: string | null
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
  v2_attempts: number
  difficulty_weighted_earned: number | string
  difficulty_weighted_possible: number | string
  timed_attempts: number
  total_time_sec: number | string
  fast_wrong: number
  hinted_attempts: number
  hint_stage_sum: number | string
  guess_annotations: number
  careless_annotations: number
  verified_evidence_days: number
  last_answered_at: string | null
}

const TYT_SOCIAL_CATEGORIES = [
  'tarih',
  'cografya',
  'felsefe',
  'sosyoloji',
  'din_kulturu',
] as const
type TytSocialCategory = (typeof TYT_SOCIAL_CATEGORIES)[number]

interface ActiveTytSocialMasteryContext {
  policyVersion: string
  taxonomyVersion: 'ba-tyt-sosyal-v1'
  variant: 'questions_16_20' | 'questions_21_25'
  selectionEventId: string
  selectionEffectiveAt: string
  allowedCategories: TytSocialCategory[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length && keys.every((key) => expected.includes(key))
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function parseActiveTytSocialMasteryContext(
  value: unknown,
): ActiveTytSocialMasteryContext | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'status',
    'available',
    'reason',
    'policyVersion',
    'taxonomyVersion',
    'variant',
    'selectionEventId',
    'selectionEffectiveAt',
    'allowedCategories',
    'rebuildRequired',
    'legacyAggregateUsed',
  ])) return null
  if (
    value.status !== 'active'
    || value.available !== true
    || value.reason !== null
    || typeof value.policyVersion !== 'string'
    || !/^tyt-social-[0-9]{4}-v[0-9]+$/.test(value.policyVersion)
    || value.taxonomyVersion !== 'ba-tyt-sosyal-v1'
    || (value.variant !== 'questions_16_20' && value.variant !== 'questions_21_25')
    || !isUuid(value.selectionEventId)
    || typeof value.selectionEffectiveAt !== 'string'
    || !Number.isFinite(Date.parse(value.selectionEffectiveAt))
    || value.rebuildRequired !== false
    || value.legacyAggregateUsed !== false
    || !Array.isArray(value.allowedCategories)
  ) return null

  const allowedCategories = value.allowedCategories
  if (
    allowedCategories.some((category) => (
      typeof category !== 'string'
      || !TYT_SOCIAL_CATEGORIES.includes(category as TytSocialCategory)
    ))
    || new Set(allowedCategories).size !== allowedCategories.length
  ) return null

  const expected = value.variant === 'questions_16_20'
    ? new Set<TytSocialCategory>(TYT_SOCIAL_CATEGORIES)
    : new Set<TytSocialCategory>(['tarih', 'cografya', 'felsefe', 'sosyoloji'])
  if (
    allowedCategories.length !== expected.size
    || allowedCategories.some((category) => !expected.has(category as TytSocialCategory))
  ) return null

  return {
    policyVersion: value.policyVersion,
    taxonomyVersion: value.taxonomyVersion,
    variant: value.variant,
    selectionEventId: value.selectionEventId,
    selectionEffectiveAt: value.selectionEffectiveAt,
    allowedCategories: allowedCategories as TytSocialCategory[],
  }
}

function pruneCurriculumRowsForCategories(
  nodes: NodeRow[],
  outcomes: OutcomeRow[],
  allowedCategories: readonly TytSocialCategory[],
): { nodes: NodeRow[]; outcomes: OutcomeRow[] } {
  const allowed = new Set<string>(allowedCategories)
  const filteredOutcomes = outcomes.filter((outcome) => allowed.has(outcome.category))
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const includedNodeIds = new Set(filteredOutcomes.map((outcome) => outcome.node_id).filter(Boolean) as string[])
  for (const outcomeNodeId of [...includedNodeIds]) {
    let current = nodeById.get(outcomeNodeId)
    const visited = new Set<string>()
    while (current?.parent_id) {
      if (visited.has(current.id)) break
      visited.add(current.id)
      includedNodeIds.add(current.parent_id)
      current = nodeById.get(current.parent_id)
    }
  }
  return {
    nodes: nodes.filter((node) => includedNodeIds.has(node.id)),
    outcomes: filteredOutcomes,
  }
}

type LegacyStateRow = Omit<StateRow, 'verified_evidence_days'>

const MASTERY_STATE_COLUMNS = 'outcome_id, attempts, correct_attempts, weighted_earned, weighted_possible, delayed_correct, v2_attempts, difficulty_weighted_earned, difficulty_weighted_possible, timed_attempts, total_time_sec, fast_wrong, hinted_attempts, hint_stage_sum, guess_annotations, careless_annotations, verified_evidence_days, last_answered_at'
const LEGACY_MASTERY_STATE_COLUMNS = 'outcome_id, attempts, correct_attempts, weighted_earned, weighted_possible, delayed_correct, v2_attempts, difficulty_weighted_earned, difficulty_weighted_possible, timed_attempts, total_time_sec, fast_wrong, hinted_attempts, hint_stage_sum, guess_annotations, careless_annotations, last_answered_at'

function unsupportedCoverage(): MasteryCoveragePublic {
  return {
    supported: false,
    diagnosticAvailable: false,
    taxonomyVersion: null,
    totalQuestions: 0,
    mappedQuestions: 0,
    percentage: 0,
  }
}

function noStoreJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store' },
  })
}

type ServiceClient = ReturnType<typeof createServiceRoleClient>

interface StateQueryResult {
  data: StateRow[] | null
  error: { code?: string } | null
}

function isMissingVerifiedEvidenceDays(error: { code?: string } | null): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204'
}

async function readMasteryStates(
  client: ServiceClient,
  userId: string,
  outcomeIds: string[],
): Promise<StateQueryResult> {
  const current = await client
    .from('user_outcome_state')
    .select(MASTERY_STATE_COLUMNS)
    .eq('user_id', userId)
    .in('outcome_id', outcomeIds) as unknown as StateQueryResult
  if (!current.error || !isMissingVerifiedEvidenceDays(current.error)) return current

  // App-first deploy compatibility: an old schema can still return the map,
  // but legacy rows earn zero distinct-day progress until migration 202 exists.
  const legacy = await client
    .from('user_outcome_state')
    .select(LEGACY_MASTERY_STATE_COLUMNS)
    .eq('user_id', userId)
    .in('outcome_id', outcomeIds) as unknown as {
      data: LegacyStateRow[] | null
      error: { code?: string } | null
    }
  if (legacy.error) return { data: null, error: legacy.error }
  return {
    data: (legacy.data ?? []).map((state) => ({
      ...state,
      verified_evidence_days: 0,
    })),
    error: null,
  }
}

async function callServiceRpc(
  client: ServiceClient,
  name: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: { code?: string } | null }> {
  return await client.rpc(name as never, args as never) as unknown as {
    data: unknown
    error: { code?: string } | null
  }
}

/**
 * GET /api/profile/mastery?game=matematik&exam_ref=TYT
 *
 * Yalnız auth kullanıcısının güvenli, UUID'siz öğrenme grafiğini döndürür.
 * Yalnız release registry'de yayınlanmış ve bütünlük kapısını geçen kapsamlar
 * döner; diğer scope'lar sahte seviye üretmek yerine açıkça unsupported olur.
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
    if (!examRef) {
      return noStoreJson({ game, examRef, coverage: unsupportedCoverage(), discovery: null, graph: null, outcomes: [] })
    }
    const scopeResolution = await resolveReleasedMasteryScope(
      (args) => supabase.rpc('resolve_released_curriculum_scope', args),
      game,
      examRef,
    )
    if (scopeResolution.error) throw new Error('curriculum_scope_resolution_failed')
    const scope = scopeResolution.scope
    if (!scope) {
      return noStoreJson({ game, examRef, coverage: unsupportedCoverage(), discovery: null, graph: null, outcomes: [] })
    }

    const isTytSocialScope = game === 'sosyal' && examRef === 'TYT'
    let tytSocialContext: ActiveTytSocialMasteryContext | null = null
    if (isTytSocialScope) {
      const contextResult = await callServiceRpc(
        supabase,
        'resolve_tyt_social_mastery_read_context',
        { p_user_id: user.id },
      )
      tytSocialContext = contextResult.error
        ? null
        : parseActiveTytSocialMasteryContext(contextResult.data)
      if (
        !tytSocialContext
        || scope.displayExamRef !== 'TYT'
        || scope.questionExamRef !== 'TYT'
        || tytSocialContext.taxonomyVersion !== scope.taxonomyVersion
      ) {
        return noStoreJson({
          game,
          examRef,
          coverage: unsupportedCoverage(),
          discovery: null,
          graph: null,
          outcomes: [],
        })
      }
    }

    const nodeRequest = supabase
      .from('curriculum_nodes')
      .select('id, code, node_type, title, parent_id, sort_order')
      .eq('game', game)
      .eq('exam_ref', scope.displayExamRef)
      .eq('taxonomy_version', scope.taxonomyVersion)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    const outcomeRequest = supabase
      .from('curriculum_outcomes')
      .select('id, node_id, code, game, category, title, description, exam_ref')
      .eq('game', game)
      .eq('exam_ref', scope.displayExamRef)
      .eq('taxonomy_version', scope.taxonomyVersion)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    const [nodeResult, outcomeResult, integrityResult] = await Promise.all([
      nodeRequest,
      outcomeRequest,
      supabase.rpc('curriculum_scope_integrity', {
        p_game: game,
        p_display_exam_ref: scope.displayExamRef,
        p_taxonomy_version: scope.taxonomyVersion,
      }),
    ])
    if (nodeResult.error) throw nodeResult.error
    if (outcomeResult.error) throw outcomeResult.error
    if (integrityResult.error) throw integrityResult.error

    const integrity = parseMasteryScopeIntegrity(integrityResult.data)
    if (!isMasteryScopeIntegrityClean(integrity)) throw new Error('curriculum_integrity_failed')

    const scopedRows = tytSocialContext
      ? pruneCurriculumRowsForCategories(
        (nodeResult.data ?? []) as NodeRow[],
        (outcomeResult.data ?? []) as OutcomeRow[],
        tytSocialContext.allowedCategories,
      )
      : {
        nodes: (nodeResult.data ?? []) as NodeRow[],
        outcomes: (outcomeResult.data ?? []) as OutcomeRow[],
      }
    const outcomes = scopedRows.outcomes
    const outcomeIds = outcomes.map((outcome) => outcome.id)
    let diagnosticAvailable = false
    if (scope.diagnosticEnabled) {
      const diagnosticResolution = await resolveReleasedDiagnosticScope(
        (args) => callServiceRpc(supabase, 'resolve_released_diagnostic_scope', args),
        game,
        scope.displayExamRef,
      )
      if (!diagnosticResolution.error) {
        const diagnosticScope = diagnosticResolution.scope
        diagnosticAvailable = Boolean(
          diagnosticScope
          && diagnosticScope.questionExamRef === scope.questionExamRef
          && diagnosticScope.taxonomyVersion === scope.taxonomyVersion,
        )
      } else if (isMissingDiagnosticResolver(diagnosticResolution.code)) {
        // Deploy-before-migration compatibility is intentionally bounded to
        // the legacy Mathematics/TYT contract. New subjects never fall back.
        diagnosticAvailable = supportsAdaptiveDiagnosticScope({
          game,
          examRef: scope.displayExamRef,
          questionExamRef: scope.questionExamRef,
          taxonomyVersion: scope.taxonomyVersion,
        })
      }
    }
    const [stateResult, diagnosticStateResult] = outcomeIds.length > 0
      ? await Promise.all([
        tytSocialContext
          ? callServiceRpc(
            supabase,
            'read_tyt_social_mastery_outcome_state',
            { p_user_id: user.id },
          ).then((result): StateQueryResult => ({
            data: !result.error && Array.isArray(result.data)
              ? result.data as StateRow[]
              : null,
            error: result.error ?? (Array.isArray(result.data) ? null : { code: 'PGRST102' }),
          }))
          : readMasteryStates(supabase, user.id, outcomeIds),
        diagnosticAvailable
          ? supabase
            .from('user_diagnostic_outcome_state')
            .select('outcome_id')
            .eq('user_id', user.id)
            .in('outcome_id', outcomeIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      : [{ data: [], error: null }, { data: [], error: null }]
    if (stateResult.error) throw stateResult.error
    if (diagnosticStateResult.error) throw diagnosticStateResult.error

    const coverage: MasteryCoveragePublic = {
      supported: true,
      diagnosticAvailable,
      taxonomyVersion: scope.taxonomyVersion,
      totalQuestions: integrity.total,
      mappedQuestions: integrity.mapped,
      percentage: integrity.total > 0 ? Math.round((integrity.mapped / integrity.total) * 100) : 0,
    }
    const response = buildMasteryMapResponse({
      game,
      examRef,
      coverage,
      nodes: scopedRows.nodes.map((node) => ({
        id: node.id,
        code: node.code,
        nodeType: node.node_type as CurriculumNodeType,
        title: node.title,
        parentId: node.parent_id,
        sortOrder: node.sort_order,
      })),
      outcomes: outcomes.map((outcome) => ({
        id: outcome.id,
        nodeId: outcome.node_id ?? '',
        code: outcome.code,
        title: outcome.title,
        description: outcome.description,
        game: outcome.game,
        category: outcome.category,
        examRef: outcome.exam_ref,
      })),
      states: ((stateResult.data ?? []) as StateRow[]).map((state) => ({
        outcomeId: state.outcome_id,
        attempts: Number(state.attempts),
        correctAttempts: Number(state.correct_attempts),
        weightedEarned: Number(state.weighted_earned),
        weightedPossible: Number(state.weighted_possible),
        delayedCorrect: Number(state.delayed_correct),
        v2Attempts: Number(state.v2_attempts),
        difficultyWeightedEarned: Number(state.difficulty_weighted_earned),
        difficultyWeightedPossible: Number(state.difficulty_weighted_possible),
        timedAttempts: Number(state.timed_attempts),
        totalTimeSec: Number(state.total_time_sec),
        fastWrong: Number(state.fast_wrong),
        hintedAttempts: Number(state.hinted_attempts),
        hintStageSum: Number(state.hint_stage_sum),
        guessAnnotations: Number(state.guess_annotations),
        carelessAnnotations: Number(state.careless_annotations),
        verifiedEvidenceDays: Number(state.verified_evidence_days),
        lastAnsweredAt: state.last_answered_at,
      })),
      diagnosticOutcomeIds: ((diagnosticStateResult.data ?? []) as Array<{ outcome_id: string }>)
        .map((state) => state.outcome_id),
    })
    if (!response) throw new Error('curriculum_graph_invalid')

    return noStoreJson(response)
  } catch (error) {
    console.error('[MasteryMap] sorgu hatasi:', (error as { code?: string } | null)?.code ?? 'internal')
    return noStoreJson({ error: 'Sorgu basarisiz' }, { status: 500 })
  }
}
