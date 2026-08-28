import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { buildMasteryMapResponse } from '@/lib/mastery/build-response'
import type { CurriculumNodeType } from '@/lib/mastery/graph'
import type { MasteryCoveragePublic } from '@/lib/mastery/public-contract'
import { supportsAdaptiveDiagnosticScope } from '@/lib/diagnostic/scope'
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
  last_answered_at: string | null
}

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

    const outcomes = (outcomeResult.data ?? []) as OutcomeRow[]
    const outcomeIds = outcomes.map((outcome) => outcome.id)
    const diagnosticAvailable = scope.diagnosticEnabled && supportsAdaptiveDiagnosticScope({
      game,
      examRef: scope.displayExamRef,
      taxonomyVersion: scope.taxonomyVersion,
    })
    const [stateResult, diagnosticStateResult] = outcomeIds.length > 0
      ? await Promise.all([
        supabase
          .from('user_outcome_state')
          .select('outcome_id, attempts, correct_attempts, weighted_earned, weighted_possible, delayed_correct, v2_attempts, difficulty_weighted_earned, difficulty_weighted_possible, timed_attempts, total_time_sec, fast_wrong, hinted_attempts, hint_stage_sum, guess_annotations, careless_annotations, last_answered_at')
          .eq('user_id', user.id)
          .in('outcome_id', outcomeIds),
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
      nodes: ((nodeResult.data ?? []) as NodeRow[]).map((node) => ({
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
