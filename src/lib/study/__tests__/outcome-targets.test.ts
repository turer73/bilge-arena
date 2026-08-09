import { describe, expect, it } from 'vitest'
import { rankCurrentOutcomes, rankWeakOutcomes } from '../outcome-targets'

const outcomes = [
  { id: 'o1', code: 'O-1', category: 'sayilar', sortOrder: 10 },
  { id: 'o2', code: 'O-2', category: 'problemler', sortOrder: 20 },
  { id: 'o3', code: 'O-3', category: 'geometri', sortOrder: 30 },
]

describe('rankWeakOutcomes', () => {
  it('yetersiz kaniti ve mastered outcomeu dislar, en dusuk dogrulugu one alir', () => {
    const ranked = rankWeakOutcomes(outcomes, [
      { outcomeId: 'o1', attempts: 6, correctAttempts: 5, weightedEarned: 5, weightedPossible: 6, delayedCorrect: 1, lastAnsweredAt: null },
      { outcomeId: 'o2', attempts: 5, correctAttempts: 2, weightedEarned: 2, weightedPossible: 5, delayedCorrect: 0, lastAnsweredAt: null },
      { outcomeId: 'o3', attempts: 2, correctAttempts: 0, weightedEarned: 0, weightedPossible: 2, delayedCorrect: 0, lastAnsweredAt: null },
    ])

    expect(ranked.map((outcome) => outcome.id)).toEqual(['o2'])
  })

  it('esit dogrulukta gecikmeli kaniti az ve orneklemi cok olani once alir', () => {
    const ranked = rankWeakOutcomes(outcomes.slice(0, 2), [
      { outcomeId: 'o1', attempts: 4, correctAttempts: 2, weightedEarned: 2, weightedPossible: 4, delayedCorrect: 1, lastAnsweredAt: null },
      { outcomeId: 'o2', attempts: 6, correctAttempts: 3, weightedEarned: 3, weightedPossible: 6, delayedCorrect: 0, lastAnsweredAt: null },
    ])
    expect(ranked.map((outcome) => outcome.id)).toEqual(['o2', 'o1'])
  })
})
describe('rankCurrentOutcomes', () => {
  it('secili kategoriyi, sonra son calisilan hedefi, sonra curriculum sirasini kullanir', () => {
    const ranked = rankCurrentOutcomes(outcomes, [
      { outcomeId: 'o1', attempts: 1, correctAttempts: 1, weightedEarned: 1, weightedPossible: 1, delayedCorrect: 0, lastAnsweredAt: '2026-07-01T00:00:00Z' },
      { outcomeId: 'o3', attempts: 1, correctAttempts: 0, weightedEarned: 0, weightedPossible: 1, delayedCorrect: 0, lastAnsweredAt: '2026-08-01T00:00:00Z' },
    ], 'problemler')

    expect(ranked.map((outcome) => outcome.id)).toEqual(['o2', 'o3', 'o1'])
  })

  it('mastered outcomeu guncel hedef havuzundan cikarir', () => {
    const ranked = rankCurrentOutcomes(outcomes, [
      { outcomeId: 'o1', attempts: 5, correctAttempts: 4, weightedEarned: 4, weightedPossible: 5, delayedCorrect: 1, lastAnsweredAt: '2026-08-01T00:00:00Z' },
    ], null)
    expect(ranked.map((outcome) => outcome.id)).toEqual(['o2', 'o3'])
  })
})
