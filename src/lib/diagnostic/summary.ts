import type {
  DiagnosticOutcomeSummaryPublic,
  DiagnosticPublicBand,
  DiagnosticSummaryPublic,
} from './public-contract'

export interface DiagnosticSummaryOutcomeInput {
  id: string
  code: string
  title: string
  category: string
  sortOrder: number
}

export interface DiagnosticSummaryStateInput {
  outcomeId: string
  attempts: number
  correctAttempts: number
  score: number
  recommendedDifficulty: number
  lastDiagnosedAt: string
}

function isFiniteInteger(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}

function bandForScore(score: number): DiagnosticPublicBand {
  if (score < 40) return 'foundation'
  if (score < 70) return 'developing'
  return 'strong'
}

/** Builds an ID-free summary only when the immutable screening scope is complete. */
export function buildDiagnosticSummary(
  outcomes: readonly DiagnosticSummaryOutcomeInput[],
  states: readonly DiagnosticSummaryStateInput[],
  limits: { outcomeCount: number; maxPerOutcome: number },
): DiagnosticSummaryPublic | null {
  if (
    !Number.isInteger(limits.outcomeCount)
    || limits.outcomeCount < 1
    || !Number.isInteger(limits.maxPerOutcome)
    || limits.maxPerOutcome < 1
    || outcomes.length !== limits.outcomeCount
    || states.length !== limits.outcomeCount
  ) return null
  const outcomeIds = new Set<string>()
  for (const outcome of outcomes) {
    if (
      !outcome.id
      || !outcome.code
      || !outcome.title
      || !outcome.category
      || !Number.isInteger(outcome.sortOrder)
      || outcomeIds.has(outcome.id)
    ) return null
    outcomeIds.add(outcome.id)
  }

  const stateByOutcome = new Map<string, DiagnosticSummaryStateInput>()
  for (const state of states) {
    if (
      !outcomeIds.has(state.outcomeId)
      || stateByOutcome.has(state.outcomeId)
      || !isFiniteInteger(state.attempts, 1, limits.maxPerOutcome)
      || !isFiniteInteger(state.correctAttempts, 0, state.attempts)
      || !Number.isFinite(state.score)
      || state.score < 0
      || state.score > 100
      || !isFiniteInteger(state.recommendedDifficulty, 1, 5)
      || !Number.isFinite(Date.parse(state.lastDiagnosedAt))
    ) return null
    stateByOutcome.set(state.outcomeId, state)
  }

  const publicOutcomes: Array<{ sortOrder: number; value: DiagnosticOutcomeSummaryPublic }> = []
  let completedAtMs = 0
  for (const outcome of outcomes) {
    const state = stateByOutcome.get(outcome.id)
    if (!state) return null
    completedAtMs = Math.max(completedAtMs, Date.parse(state.lastDiagnosedAt))
    publicOutcomes.push({
      sortOrder: outcome.sortOrder,
      value: {
        code: outcome.code,
        title: outcome.title,
        category: outcome.category,
        attempts: state.attempts,
        correctAttempts: state.correctAttempts,
        score: Math.round(state.score * 100) / 100,
        recommendedDifficulty: state.recommendedDifficulty,
        band: bandForScore(state.score),
      },
    })
  }

  if (completedAtMs === 0) return null
  return {
    completedAt: new Date(completedAtMs).toISOString(),
    outcomes: publicOutcomes
      .sort((left, right) => left.sortOrder - right.sortOrder || left.value.code.localeCompare(right.value.code))
      .map((entry) => entry.value),
  }
}
