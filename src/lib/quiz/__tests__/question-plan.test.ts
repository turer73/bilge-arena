import { afterEach, describe, expect, it, vi } from 'vitest'
import { composeQuizQuestions } from '../question-plan'

const makeQuestions = (prefix: string, count: number, category = 'sayilar') =>
  Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`, category }))

afterEach(() => vi.restoreAllMocks())

describe('composeQuizQuestions', () => {
  it('limits the issued plan to ten unique questions with three reviews without mutating the pools', () => {
    const reviewQuestions = makeQuestions('review', 5)
    const questions = [...makeQuestions('fresh', 30), ...reviewQuestions]
    const original = structuredClone({ questions, reviewQuestions })
    const selected = composeQuizQuestions({ questions, reviewQuestions, game: 'matematik', mode: 'classic', limit: 10 })
    expect(selected).toHaveLength(10)
    expect(new Set(selected.map(question => question.id)).size).toBe(10)
    // A deterministic pool without overlap checks the quota separately below.
    expect({ questions, reviewQuestions }).toEqual(original)
    const distinct = composeQuizQuestions({ questions: makeQuestions('fresh', 30), reviewQuestions, game: 'matematik', mode: 'classic', limit: 10 })
    expect(distinct.filter(question => question.id.startsWith('review-'))).toHaveLength(3)
    expect(distinct.filter(question => question.id.startsWith('fresh-'))).toHaveLength(7)
  })

  it('applies deneme quotas before issuance and excludes the review pool', () => {
    const quotas = { sayilar: 8, problemler: 14, geometri: 10, denklemler: 4, fonksiyonlar: 2, olasilik: 2 }
    const questions = Object.entries(quotas).flatMap(([category, count]) => makeQuestions(category, count + 3, category))
    const selected = composeQuizQuestions({ questions, reviewQuestions: makeQuestions('review', 10), game: 'matematik', mode: 'deneme', limit: 40 })
    expect(selected).toHaveLength(40)
    for (const [category, count] of Object.entries(quotas)) {
      expect(selected.filter(question => question.category === category)).toHaveLength(count)
    }
    expect(selected.some(question => question.id.startsWith('review-'))).toBe(false)
  })

  it('fills category shortages with remaining unique questions and honors the requested limit', () => {
    const questions = [...makeQuestions('sayi', 2), ...makeQuestions('problem', 9, 'problemler')]
    const selected = composeQuizQuestions({ questions: [...questions, questions[0]], reviewQuestions: [], game: 'matematik', mode: 'deneme', limit: 10 })
    expect(selected).toHaveLength(10)
    expect(new Set(selected.map(question => question.id)).size).toBe(10)
  })

  it('returns all available questions when the pool is shorter than the plan', () => {
    expect(composeQuizQuestions({ questions: makeQuestions('q', 2), reviewQuestions: [], game: 'matematik', mode: 'classic', limit: 10 })).toHaveLength(2)
  })
})
