import {
  buildPublicCurriculumGraph,
  indexPublicCurriculumLeaves,
  type CurriculumNodeInput,
} from './graph'
import { summarizeMasteryEvidenceV2 } from './evidence-v2'
import { buildMasteryDiscovery } from './discovery'
import type { MasteryCoveragePublic, MasteryMapResponsePublic } from './public-contract'

export interface MasteryOutcomeRowInput {
  id: string
  nodeId: string
  code: string
  title: string
  description: string | null
  game: string
  category: string
  examRef: string | null
}

export interface MasteryStateRowInput {
  outcomeId: string
  attempts: number
  correctAttempts: number
  weightedEarned: number
  weightedPossible: number
  delayedCorrect: number
  v2Attempts: number
  difficultyWeightedEarned: number
  difficultyWeightedPossible: number
  timedAttempts: number
  totalTimeSec: number
  fastWrong: number
  hintedAttempts: number
  hintStageSum: number
  guessAnnotations: number
  carelessAnnotations: number
  verifiedEvidenceDays: number
  lastAnsweredAt: string | null
}

interface BuildMasteryMapResponseInput {
  game: string
  examRef: string | null
  coverage: MasteryCoveragePublic
  nodes: CurriculumNodeInput[]
  outcomes: MasteryOutcomeRowInput[]
  states: MasteryStateRowInput[]
  diagnosticOutcomeIds?: string[]
}

export function buildMasteryMapResponse({
  game,
  examRef,
  coverage,
  nodes,
  outcomes,
  states,
  diagnosticOutcomeIds = [],
}: BuildMasteryMapResponseInput): MasteryMapResponsePublic | null {
  if (!coverage.supported) {
    return { game, examRef, coverage, discovery: null, graph: null, outcomes: [] }
  }

  const graph = buildPublicCurriculumGraph(
    nodes,
    outcomes.map((outcome) => ({ code: outcome.code, nodeId: outcome.nodeId })),
  )
  if (!graph) return null
  const leafIndex = indexPublicCurriculumLeaves(graph)
  const stateByOutcome = new Map(states.map((state) => [state.outcomeId, state]))

  const publicOutcomes = outcomes.map((outcome) => {
    const leaf = leafIndex.get(outcome.code)
    if (!leaf) return null
    const state = stateByOutcome.get(outcome.id)
    const weightedEarned = Number(state?.weightedEarned ?? 0)
    const weightedPossible = Number(state?.weightedPossible ?? 0)
    const verifiedEvidenceDaysRaw = Number(state?.verifiedEvidenceDays ?? 0)
    const summary = summarizeMasteryEvidenceV2({
      attempts: Number(state?.attempts ?? 0),
      correctAttempts: Number(state?.correctAttempts ?? 0),
      weightedEarned,
      weightedPossible,
      delayedCorrect: Number(state?.delayedCorrect ?? 0),
      v2Attempts: Number(state?.v2Attempts ?? 0),
      difficultyWeightedEarned: Number(state?.difficultyWeightedEarned ?? 0),
      difficultyWeightedPossible: Number(state?.difficultyWeightedPossible ?? 0),
      timedAttempts: Number(state?.timedAttempts ?? 0),
      totalTimeSec: Number(state?.totalTimeSec ?? 0),
      fastWrong: Number(state?.fastWrong ?? 0),
      hintedAttempts: Number(state?.hintedAttempts ?? 0),
      hintStageSum: Number(state?.hintStageSum ?? 0),
      guessAnnotations: Number(state?.guessAnnotations ?? 0),
      carelessAnnotations: Number(state?.carelessAnnotations ?? 0),
    })
    const verifiedEvidenceDays = Number.isSafeInteger(verifiedEvidenceDaysRaw)
      && verifiedEvidenceDaysRaw >= 0
      && verifiedEvidenceDaysRaw <= summary.attempts
      ? verifiedEvidenceDaysRaw
      : 0
    // A burst of answers on one day does not satisfy the product's minimum
    // distinct-day gate. Keep factual counters, but do not publish a level or
    // score before three Europe/Istanbul calendar days. This gate alone is not
    // a claim of psychometric reliability or a minimum elapsed-time interval.
    const hasMinimumDaySpread = verifiedEvidenceDays >= 3
    const publicSummary = hasMinimumDaySpread
      ? summary
      : {
          ...summary,
          evidenceCompleteness: Math.round((verifiedEvidenceDays / 3) * 100),
          score: 0,
          status: 'insufficient' as const,
          components: {
            accuracy: 0,
            delayedRetrieval: 0,
            independence: 0,
            selfRegulation: 0,
          },
        }
    return {
      sortOrder: leaf.order,
      value: {
        code: outcome.code,
        nodeCode: leaf.nodeCode,
        path: leaf.path,
        title: outcome.title,
        description: outcome.description,
        game: outcome.game,
        category: outcome.category,
        examRef: outcome.examRef,
        ...publicSummary,
        weightedEarned: Math.max(0, Number.isFinite(weightedEarned) ? weightedEarned : 0),
        weightedPossible: Math.max(0, Number.isFinite(weightedPossible) ? weightedPossible : 0),
        accuracy: publicSummary.rawAccuracy,
        verifiedEvidenceDays,
        lastAnsweredAt: state?.lastAnsweredAt ?? null,
      },
    }
  })

  if (publicOutcomes.some((outcome) => outcome === null)) return null
  const publicOutcomeValues = publicOutcomes
    .filter((outcome): outcome is NonNullable<typeof outcome> => outcome !== null)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((outcome) => outcome.value)
  const diagnosticIds = new Set(diagnosticOutcomeIds)
  const diagnosticCompleted = outcomes.length > 0
    && outcomes.every((outcome) => diagnosticIds.has(outcome.id))
  const discovery = buildMasteryDiscovery(publicOutcomeValues, diagnosticCompleted)
  if (!discovery) return null

  return {
    game,
    examRef,
    coverage,
    discovery,
    graph,
    outcomes: publicOutcomeValues,
  }
}
