import { describe, expect, it } from 'vitest'
import {
  DIAGNOSTIC_MAX_PER_OUTCOME,
  DIAGNOSTIC_MAX_QUESTIONS,
  selectNextDiagnosticQuestion,
  type DiagnosticAnswerInput,
  type DiagnosticPolicyInput,
} from '../adaptive-policy'

const outcomes = Array.from({ length: 6 }, (_, index) => ({
  id: `o${index + 1}`,
  sortOrder: (index + 1) * 10,
}))

const questions = outcomes.flatMap((outcome) => Array.from({ length: 5 }, (_, index) => ({
  id: `${outcome.id}-d${index + 1}`,
  outcomeId: outcome.id,
  difficulty: index + 1,
})))

function input(overrides: Partial<DiagnosticPolicyInput> = {}): DiagnosticPolicyInput {
  return {
    kind: 'initial',
    seed: 'session-a',
    outcomes,
    questions,
    priorStates: [],
    answers: [],
    ...overrides,
  }
}

function answer(questionId: string, isCorrect: boolean): DiagnosticAnswerInput {
  const question = questions.find((candidate) => candidate.id === questionId)
  if (!question) throw new Error(`missing fixture question ${questionId}`)
  return { ...question, questionId: question.id, isCorrect }
}

describe('selectNextDiagnosticQuestion', () => {
  it('exports the canonical bounds', () => {
    expect(DIAGNOSTIC_MAX_QUESTIONS).toBe(10)
    expect(DIAGNOSTIC_MAX_PER_OUTCOME).toBe(2)
  })

  it('covers all six outcomes in initial curriculum order at difficulty 3', () => {
    const recorded: DiagnosticAnswerInput[] = []
    const selectedOutcomes: string[] = []

    for (let index = 0; index < 6; index += 1) {
      const selected = selectNextDiagnosticQuestion(input({ answers: recorded }))
      expect(selected?.targetDifficulty).toBe(3)
      expect(selected).not.toBeNull()
      if (!selected) throw new Error('selection unexpectedly missing')
      selectedOutcomes.push(selected.outcomeId)
      recorded.push(answer(selected.questionId, false))
    }

    expect(selectedOutcomes).toEqual(outcomes.map((outcome) => outcome.id))
  })

  it('raises after a correct answer and lowers after a wrong answer', () => {
    const coveredExceptFirst = outcomes.slice(1).map((outcome) => answer(`${outcome.id}-d3`, true))

    expect(selectNextDiagnosticQuestion(input({
      answers: [answer('o1-d3', true), ...coveredExceptFirst],
    }))).toMatchObject({ outcomeId: 'o1', targetDifficulty: 4, questionId: 'o1-d4' })

    expect(selectNextDiagnosticQuestion(input({
      answers: [answer('o1-d3', false), ...coveredExceptFirst],
    }))).toMatchObject({ outcomeId: 'o1', targetDifficulty: 2, questionId: 'o1-d2' })
  })

  it('clamps adaptive target difficulty at 1 and 5', () => {
    const coveredExceptFirst = outcomes.slice(1).map((outcome) => answer(`${outcome.id}-d3`, true))
    expect(selectNextDiagnosticQuestion(input({
      answers: [answer('o1-d5', true), ...coveredExceptFirst],
    }))?.targetDifficulty).toBe(5)
    expect(selectNextDiagnosticQuestion(input({
      answers: [answer('o1-d1', false), ...coveredExceptFirst],
    }))?.targetDifficulty).toBe(1)
  })

  it('prioritizes the weakest weighted outcome for confirmation', () => {
    const answers = [
      answer('o1-d3', true),
      answer('o2-d5', false),
      answer('o3-d3', true),
      answer('o4-d3', true),
      answer('o5-d3', true),
      answer('o6-d3', true),
    ]
    expect(selectNextDiagnosticQuestion(input({ answers }))).toMatchObject({
      outcomeId: 'o2',
      targetDifficulty: 4,
    })
  })

  it('never selects an outcome more than twice', () => {
    const answers = [
      answer('o1-d3', false),
      answer('o1-d2', false),
      answer('o2-d3', false),
      answer('o3-d3', true),
      answer('o4-d3', true),
      answer('o5-d3', true),
      answer('o6-d3', true),
    ]
    expect(selectNextDiagnosticQuestion(input({ answers }))?.outcomeId).toBe('o2')
  })

  it('uses prior weakness ordering and recommended difficulty for a recheck', () => {
    const selected = selectNextDiagnosticQuestion(input({
      kind: 'recheck',
      priorStates: [
        { outcomeId: 'o1', score: 80, recommendedDifficulty: 4 },
        { outcomeId: 'o2', score: 25, recommendedDifficulty: 2 },
      ],
    }))
    expect(selected).toMatchObject({ outcomeId: 'o2', targetDifficulty: 2, questionId: 'o2-d2' })
  })

  it('places missing prior scores after known scores during recheck coverage', () => {
    expect(selectNextDiagnosticQuestion(input({
      kind: 'recheck',
      priorStates: [{ outcomeId: 'o4', score: 75, recommendedDifficulty: 3 }],
    }))?.outcomeId).toBe('o4')
  })

  it('clamps an out-of-range integer prior recommendation', () => {
    expect(selectNextDiagnosticQuestion(input({
      kind: 'recheck',
      priorStates: [{ outcomeId: 'o1', score: 50, recommendedDifficulty: 99 }],
    }))?.targetDifficulty).toBe(5)
  })

  it('uses a stable seeded tie-break and excludes answered questions', () => {
    const tiedQuestions = [
      { id: 'q-a', outcomeId: 'o1', difficulty: 2 },
      { id: 'q-b', outcomeId: 'o1', difficulty: 4 },
    ]
    const first = selectNextDiagnosticQuestion(input({ outcomes: outcomes.slice(0, 1), questions: tiedQuestions }))
    const again = selectNextDiagnosticQuestion(input({ outcomes: outcomes.slice(0, 1), questions: tiedQuestions }))
    expect(again).toEqual(first)
    expect(first).not.toBeNull()
    if (!first) throw new Error('selection unexpectedly missing')
    const chosen = tiedQuestions.find((question) => question.id === first.questionId)
    if (!chosen) throw new Error('selected fixture missing')
    const remaining = selectNextDiagnosticQuestion(input({
      outcomes: outcomes.slice(0, 1),
      questions: tiedQuestions,
      answers: [{ ...chosen, questionId: chosen.id, isCorrect: true }],
    }))
    expect(remaining?.questionId).not.toBe(first.questionId)
  })

  it('falls through to the next ranked outcome when the first has no unasked candidate', () => {
    const limitedQuestions = [
      { id: 'o1-only', outcomeId: 'o1', difficulty: 3 },
      { id: 'o2-only', outcomeId: 'o2', difficulty: 3 },
    ]
    expect(selectNextDiagnosticQuestion(input({
      outcomes: outcomes.slice(0, 2),
      questions: limitedQuestions,
      answers: [{ questionId: 'o1-only', outcomeId: 'o1', difficulty: 3, isCorrect: false }],
    }))).toMatchObject({ outcomeId: 'o2', questionId: 'o2-only' })
  })

  it('stops at ten valid answers', () => {
    const recorded = [
      ...outcomes.map((outcome) => answer(`${outcome.id}-d3`, true)),
      ...outcomes.slice(0, 4).map((outcome) => answer(`${outcome.id}-d4`, true)),
    ]
    expect(recorded).toHaveLength(10)
    expect(selectNextDiagnosticQuestion(input({ answers: recorded }))).toBeNull()
  })

  it.each([
    ['duplicate outcome', { outcomes: [outcomes[0], outcomes[0]] }],
    ['invalid sort order', { outcomes: [{ id: 'o1', sortOrder: Number.NaN }] }],
    ['question with unknown outcome', { questions: [{ id: 'q', outcomeId: 'missing', difficulty: 3 }] }],
    ['invalid question difficulty', { questions: [{ id: 'q', outcomeId: 'o1', difficulty: 6 }] }],
    ['invalid prior score', { priorStates: [{ outcomeId: 'o1', score: 101, recommendedDifficulty: 3 }] }],
    ['invalid prior recommendation', { priorStates: [{ outcomeId: 'o1', score: 50, recommendedDifficulty: 2.5 }] }],
    ['prior for unknown outcome', { priorStates: [{ outcomeId: 'missing', score: 50, recommendedDifficulty: 3 }] }],
    ['duplicate prior outcome', { priorStates: [
      { outcomeId: 'o1', score: 50, recommendedDifficulty: 3 },
      { outcomeId: 'o1', score: 40, recommendedDifficulty: 2 },
    ] }],
    ['duplicate answered question', { answers: [answer('o1-d3', true), answer('o1-d3', false)] }],
    ['answer with unknown question', { answers: [{ questionId: 'missing', outcomeId: 'o1', difficulty: 3, isCorrect: true }] }],
    ['answer outcome mismatch', { answers: [{ questionId: 'o1-d3', outcomeId: 'o2', difficulty: 3, isCorrect: true }] }],
    ['answer difficulty mismatch', { answers: [{ questionId: 'o1-d3', outcomeId: 'o1', difficulty: 2, isCorrect: true }] }],
  ])('fails closed for malformed input: %s', (_label, overrides) => {
    expect(selectNextDiagnosticQuestion(input(overrides))).toBeNull()
  })

  it('does not mutate caller-owned arrays or records', () => {
    const original = input({
      kind: 'recheck',
      priorStates: [{ outcomeId: 'o1', score: 40, recommendedDifficulty: 2 }],
      answers: [answer('o1-d2', false)],
    })
    const snapshot = structuredClone(original)
    selectNextDiagnosticQuestion(original)
    expect(original).toEqual(snapshot)
  })
})
