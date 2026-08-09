import { summarizeMastery } from '@/lib/mastery/status'

export interface PlanOutcomeDefinition {
  id: string
  code: string
  category: string
  sortOrder: number
}

export interface PlanOutcomeState {
  outcomeId: string
  attempts: number
  correctAttempts: number
  weightedEarned: number
  weightedPossible: number
  delayedCorrect: number
  lastAnsweredAt: string | null
}

export interface RankedPlanOutcome extends PlanOutcomeDefinition {
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
    const summary = summarizeMastery({
      attempts: state?.attempts ?? 0,
      correctAttempts: state?.correctAttempts ?? 0,
      weightedEarned: state?.weightedEarned ?? 0,
      weightedPossible: state?.weightedPossible ?? 0,
      delayedCorrect: state?.delayedCorrect ?? 0,
    })
    return {
      ...outcome,
      accuracy: summary.accuracy,
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
      return !(outcome.attempts >= 5 && outcome.accuracy >= 80 && outcome.delayedCorrect >= 1)
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
    .filter((outcome) => !(
      outcome.attempts >= 5 && outcome.accuracy >= 80 && outcome.delayedCorrect >= 1
    ))
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
