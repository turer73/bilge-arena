import { describe, expect, it } from 'vitest'
import {
  buildPaperPackRpcAnswers,
  paperPackSubmitInputSchema,
  paperPackViewSchema,
} from '../server-contract'

const base = {
  packId: '11111111-2222-4333-8444-555555555555',
  status: 'active',
  createdAt: '2026-08-09T10:00:00.000+00:00',
  expiresAt: '2026-08-16T10:00:00.000+00:00',
  submittedAt: null,
  plan: { game: 'matematik', planDate: '2026-08-09', examRef: 'TYT' },
  items: [{
    position: 1,
    question: {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      game: 'matematik',
      category: 'Temel Matematik',
      topic: 'Sayılar',
      difficulty: 2,
      content: { question: '2 + 2 kaçtır?', options: ['3', '4', '5', '6'] },
    },
    selectedOption: null,
    isCorrect: null,
    correctOption: null,
  }],
  summary: null,
  mastery: { source: 'paper', weight: 0.5 },
  reward: { xp: 0, coins: 0, socialPoints: 0 },
  privacy: { ownerOnly: true, privateCacheDisabled: true },
} as const

describe('paper pack public contract', () => {
  it('accepts an active answer-free pack', () => {
    expect(paperPackViewSchema.parse(base)).toEqual(base)
  })

  it('rejects answer, solution, identifiers, and reward leakage', () => {
    expect(paperPackViewSchema.safeParse({
      ...base,
      items: [{
        ...base.items[0],
        question: {
          ...base.items[0].question,
          content: { ...base.items[0].question.content, answer: 1 },
        },
      }],
    }).success).toBe(false)
    expect(paperPackViewSchema.safeParse({ ...base, userId: base.packId }).success).toBe(false)
    expect(paperPackViewSchema.safeParse({
      ...base,
      reward: { xp: 1, coins: 0, socialPoints: 0 },
    }).success).toBe(false)
  })

  it('accepts exact submitted grading including a blank answer', () => {
    const submitted = {
      ...base,
      status: 'submitted',
      submittedAt: '2026-08-09T11:00:00.000+00:00',
      items: [
        { ...base.items[0], selectedOption: 1, isCorrect: true, correctOption: 1 },
        {
          ...base.items[0],
          position: 2,
          question: {
            ...base.items[0].question,
            id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
          },
          selectedOption: null,
          isCorrect: null,
          correctOption: 2,
        },
      ],
      summary: { answeredCount: 1, correctCount: 1, scorePercent: 100 },
    }
    expect(paperPackViewSchema.parse(submitted)).toEqual(submitted)
  })

  it.each([
    ['active answer leak', { items: [{ ...base.items[0], correctOption: 1 }] }],
    ['wrong grading', {
      status: 'submitted',
      submittedAt: '2026-08-09T11:00:00.000+00:00',
      items: [{ ...base.items[0], selectedOption: 0, isCorrect: true, correctOption: 1 }],
      summary: { answeredCount: 1, correctCount: 1, scorePercent: 100 },
    }],
    ['summary mismatch', {
      status: 'submitted',
      submittedAt: '2026-08-09T11:00:00.000+00:00',
      items: [{ ...base.items[0], selectedOption: 1, isCorrect: true, correctOption: 1 }],
      summary: { answeredCount: 1, correctCount: 0, scorePercent: 0 },
    }],
    ['option bound', { items: [{ ...base.items[0], selectedOption: null, correctOption: 4 }] }],
  ])('rejects %s', (_label, override) => {
    expect(paperPackViewSchema.safeParse({ ...base, ...override }).success).toBe(false)
  })

  it('requires strict unique answer positions', () => {
    const input = {
      requestId: base.packId,
      answers: [
        { position: 1, selectedOption: 0 },
        { position: 1, selectedOption: null },
      ],
    }
    expect(paperPackSubmitInputSchema.safeParse(input).success).toBe(false)
    expect(paperPackSubmitInputSchema.safeParse({
      requestId: base.packId,
      answers: [{ position: 1, selectedOption: 0, userId: base.packId }],
    }).success).toBe(false)
  })

  it('maps public positions to the private RPC contract in pack order', () => {
    const second = {
      ...base.items[0],
      position: 2,
      question: {
        ...base.items[0].question,
        id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
        content: { ...base.items[0].question.content, options: ['A', 'B'] },
      },
    }
    const pack = paperPackViewSchema.parse({ ...base, items: [base.items[0], second] })
    expect(buildPaperPackRpcAnswers(pack, {
      requestId: base.packId,
      answers: [
        { position: 2, selectedOption: null },
        { position: 1, selectedOption: 3 },
      ],
    })).toEqual([
      { questionId: base.items[0].question.id, selectedOptionIndex: 3 },
      { questionId: second.question.id, selectedOptionIndex: null },
    ])
    expect(buildPaperPackRpcAnswers(pack, {
      requestId: base.packId,
      answers: [{ position: 1, selectedOption: 0 }],
    })).toBeNull()
    expect(buildPaperPackRpcAnswers(pack, {
      requestId: base.packId,
      answers: [
        { position: 1, selectedOption: 4 },
        { position: 2, selectedOption: null },
      ],
    })).toBeNull()
  })
})
