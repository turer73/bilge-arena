import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { createServiceRoleClient } from '@/lib/supabase/service-role'

const mockComputeDueMap = vi.hoisted(() => vi.fn())
vi.mock('../due-map', () => ({ computeDueMap: mockComputeDueMap }))

import { fetchDueQuestions } from '../due-questions'

type Admin = ReturnType<typeof createServiceRoleClient>

function makeThenableChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return chain
}

describe('fetchDueQuestions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeDueMap.mockResolvedValue(new Map([['q1', { isDue: true }]]))
  })

  it('exam_ref filtresini due soru sorgusuna uygular', async () => {
    const wrongChain = makeThenableChain({ data: [{ question_id: 'q1' }], error: null })
    const questionChain = makeThenableChain({ data: [{ id: 'q1', exam_ref: 'LGS' }], error: null })
    const admin = {
      from: vi.fn((table: string) => table === 'session_answers' ? wrongChain : questionChain),
    } as unknown as Admin

    const result = await fetchDueQuestions(admin, 'u1', 'matematik', null, null, 'LGS')
    expect(result).toHaveLength(1)
    expect(questionChain.eq).toHaveBeenCalledWith('exam_ref', 'LGS')
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
