import { summarizeLearningStatus, type LearningStatusInput } from '@/lib/mastery/learning-status'
import type { MasteryStatus } from '@/lib/mastery/status'

export interface PlanOutcomeDefinition {
  id: string
  code: string
  category: string
  sortOrder: number
}

export interface PlanOutcomeState extends LearningStatusInput {
  outcomeId: string
  lastAnsweredAt: string | null
}

export interface RankedPlanOutcome extends PlanOutcomeDefinition {
  status: MasteryStatus
  accuracy: number
  attempts: number
  delayedCorrect: number
  lastAnsweredAt: string | null
}

function combine(
  outcomes: PlanOutcomeDefinition[],
  states: PlanOutcomeState[],
): RankedPlanOutcome[] {
  const stateByOutcome = new Map(states.map((state) => [state.outcomeId, state]))
  return outcomes.map((outcome) => {
    const state = stateByOutcome.get(outcome.id)
    const summary = summarizeLearningStatus({
      attempts: state?.attempts ?? 0,
      correctAttempts: state?.correctAttempts ?? 0,
      weightedEarned: state?.weightedEarned ?? 0,
      weightedPossible: state?.weightedPossible ?? 0,
      delayedCorrect: state?.delayedCorrect ?? 0,
      v2Attempts: state?.v2Attempts ?? 0,
      difficultyWeightedEarned: state?.difficultyWeightedEarned ?? 0,
      difficultyWeightedPossible: state?.difficultyWeightedPossible ?? 0,
      timedAttempts: state?.timedAttempts ?? 0,
      totalTimeSec: state?.totalTimeSec ?? 0,
      fastWrong: state?.fastWrong ?? 0,
      hintedAttempts: state?.hintedAttempts ?? 0,
      hintStageSum: state?.hintStageSum ?? 0,
      guessAnnotations: state?.guessAnnotations ?? 0,
      carelessAnnotations: state?.carelessAnnotations ?? 0,
      verifiedEvidenceDays: state?.verifiedEvidenceDays ?? 0,
    })
    return {
      ...outcome,
      accuracy: summary.rawAccuracy,
      status: summary.status,
      attempts: summary.attempts,
      delayedCorrect: summary.delayedCorrect,
      lastAnsweredAt: state?.lastAnsweredAt ?? null,
    }
  })
}

/** En az 3 kanitli ve mastered olmayan outcome'lari zayiflik sirasina dizer. */
export function rankWeakOutcomes(
  outcomes: PlanOutcomeDefinition[],
  states: PlanOutcomeState[],
): RankedPlanOutcome[] {
  return combine(outcomes, states)
    .filter((outcome) => {
      if (outcome.attempts < 3) return false
      return outcome.status !== 'mastered'
    })
    .sort((left, right) => (
      left.accuracy - right.accuracy
      || left.delayedCorrect - right.delayedCorrect
      || right.attempts - left.attempts
      || left.id.localeCompare(right.id)
    ))
}

/** Secili kategori, devam eden hedef ve curriculum sirasi onceliklerini uygular. */
export function rankCurrentOutcomes(
  outcomes: PlanOutcomeDefinition[],
  states: PlanOutcomeState[],
  selectedCategory: string | null,
): RankedPlanOutcome[] {
  return combine(outcomes, states)
    .filter((outcome) => outcome.status !== 'mastered')
    .sort((left, right) => {
      const leftSelected = selectedCategory !== null && left.category === selectedCategory ? 0 : 1
      const rightSelected = selectedCategory !== null && right.category === selectedCategory ? 0 : 1
      if (leftSelected !== rightSelected) return leftSelected - rightSelected

      const leftActive = left.lastAnsweredAt ? 0 : 1
      const rightActive = right.lastAnsweredAt ? 0 : 1
      if (leftActive !== rightActive) return leftActive - rightActive
      if (left.lastAnsweredAt && right.lastAnsweredAt) {
        const recentDiff = Date.parse(right.lastAnsweredAt) - Date.parse(left.lastAnsweredAt)
        if (recentDiff) return recentDiff
      }
      return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
    })
}
