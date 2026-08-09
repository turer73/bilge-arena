import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { QuestionRow } from '@/lib/utils/question-public'

const mockComputeDueMap = vi.hoisted(() => vi.fn())
vi.mock('../due-map', () => ({ computeDueMap: mockComputeDueMap }))

import { fetchDueQuestions } from '../due-questions'

type Admin = ReturnType<typeof createServiceRoleClient>

function makeQuestionRow(id: string, overrides: Partial<QuestionRow> = {}): QuestionRow {
  return {
    id,
    external_id: null,
    game: 'matematik',
    category: 'sayilar',
    subcategory: null,
    topic: null,
    difficulty: 2,
    level_tag: null,
    content: { question: `Soru ${id}`, options: ['A', 'B', 'C', 'D'], answer: 1 },
    base_points: 20,
    is_active: true,
    is_boss: false,
    times_answered: 0,
    times_correct: 0,
    source: null,
    exam_ref: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

function makeThenableChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is', 'in', 'or', 'order', 'limit']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return chain
}

describe('fetchDueQuestions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeDueMap.mockResolvedValue(new Map([['q1', { isDue: true, dueAt: '2026-01-01T00:00:00Z' }]]))
  })

  it('exam_ref filtresini due soru sorgusuna uygular', async () => {
    const wrongChain = makeThenableChain({ data: [{ question_id: 'q1' }], error: null })
    const questionChain = makeThenableChain({
      data: [makeQuestionRow('q1', { exam_ref: 'LGS' })],
      error: null,
    })
    const admin = {
      from: vi.fn((table: string) => table === 'session_answers' ? wrongChain : questionChain),
    } as unknown as Admin

    const result = await fetchDueQuestions(admin, 'u1', 'matematik', null, null, 'LGS')
    expect(result).toHaveLength(1)
    expect(wrongChain.or).toHaveBeenCalledWith('is_skipped.eq.false,is_skipped.is.null')
    expect(wrongChain.eq).toHaveBeenCalledWith('questions.exam_ref', 'LGS')
    expect(questionChain.eq).toHaveBeenCalledWith('exam_ref', 'LGS')
  })

  it('exact NULL exam kapsaminda iki sorguyu da IS NULL ile daraltir', async () => {
    const wrongChain = makeThenableChain({ data: [{ question_id: 'q1' }], error: null })
    const questionChain = makeThenableChain({ data: [makeQuestionRow('q1')], error: null })
    const admin = {
      from: vi.fn((table: string) => table === 'session_answers' ? wrongChain : questionChain),
    } as unknown as Admin

    const result = await fetchDueQuestions(admin, 'u1', 'wordquest', null, null, null, 'exact')

    expect(result).toHaveLength(1)
    expect(wrongChain.is).toHaveBeenCalledWith('questions.exam_ref', null)
    expect(questionChain.is).toHaveBeenCalledWith('exam_ref', null)
  })

  it('DB sonucu karisik gelse de sorulari en erken dueAt sirasina dizer', async () => {
    mockComputeDueMap.mockResolvedValue(new Map([
      ['q1', { isDue: true, dueAt: '2026-01-03T00:00:00Z' }],
      ['q2', { isDue: true, dueAt: '2026-01-01T00:00:00Z' }],
    ]))
    const wrongChain = makeThenableChain({
      data: [{ question_id: 'q1' }, { question_id: 'q2' }],
      error: null,
    })
    const questionChain = makeThenableChain({
      data: [makeQuestionRow('q1'), makeQuestionRow('q2')],
      error: null,
    })
    const admin = {
      from: vi.fn((table: string) => table === 'session_answers' ? wrongChain : questionChain),
    } as unknown as Admin

    const result = await fetchDueQuestions(admin, 'u1', 'matematik')
    expect(result.map((question) => question.id)).toEqual(['q2', 'q1'])
  })

  it('aday tarama DB hatasini bos havuz gibi yutmaz', async () => {
    const wrongChain = makeThenableChain({ data: null, error: { code: '08006' } })
    const admin = { from: vi.fn(() => wrongChain) } as unknown as Admin

    await expect(fetchDueQuestions(admin, 'u1', 'matematik')).rejects.toMatchObject({ code: '08006' })
    expect(mockComputeDueMap).not.toHaveBeenCalled()
  })

  it('due soru DB hatasini caller retry semantigi icin yukari tasir', async () => {
    const wrongChain = makeThenableChain({ data: [{ question_id: 'q1' }], error: null })
    const questionChain = makeThenableChain({ data: null, error: { code: '08006' } })
    const admin = {
      from: vi.fn((table: string) => table === 'session_answers' ? wrongChain : questionChain),
    } as unknown as Admin

    await expect(fetchDueQuestions(admin, 'u1', 'matematik')).rejects.toMatchObject({ code: '08006' })
  })
})
