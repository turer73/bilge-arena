export const ADAPTIVE_DIAGNOSTIC_SCOPE = {
  game: 'matematik',
  examRef: 'TYT',
  taxonomyVersion: 'ba-tyt-math-v1',
  outcomeCount: 6,
} as const

interface DiagnosticScopeInput {
  game: string
  examRef: string
  taxonomyVersion: string
}

/**
 * The release registry says whether a curriculum scope may expose diagnostics.
 * This capability check says whether the current diagnostic engine can actually
 * serve that exact immutable scope. Both gates must pass before the UI advertises
 * the diagnostic journey.
 */
export function supportsAdaptiveDiagnosticScope(scope: DiagnosticScopeInput): boolean {
  return scope.game === ADAPTIVE_DIAGNOSTIC_SCOPE.game
    && scope.examRef === ADAPTIVE_DIAGNOSTIC_SCOPE.examRef
    && scope.taxonomyVersion === ADAPTIVE_DIAGNOSTIC_SCOPE.taxonomyVersion
}
