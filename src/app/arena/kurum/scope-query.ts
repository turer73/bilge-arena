import type { InstitutionLearningScope } from '@/lib/institution-tracking/scope'

export type InstitutionInitialScope = Pick<InstitutionLearningScope, 'game' | 'displayExamRef'>

// This is deliberately a release allowlist rather than a game catalog. Adding
// a new institution capability requires an explicit page deep-link decision.
const institutionInitialScopeAllowlist: readonly InstitutionInitialScope[] = [
  { game: 'matematik', displayExamRef: 'TYT' },
  { game: 'fen', displayExamRef: 'TYT' },
  { game: 'turkce', displayExamRef: 'TYT' },
  { game: 'wordquest', displayExamRef: 'YDT' },
]

type ScopeQuery = {
  game?: string | string[]
  exam_ref?: string | string[]
}

export function parseInstitutionInitialScope(query: ScopeQuery): InstitutionInitialScope | undefined {
  if (typeof query.game !== 'string' || typeof query.exam_ref !== 'string') return undefined

  return institutionInitialScopeAllowlist.find((scope) => (
    scope.game === query.game && scope.displayExamRef === query.exam_ref
  ))
}
