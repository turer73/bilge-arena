import type { Question } from '@/types/database'
import {
  stableDailyOrder,
  type ComposePlanV2Input,
  type DailyPlanCandidate,
  type DailyPlanSourceType,
} from './compose-plan-v2'
import {
  rankCurrentOutcomes,
  rankWeakOutcomes,
  type PlanOutcomeDefinition,
  type PlanOutcomeState,
  type RankedPlanOutcome,
} from './outcome-targets'

export interface QuestionOutcomeMapping {
  questionId: string
  outcomeId: string
}

export interface BuildPlanCandidatesInput {
  seed: string
  dueQuestions: Question[]
  baseQuestions: Question[]
  outcomes: PlanOutcomeDefinition[]
  outcomeStates: PlanOutcomeState[]
  mappings: QuestionOutcomeMapping[]
  recentQuestionIds: string[]
  selectedCategory: string | null
}

function candidate(
  questionId: string,
  sourceType: DailyPlanSourceType,
  sourceRef: string,
): DailyPlanCandidate {
  return { questionId, sourceType, sourceRef }
}

function outcomeCandidates(
  rankedOutcomes: RankedPlanOutcome[],
  mappings: QuestionOutcomeMapping[],
  questionOrder: Map<string, number>,
  sourceType: 'weak_outcome' | 'current_target',
): DailyPlanCandidate[] {
  const outcomeById = new Map(rankedOutcomes.map((outcome) => [outcome.id, outcome]))
  const rankByOutcome = new Map(rankedOutcomes.map((outcome, index) => [outcome.id, index]))
  return mappings
    .filter((mapping) => outcomeById.has(mapping.outcomeId) && questionOrder.has(mapping.questionId))
    .sort((left, right) => (
      (rankByOutcome.get(left.outcomeId) ?? Number.MAX_SAFE_INTEGER)
      - (rankByOutcome.get(right.outcomeId) ?? Number.MAX_SAFE_INTEGER)
      || (questionOrder.get(left.questionId) ?? Number.MAX_SAFE_INTEGER)
      - (questionOrder.get(right.questionId) ?? Number.MAX_SAFE_INTEGER)
      || left.questionId.localeCompare(right.questionId)
    ))
    .map((mapping) => candidate(
      mapping.questionId,
      sourceType,
      outcomeById.get(mapping.outcomeId)?.code ?? 'outcome',
    ))
}

/** DB'den gelen bounded adaylari kanonik bes kova + fresh overflow'a cevirir. */
export function buildPlanCandidates({
  seed,
  dueQuestions,
  baseQuestions,
  outcomes,
  outcomeStates,
  mappings,
  recentQuestionIds,
  selectedCategory,
}: BuildPlanCandidatesInput): ComposePlanV2Input {
  const orderedBase = stableDailyOrder(baseQuestions, seed, (question) => question.id)
  const questionOrder = new Map(orderedBase.map((question, index) => [question.id, index]))
  const recent = new Set(recentQuestionIds)
  const nonRecent = orderedBase.filter((question) => !recent.has(question.id))
  const recentTail = orderedBase.filter((question) => recent.has(question.id))
  const cooldownOrder = [...nonRecent, ...recentTail]

  const weakOutcomes = rankWeakOutcomes(outcomes, outcomeStates)
  const currentOutcomes = rankCurrentOutcomes(outcomes, outcomeStates, selectedCategory)
  const selectedCategoryQuestions = selectedCategory
    ? cooldownOrder
      .filter((question) => question.category === selectedCategory)
      .map((question) => candidate(question.id, 'current_target', selectedCategory))
    : []

  const weak = outcomeCandidates(weakOutcomes, mappings, questionOrder, 'weak_outcome')
  const currentMapped = outcomeCandidates(currentOutcomes, mappings, questionOrder, 'current_target')
  const challenge = cooldownOrder
    .filter((question) => question.difficulty >= 4)
    .map((question) => candidate(question.id, 'challenge', `difficulty_${question.difficulty}`))
  const choicePool = cooldownOrder
    .filter((question) => selectedCategory
      ? question.category === selectedCategory
      : question.difficulty <= 2)
    .map((question) => candidate(
      question.id,
      'student_choice',
      selectedCategory ?? 'selected_game',
    ))

  return {
    pools: {
      // fetchDueQuestions zaten dueAt ASC doner; bu anlamli sirayi bozma.
      due: dueQuestions.map((question) => candidate(question.id, 'due', 'fsrs')),
      weak_outcome: weak,
      current_target: [...selectedCategoryQuestions, ...currentMapped],
      challenge,
      student_choice: choicePool,
    },
    freshCandidates: cooldownOrder.map((question) => candidate(question.id, 'fresh', 'game_pool')),
  }
}
