import {
  buildPublicCurriculumGraph,
  indexPublicCurriculumLeaves,
  type CurriculumNodeInput,
} from './graph'
import { summarizeMasteryEvidenceV2 } from './evidence-v2'
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
  lastAnsweredAt: string | null
}

interface BuildMasteryMapResponseInput {
  game: string
  examRef: string | null
  coverage: MasteryCoveragePublic
  nodes: CurriculumNodeInput[]
  outcomes: MasteryOutcomeRowInput[]
  states: MasteryStateRowInput[]
}

export function buildMasteryMapResponse({
  game,
  examRef,
  coverage,
  nodes,
  outcomes,
  states,
}: BuildMasteryMapResponseInput): MasteryMapResponsePublic | null {
  if (!coverage.supported) {
    return { game, examRef, coverage, graph: null, outcomes: [] }
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
        ...summary,
        weightedEarned: Math.max(0, Number.isFinite(weightedEarned) ? weightedEarned : 0),
        weightedPossible: Math.max(0, Number.isFinite(weightedPossible) ? weightedPossible : 0),
        accuracy: summary.rawAccuracy,
        lastAnsweredAt: state?.lastAnsweredAt ?? null,
      },
    }
  })

  if (publicOutcomes.some((outcome) => outcome === null)) return null
  return {
    game,
    examRef,
    coverage,
    graph,
    outcomes: publicOutcomes
      .filter((outcome): outcome is NonNullable<typeof outcome> => outcome !== null)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((outcome) => outcome.value),
  }
}
