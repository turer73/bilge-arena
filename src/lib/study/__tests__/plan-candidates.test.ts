import { describe, expect, it } from 'vitest'
import type { Question } from '@/types/database'
import { buildPlanCandidates } from '../plan-candidates'

function question(id: string, category: string, difficulty: number): Question {
  return { id, category, difficulty } as Question
}

const outcomes = [
  { id: 'o-weak', code: 'OUT-WEAK', category: 'sayilar', sortOrder: 10 },
  { id: 'o-next', code: 'OUT-NEXT', category: 'problemler', sortOrder: 20 },
]

describe('buildPlanCandidates', () => {
  it('due sirasini korur, zayif/current mappingi ve challenge/choice havuzlarini kurar', () => {
    const base = [
      question('q1', 'sayilar', 2),
      question('q2', 'sayilar', 4),
      question('q3', 'problemler', 5),
      question('q4', 'problemler', 1),
    ]
    const result = buildPlanCandidates({
      seed: 'u1|2026-08-08|matematik|TYT',
      dueQuestions: [question('due-2', 'sayilar', 2), question('due-1', 'sayilar', 2)],
      baseQuestions: base,
      outcomes,
      outcomeStates: [
        { outcomeId: 'o-weak', attempts: 5, correctAttempts: 1, weightedEarned: 1, weightedPossible: 5, delayedCorrect: 0, lastAnsweredAt: '2026-08-01T00:00:00Z' },
      ],
      mappings: [
        { questionId: 'q1', outcomeId: 'o-weak' },
        { questionId: 'q2', outcomeId: 'o-weak' },
        { questionId: 'q3', outcomeId: 'o-next' },
      ],
      recentQuestionIds: [],
      selectedCategory: 'problemler',
    })

    expect(result.pools.due.map((item) => item.questionId)).toEqual(['due-2', 'due-1'])
    expect(result.pools.weak_outcome.map((item) => item.sourceRef)).toEqual(['OUT-WEAK', 'OUT-WEAK'])
    expect(result.pools.current_target[0].sourceRef).toBe('problemler')
    expect(result.pools.challenge.map((item) => item.questionId).sort()).toEqual(['q2', 'q3'])
    expect(result.pools.student_choice.every((item) => ['q3', 'q4'].includes(item.questionId))).toBe(true)
  })

  it('son 50 goruleni fresh ve secim havuzunun sonuna iter', () => {
    const base = [question('recent', 'sayilar', 1), question('fresh', 'sayilar', 1)]
    const result = buildPlanCandidates({
      seed: 'seed',
      dueQuestions: [],
      baseQuestions: base,
      outcomes: [],
      outcomeStates: [],
      mappings: [],
      recentQuestionIds: ['recent'],
      selectedCategory: null,
    })
    expect(result.freshCandidates.map((item) => item.questionId)).toEqual(['fresh', 'recent'])
    expect(result.pools.student_choice.map((item) => item.questionId)).toEqual(['fresh', 'recent'])
  })
})
