import type { GameSlug } from '@/lib/constants/games'

export interface ReleasedMasteryScope {
  game: GameSlug
  displayExamRef: string
  questionExamRef: string | null
  taxonomyVersion: string
  mappingMode: 'category_proxy'
  diagnosticEnabled: boolean
}

export interface MasteryScopeIntegrity {
  total: number
  mapped: number
  unmapped: number
  scopeMismatch: number
  nodeOrphan: number
  outcomeOrphan: number
  primaryMismatch: number
  emptyOutcome: number
}

interface ScopeRpcResult {
  data: unknown
  error: { code?: string } | null
}

type ScopeRpc = (args: {
  p_game: string
  p_display_exam_ref: string
}) => PromiseLike<ScopeRpcResult>

export type ReleasedMasteryScopeResolution =
  | { scope: ReleasedMasteryScope | null; error: false }
  | { scope: null; error: true; code?: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseReleasedMasteryScope(value: unknown): ReleasedMasteryScope | null {
  if (!isRecord(value)) return null
  const keys = Object.keys(value).sort()
  if (keys.join(',') !== [
    'diagnosticEnabled', 'displayExamRef', 'game', 'mappingMode',
    'questionExamRef', 'taxonomyVersion',
  ].sort().join(',')) return null
  if (
    !['matematik', 'turkce', 'fen', 'sosyal', 'wordquest'].includes(String(value.game))
    || typeof value.displayExamRef !== 'string'
    || !/^[A-Z0-9-]{2,10}$/.test(value.displayExamRef)
    || (value.questionExamRef !== null && (
      typeof value.questionExamRef !== 'string'
      || !/^[A-Z0-9-]{2,10}$/.test(value.questionExamRef)
    ))
    || typeof value.taxonomyVersion !== 'string'
    || !/^ba-[a-z0-9-]+-v[0-9]+$/.test(value.taxonomyVersion)
    || value.mappingMode !== 'category_proxy'
    || typeof value.diagnosticEnabled !== 'boolean'
  ) return null
  return value as unknown as ReleasedMasteryScope
}

export function parseMasteryScopeIntegrity(value: unknown): MasteryScopeIntegrity | null {
  if (!isRecord(value)) return null
  const keys = [
    'total', 'mapped', 'unmapped', 'scopeMismatch', 'nodeOrphan',
    'outcomeOrphan', 'primaryMismatch', 'emptyOutcome',
  ] as const
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) return null
  if (keys.some((key) => !Number.isInteger(value[key]) || Number(value[key]) < 0)) return null
  const integrity = Object.fromEntries(
    keys.map((key) => [key, Number(value[key])]),
  ) as unknown as MasteryScopeIntegrity
  if (integrity.mapped > integrity.total || integrity.unmapped !== integrity.total - integrity.mapped) {
    return null
  }
  return integrity
}

export function isMasteryScopeIntegrityClean(integrity: MasteryScopeIntegrity | null): integrity is MasteryScopeIntegrity {
  return Boolean(
    integrity
    && integrity.total > 0
    && integrity.mapped === integrity.total
    && integrity.unmapped === 0
    && integrity.scopeMismatch === 0
    && integrity.nodeOrphan === 0
    && integrity.outcomeOrphan === 0
    && integrity.primaryMismatch === 0
    && integrity.emptyOutcome === 0,
  )
}

export async function resolveReleasedMasteryScope(
  rpc: ScopeRpc,
  game: GameSlug,
  displayExamRef: string,
): Promise<ReleasedMasteryScopeResolution> {
  const normalizedExamRef = displayExamRef.trim().toUpperCase()
  const { data, error } = await rpc({
    p_game: game,
    p_display_exam_ref: normalizedExamRef,
  })
  if (error) return { scope: null, error: true, code: error.code }
  if (data === null) return { scope: null, error: false }
  const scope = parseReleasedMasteryScope(data)
  if (!scope || scope.game !== game || scope.displayExamRef !== normalizedExamRef) {
    return { scope: null, error: true }
  }
  return { scope, error: false }
}
