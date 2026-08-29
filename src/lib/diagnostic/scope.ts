import { GAME_SLUGS, type GameSlug } from '@/lib/constants/games'

export const LEGACY_ADAPTIVE_DIAGNOSTIC_SCOPE = {
  game: 'matematik',
  displayExamRef: 'TYT',
  questionExamRef: 'TYT',
  taxonomyVersion: 'ba-tyt-math-v1',
  policyVersion: 'adaptive-diagnostic-v2',
  questionCount: 10,
  outcomeCount: 6,
  maxPerOutcome: 2,
} as const

/** @deprecated Use the registry-backed scope resolver for new code. */
export const ADAPTIVE_DIAGNOSTIC_SCOPE = {
  game: LEGACY_ADAPTIVE_DIAGNOSTIC_SCOPE.game,
  examRef: LEGACY_ADAPTIVE_DIAGNOSTIC_SCOPE.displayExamRef,
  questionExamRef: LEGACY_ADAPTIVE_DIAGNOSTIC_SCOPE.questionExamRef,
  taxonomyVersion: LEGACY_ADAPTIVE_DIAGNOSTIC_SCOPE.taxonomyVersion,
  outcomeCount: LEGACY_ADAPTIVE_DIAGNOSTIC_SCOPE.outcomeCount,
} as const

export interface ReleasedDiagnosticScope {
  game: GameSlug
  displayExamRef: string
  questionExamRef: string | null
  taxonomyVersion: string
  policyVersion: string
  questionCount: number
  outcomeCount: number
  maxPerOutcome: number
}

export interface DiagnosticPageScope {
  game: GameSlug
  examRef: string
}

interface ScopeRpcResult {
  data: unknown
  error: { code?: string } | null
}

type ScopeRpc = (args: {
  p_game: string
  p_display_exam_ref: string
}) => PromiseLike<ScopeRpcResult>

export type ReleasedDiagnosticScopeResolution =
  | { scope: ReleasedDiagnosticScope | null; error: false }
  | { scope: null; error: true; code?: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isExamRef(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z0-9-]{2,10}$/.test(value)
}

function isBoundedInteger(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max
}

export function parseReleasedDiagnosticScope(value: unknown): ReleasedDiagnosticScope | null {
  if (!isRecord(value)) return null
  const expectedKeys = [
    'displayExamRef', 'game', 'maxPerOutcome', 'outcomeCount', 'policyVersion',
    'questionCount', 'questionExamRef', 'taxonomyVersion',
  ]
  if (Object.keys(value).sort().join(',') !== expectedKeys.sort().join(',')) return null
  if (
    !GAME_SLUGS.includes(value.game as GameSlug)
    || !isExamRef(value.displayExamRef)
    || (value.questionExamRef !== null && !isExamRef(value.questionExamRef))
    || typeof value.taxonomyVersion !== 'string'
    || !/^ba-[a-z0-9-]+-v[0-9]+$/.test(value.taxonomyVersion)
    || typeof value.policyVersion !== 'string'
    || !/^[a-z0-9-]+-v[0-9]+$/.test(value.policyVersion)
    || !isBoundedInteger(value.questionCount, 1, 50)
    || !isBoundedInteger(value.outcomeCount, 1, 50)
    || !isBoundedInteger(value.maxPerOutcome, 1, 10)
    || Number(value.questionCount) < Number(value.outcomeCount)
    || Number(value.questionCount) > Number(value.outcomeCount) * Number(value.maxPerOutcome)
  ) return null
  return value as unknown as ReleasedDiagnosticScope
}

export async function resolveReleasedDiagnosticScope(
  rpc: ScopeRpc,
  game: GameSlug,
  displayExamRef: string,
): Promise<ReleasedDiagnosticScopeResolution> {
  const normalizedExamRef = displayExamRef.trim().toUpperCase()
  if (!isExamRef(normalizedExamRef)) return { scope: null, error: true }
  const { data, error } = await rpc({
    p_game: game,
    p_display_exam_ref: normalizedExamRef,
  })
  if (error) return { scope: null, error: true, code: error.code }
  if (data === null) return { scope: null, error: false }
  const scope = parseReleasedDiagnosticScope(data)
  if (!scope || scope.game !== game || scope.displayExamRef !== normalizedExamRef) {
    return { scope: null, error: true }
  }
  return { scope, error: false }
}

export function isMissingDiagnosticResolver(code: string | undefined): boolean {
  return code === 'PGRST202' || code === '42883'
}

/**
 * Defaults only when neither scope parameter was supplied. A partial,
 * lowercase, or unknown explicit scope is rejected instead of silently opening
 * the Mathematics pilot.
 */
export function parseDiagnosticPageScope(
  gameParam: string | null,
  examRefParam: string | null,
): DiagnosticPageScope | null {
  if (gameParam === null && examRefParam === null) {
    return {
      game: LEGACY_ADAPTIVE_DIAGNOSTIC_SCOPE.game,
      examRef: LEGACY_ADAPTIVE_DIAGNOSTIC_SCOPE.displayExamRef,
    }
  }
  if (
    gameParam === null
    || examRefParam === null
    || !GAME_SLUGS.includes(gameParam as GameSlug)
    || !isExamRef(examRefParam)
  ) return null
  return { game: gameParam as GameSlug, examRef: examRefParam }
}

/** Legacy capability predicate retained for deploy-before-migration fallback. */
export function supportsAdaptiveDiagnosticScope(scope: {
  game: string
  examRef: string
  questionExamRef: string | null
  taxonomyVersion: string
}): boolean {
  return scope.game === LEGACY_ADAPTIVE_DIAGNOSTIC_SCOPE.game
    && scope.examRef === LEGACY_ADAPTIVE_DIAGNOSTIC_SCOPE.displayExamRef
    && scope.questionExamRef === LEGACY_ADAPTIVE_DIAGNOSTIC_SCOPE.questionExamRef
    && scope.taxonomyVersion === LEGACY_ADAPTIVE_DIAGNOSTIC_SCOPE.taxonomyVersion
}
