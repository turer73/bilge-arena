import { describe, expect, it } from 'vitest'
import { buildDiagnosticSummary } from '../summary'

const outcomes = Array.from({ length: 6 }, (_, index) => ({
  id: `internal-${index}`,
  code: `MAT-${index}`,
  title: `Kazanım ${index}`,
  category: `category-${index}`,
  sortOrder: index,
}))

const states = outcomes.map((outcome, index) => ({
  outcomeId: outcome.id,
  attempts: index < 4 ? 2 : 1,
  correctAttempts: index % 2,
  score: [0, 39.99, 40, 69.99, 70, 100][index],
  recommendedDifficulty: (index % 5) + 1,
  lastDiagnosedAt: `2026-08-08T10:00:0${index}.000Z`,
}))

describe('buildDiagnosticSummary', () => {
  it('returns six ordered ID-free outcome summaries and score bands', () => {
    const result = buildDiagnosticSummary([...outcomes].reverse(), states)
    expect(result).toEqual({
      completedAt: '2026-08-08T10:00:05.000Z',
      outcomes: expect.arrayContaining([
        expect.objectContaining({ code: 'MAT-0', band: 'foundation', score: 0 }),
        expect.objectContaining({ code: 'MAT-2', band: 'developing', score: 40 }),
        expect.objectContaining({ code: 'MAT-4', band: 'strong', score: 70 }),
      ]),
    })
    expect(result?.outcomes.map((outcome) => outcome.code)).toEqual(outcomes.map((outcome) => outcome.code))
    expect(JSON.stringify(result)).not.toContain('internal-')
    expect(JSON.stringify(result)).not.toContain('outcomeId')
  })

  it('fails closed for incomplete, duplicate, orphan, or invalid evidence', () => {
    expect(buildDiagnosticSummary(outcomes.slice(0, 5), states.slice(0, 5))).toBeNull()
    expect(buildDiagnosticSummary(outcomes, [...states.slice(0, 5), states[0]])).toBeNull()
    expect(buildDiagnosticSummary(outcomes, states.map((state, index) => (
      index === 0 ? { ...state, outcomeId: 'orphan' } : state
    )))).toBeNull()
    expect(buildDiagnosticSummary(outcomes, states.map((state, index) => (
      index === 0 ? { ...state, score: Number.NaN } : state
    )))).toBeNull()
    expect(buildDiagnosticSummary(outcomes, states.map((state, index) => (
      index === 0 ? { ...state, recommendedDifficulty: 6 } : state
    )))).toBeNull()
  })
})
