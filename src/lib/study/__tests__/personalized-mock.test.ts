import { describe, expect, it } from 'vitest'
import { DENEME_CONFIGS } from '@/lib/constants/modes'
import {
  selectPersonalizedMock,
  type PersonalizedMockAnswer,
  type PersonalizedMockCandidate,
} from '../personalized-mock'

const at = (questionId: string, category: string, isCorrect: boolean, answeredAt = '2026-01-01T00:00:00.000Z'): PersonalizedMockAnswer => ({
  questionId,
  category,
  isCorrect,
  answeredAt,
})

describe('selectPersonalizedMock', () => {
  it('excludes skipped answers while retaining older false/null non-skip records', () => {
    const result = selectPersonalizedMock({
      game: 'matematik',
      size: 2,
      candidates: [
        { id: 'q1', category: 'sayilar' },
        { id: 'q2', category: 'sayilar' },
      ],
      answers: [
        { ...at('q1', 'sayilar', false, '2026-01-01T00:00:00.000Z'), isSkipped: null },
        { ...at('q1', 'sayilar', true, '2026-01-02T00:00:00.000Z'), isSkipped: true },
        { ...at('q2', 'sayilar', false), isSkipped: true },
      ],
    })

    expect(result.questionIds).toContain('q1')
    expect(result.breakdown).toMatchObject({ wrong: 1, weak: 0, coverage: 1, weakCategories: [] })
  })

  it('a newer correct answer closes an older wrong answer', () => {
    const result = selectPersonalizedMock({
      game: 'matematik',
      size: 1,
      candidates: [{ id: 'q1', category: 'sayilar' }],
      answers: [
        at('q1', 'sayilar', false, '2026-01-01T00:00:00.000Z'),
        at('q1', 'sayilar', true, '2026-01-02T00:00:00.000Z'),
      ],
    })

    expect(result.breakdown.wrong).toBe(0)
    expect(result.questionIds).toEqual(['q1'])
  })

  it('lets weak selection absorb the unused wrong quota, up to 32 combined', () => {
    const wrongCandidates = Array.from({ length: 10 }, (_, index) => ({ id: `wrong-${index}`, category: 'geometri' }))
    const weakCandidates = Array.from({ length: 25 }, (_, index) => ({ id: `weak-${index}`, category: 'sayilar' }))
    const result = selectPersonalizedMock({
      game: 'matematik',
      size: 40,
      candidates: [...wrongCandidates, ...weakCandidates],
      answers: [
        ...wrongCandidates.map(candidate => at(candidate.id, 'geometri', false)),
        ...Array.from({ length: 5 }, (_, index) => at(`strength-${index}`, 'sayilar', false)),
      ],
      seed: 'quota',
    })

    expect(result.breakdown.wrong).toBe(10)
    expect(result.breakdown.weak).toBe(22)
    expect(result.breakdown.wrong + result.breakdown.weak).toBe(32)
  })

  it('takes weak categories evenly with round-robin selection before final shuffle', () => {
    const candidates: PersonalizedMockCandidate[] = [
      ...Array.from({ length: 3 }, (_, index) => ({ id: `s-${index}`, category: 'sayilar' })),
      ...Array.from({ length: 3 }, (_, index) => ({ id: `p-${index}`, category: 'problemler' })),
    ]
    const result = selectPersonalizedMock({
      game: 'matematik',
      size: 4,
      candidates,
      answers: [
        ...Array.from({ length: 5 }, (_, index) => at(`sayilar-${index}`, 'sayilar', false)),
        ...Array.from({ length: 5 }, (_, index) => at(`problemler-${index}`, 'problemler', index === 0)),
      ],
      seed: 'round-robin',
    })

    const categoryById = new Map(candidates.map(candidate => [candidate.id, candidate.category]))
    const categories = result.questionIds.map(id => categoryById.get(id))
    expect(categories.filter(category => category === 'sayilar')).toHaveLength(2)
    expect(categories.filter(category => category === 'problemler')).toHaveLength(2)
  })

  it('deduplicates candidate ids across all stages', () => {
    const result = selectPersonalizedMock({
      game: 'matematik',
      size: 4,
      candidates: [
        { id: 'q1', category: 'sayilar' },
        { id: 'q1', category: 'sayilar' },
        { id: 'q2', category: 'sayilar' },
        { id: 'q3', category: 'problemler' },
      ],
      answers: [
        at('q1', 'sayilar', false),
        ...Array.from({ length: 5 }, (_, index) => at(`sample-${index}`, 'sayilar', false)),
      ],
    })

    expect(new Set(result.questionIds).size).toBe(result.questionIds.length)
  })

  it('is deterministic for a seed and independent of input order', () => {
    const candidates = Array.from({ length: 20 }, (_, index) => ({ id: `q-${index}`, category: index % 2 ? 'sayilar' : 'problemler' }))
    const answers = Array.from({ length: 5 }, (_, index) => at(`history-${index}`, 'sayilar', false))
    const forward = selectPersonalizedMock({ game: 'matematik', candidates, answers, seed: 'stable' })
    const reversed = selectPersonalizedMock({ game: 'matematik', candidates: [...candidates].reverse(), answers: [...answers].reverse(), seed: 'stable' })

    expect(reversed).toEqual(forward)
  })

  it('mixes wrong and coverage stages in the final deterministic order', () => {
    const wrong = Array.from({ length: 16 }, (_, index) => ({ id: `wrong-${index}`, category: 'sayilar' }))
    const coverage = Array.from({ length: 24 }, (_, index) => ({ id: `coverage-${index}`, category: 'problemler' }))
    const result = selectPersonalizedMock({
      game: 'matematik',
      candidates: [...wrong, ...coverage],
      answers: wrong.map(candidate => at(candidate.id, candidate.category, false)),
      seed: 'final-mix',
    })
    const wrongIds = new Set(wrong.map(candidate => candidate.id))

    expect(result.questionIds.slice(0, 16).some(id => !wrongIds.has(id))).toBe(true)
    expect(result.questionIds.slice(16).some(id => wrongIds.has(id))).toBe(true)
  })

  it('same-timestamp doğru cevabı giriş sırasından bağımsız son durum sayar', () => {
    const sameTime = '2026-01-02T00:00:00.000Z'
    const input = {
      game: 'matematik' as const,
      size: 1,
      candidates: [{ id: 'q1', category: 'sayilar' }],
      seed: 'same-time',
    }
    const answers = [
      at('q1', 'sayilar', false, sameTime),
      at('q1', 'sayilar', true, sameTime),
    ]

    expect(selectPersonalizedMock({ ...input, answers }).breakdown.wrong).toBe(0)
    expect(selectPersonalizedMock({ ...input, answers: [...answers].reverse() }).breakdown.wrong).toBe(0)
  })

  it('fills configured coverage gaps before using arbitrary remaining candidates', () => {
    const candidates = Object.entries(DENEME_CONFIGS.matematik.questionDistribution).flatMap(([category, count]) =>
      Array.from({ length: count }, (_, index) => ({ id: `${category}-${index}`, category })),
    )
    const result = selectPersonalizedMock({ game: 'matematik', candidates, answers: [], seed: 'coverage' })
    const categoryById = new Map(candidates.map(candidate => [candidate.id, candidate.category]))

    expect(result.questionIds).toHaveLength(40)
    expect(result.breakdown).toMatchObject({ wrong: 0, weak: 0, coverage: 40 })
    for (const [category, count] of Object.entries(DENEME_CONFIGS.matematik.questionDistribution)) {
      expect(result.questionIds.filter(id => categoryById.get(id) === category)).toHaveLength(count)
    }
  })

  it('reserves configured category slots before concentrated wrong/weak quotas', () => {
    const distribution = DENEME_CONFIGS.matematik.questionDistribution
    const candidates = Object.entries(distribution).flatMap(([category, count]) => {
      const available = category === 'problemler' ? 32 : count
      return Array.from({ length: available }, (_, index) => ({ id: `${category}-${index}`, category }))
    })
    const problemCandidates = candidates.filter(candidate => candidate.category === 'problemler')
    const result = selectPersonalizedMock({
      game: 'matematik',
      candidates,
      answers: problemCandidates.slice(0, 16).map(candidate => at(candidate.id, 'problemler', false)),
      seed: 'coverage-reservation',
    })
    const categoryById = new Map(candidates.map(candidate => [candidate.id, candidate.category]))

    expect(result.questionIds).toHaveLength(40)
    for (const [category, count] of Object.entries(distribution)) {
      expect(result.questionIds.filter(id => categoryById.get(id) === category)).toHaveLength(count)
    }
    expect(result.breakdown.wrong).toBeLessThanOrEqual(distribution.problemler)
  })

  it('returns fewer questions when the candidate pool is too small', () => {
    const result = selectPersonalizedMock({
      game: 'matematik',
      candidates: [
        { id: 'q1', category: 'sayilar' },
        { id: 'q2', category: 'problemler' },
      ],
      answers: [],
    })

    expect(result.questionIds).toHaveLength(2)
    expect(new Set(result.questionIds).size).toBe(2)
  })
})
