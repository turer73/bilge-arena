export const DIAGNOSTIC_MAX_QUESTIONS = 10
export const DIAGNOSTIC_MAX_PER_OUTCOME = 2

export type DiagnosticKind = 'initial' | 'recheck'

export interface DiagnosticOutcomeInput {
  id: string
  sortOrder: number
}

export interface DiagnosticQuestionInput {
  id: string
  outcomeId: string
  difficulty: number
}

export interface DiagnosticPriorStateInput {
  outcomeId: string
  score: number
  recommendedDifficulty: number
}

/** Answers must be supplied in their recorded sequence, oldest first. */
export interface DiagnosticAnswerInput {
  questionId: string
  outcomeId: string
  difficulty: number
  isCorrect: boolean
}

export interface DiagnosticPolicyInput {
  kind: DiagnosticKind
  seed: string
  outcomes: readonly DiagnosticOutcomeInput[]
  questions: readonly DiagnosticQuestionInput[]
  priorStates: readonly DiagnosticPriorStateInput[]
  answers: readonly DiagnosticAnswerInput[]
}

export interface DiagnosticQuestionSelection {
  questionId: string
  outcomeId: string
  targetDifficulty: number
}

interface OutcomeCandidate extends DiagnosticOutcomeInput {
  currentAnswers: readonly DiagnosticAnswerInput[]
  prior: DiagnosticPriorStateInput | null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isDifficulty(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
}

function clampDifficulty(value: number): number {
  return Math.min(5, Math.max(1, value))
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function comparePriorScore(
  left: DiagnosticPriorStateInput | null,
  right: DiagnosticPriorStateInput | null,
): number {
  if (left && right) return left.score - right.score
  if (left) return -1
  if (right) return 1
  return 0
}

function weightedAccuracy(answers: readonly DiagnosticAnswerInput[]): number {
  const possible = answers.reduce((sum, answer) => sum + answer.difficulty, 0)
  if (possible === 0) return 0
  const earned = answers.reduce(
    (sum, answer) => sum + (answer.isCorrect ? answer.difficulty : 0),
    0,
  )
  return earned / possible
}

function validateAndIndex(input: DiagnosticPolicyInput): {
  outcomeById: Map<string, DiagnosticOutcomeInput>
  questionById: Map<string, DiagnosticQuestionInput>
  priorByOutcome: Map<string, DiagnosticPriorStateInput>
  answersByOutcome: Map<string, DiagnosticAnswerInput[]>
  answeredQuestionIds: Set<string>
} | null {
  if (
    (input.kind !== 'initial' && input.kind !== 'recheck')
    || !isNonEmptyString(input.seed)
    || !Array.isArray(input.outcomes)
    || input.outcomes.length === 0
    || !Array.isArray(input.questions)
    || !Array.isArray(input.priorStates)
    || !Array.isArray(input.answers)
    || input.answers.length > DIAGNOSTIC_MAX_QUESTIONS
  ) {
    return null
  }

  const outcomeById = new Map<string, DiagnosticOutcomeInput>()
  for (const outcome of input.outcomes) {
    if (
      !isNonEmptyString(outcome.id)
      || !Number.isInteger(outcome.sortOrder)
      || outcome.sortOrder < 0
      || outcomeById.has(outcome.id)
    ) {
      return null
    }
    outcomeById.set(outcome.id, outcome)
  }

  const questionById = new Map<string, DiagnosticQuestionInput>()
  for (const question of input.questions) {
    if (
      !isNonEmptyString(question.id)
      || !isNonEmptyString(question.outcomeId)
      || !outcomeById.has(question.outcomeId)
      || !isDifficulty(question.difficulty)
      || questionById.has(question.id)
    ) {
      return null
    }
    questionById.set(question.id, question)
  }

  const priorByOutcome = new Map<string, DiagnosticPriorStateInput>()
  for (const prior of input.priorStates) {
    if (
      !isNonEmptyString(prior.outcomeId)
      || !outcomeById.has(prior.outcomeId)
      || typeof prior.score !== 'number'
      || !Number.isFinite(prior.score)
      || prior.score < 0
      || prior.score > 100
      || typeof prior.recommendedDifficulty !== 'number'
      || !Number.isFinite(prior.recommendedDifficulty)
      || !Number.isInteger(prior.recommendedDifficulty)
      || priorByOutcome.has(prior.outcomeId)
    ) {
      return null
    }
    priorByOutcome.set(prior.outcomeId, prior)
  }

  const answersByOutcome = new Map<string, DiagnosticAnswerInput[]>()
  const answeredQuestionIds = new Set<string>()
  for (const answer of input.answers) {
    const question = questionById.get(answer.questionId)
    if (
      !question
      || !isNonEmptyString(answer.outcomeId)
      || question.outcomeId !== answer.outcomeId
      || !isDifficulty(answer.difficulty)
      || question.difficulty !== answer.difficulty
      || typeof answer.isCorrect !== 'boolean'
      || answeredQuestionIds.has(answer.questionId)
    ) {
      return null
    }
    answeredQuestionIds.add(answer.questionId)
    const outcomeAnswers = answersByOutcome.get(answer.outcomeId) ?? []
    if (outcomeAnswers.length >= DIAGNOSTIC_MAX_PER_OUTCOME) return null
    outcomeAnswers.push(answer)
    answersByOutcome.set(answer.outcomeId, outcomeAnswers)
  }

  return {
    outcomeById,
    questionById,
    priorByOutcome,
    answersByOutcome,
    answeredQuestionIds,
  }
}

function rankOutcomes(
  kind: DiagnosticKind,
  outcomes: readonly DiagnosticOutcomeInput[],
  priorByOutcome: ReadonlyMap<string, DiagnosticPriorStateInput>,
  answersByOutcome: ReadonlyMap<string, readonly DiagnosticAnswerInput[]>,
): OutcomeCandidate[] {
  const candidates = outcomes.map((outcome) => ({
    ...outcome,
    currentAnswers: answersByOutcome.get(outcome.id) ?? [],
    prior: priorByOutcome.get(outcome.id) ?? null,
  }))
  const uncovered = candidates.filter((outcome) => outcome.currentAnswers.length === 0)

  if (uncovered.length > 0) {
    return uncovered.sort((left, right) => {
      const priorDiff = kind === 'recheck' ? comparePriorScore(left.prior, right.prior) : 0
      return priorDiff || left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
    })
  }

  return candidates
    .filter((outcome) => outcome.currentAnswers.length < DIAGNOSTIC_MAX_PER_OUTCOME)
    .sort((left, right) => (
      weightedAccuracy(left.currentAnswers) - weightedAccuracy(right.currentAnswers)
      || comparePriorScore(left.prior, right.prior)
      || left.currentAnswers.length - right.currentAnswers.length
      || left.sortOrder - right.sortOrder
      || left.id.localeCompare(right.id)
    ))
}

function targetDifficulty(outcome: OutcomeCandidate, kind: DiagnosticKind): number {
  const latest = outcome.currentAnswers.at(-1)
  if (latest) return clampDifficulty(latest.difficulty + (latest.isCorrect ? 1 : -1))
  if (kind === 'recheck' && outcome.prior) {
    return clampDifficulty(outcome.prior.recommendedDifficulty)
  }
  return 3
}

/**
 * Chooses the next question without mutating input. Invalid or inconsistent
 * runtime data fails closed with `null`.
 */
export function selectNextDiagnosticQuestion(
  input: DiagnosticPolicyInput,
): DiagnosticQuestionSelection | null {
  const indexed = validateAndIndex(input)
  if (!indexed || input.answers.length >= DIAGNOSTIC_MAX_QUESTIONS) return null

  const rankedOutcomes = rankOutcomes(
    input.kind,
    input.outcomes,
    indexed.priorByOutcome,
    indexed.answersByOutcome,
  )

  for (const outcome of rankedOutcomes) {
    const target = targetDifficulty(outcome, input.kind)
    const candidate = input.questions
      .filter((question) => (
        question.outcomeId === outcome.id
        && !indexed.answeredQuestionIds.has(question.id)
      ))
      .sort((left, right) => (
        Math.abs(left.difficulty - target) - Math.abs(right.difficulty - target)
        || stableHash(`${input.seed}:${left.id}`) - stableHash(`${input.seed}:${right.id}`)
        || left.id.localeCompare(right.id)
      ))[0]

    if (candidate) {
      return {
        questionId: candidate.id,
        outcomeId: outcome.id,
        targetDifficulty: target,
      }
    }
  }

  return null
}
