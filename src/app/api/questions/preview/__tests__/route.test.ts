import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuestionRow } from '@/lib/utils/question-public'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ rpc: mockRpc })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({
    check: vi.fn(async () => ({ success: true })),
  })),
}))

import { GET } from '../route'

function makeQuestionRow(id: string, overrides: Partial<QuestionRow> = {}): QuestionRow {
  return {
    id,
    external_id: null,
    game: 'fen',
    category: 'biyoloji',
    subcategory: null,
    topic: 'Hücre',
    difficulty: 2,
    level_tag: null,
    content: { question: `Soru ${id}`, options: ['A', 'B', 'C', 'D'], answer: 1 },
    base_points: 20,
    is_active: true,
    is_boss: false,
    times_answered: 0,
    times_correct: 0,
    source: 'fixture',
    exam_ref: 'TYT',
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/questions/preview')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return new Request(url, { headers: { 'x-forwarded-for': '1.2.3.4' } })
}

describe('GET /api/questions/preview exam scope', () => {
  beforeEach(() => vi.clearAllMocks())

  it('preserves TYT and biyoloji while relaxing only difficulty', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [makeQuestionRow('tyt-bio')], error: null })

    const response = await GET(makeRequest({
      game: 'fen',
      category: 'biyoloji',
      difficulty: '5',
      examRef: 'TYT',
    }) as never)

    expect(mockRpc).toHaveBeenNthCalledWith(1, 'select_random_questions', {
      p_game: 'fen',
      p_limit: 3,
      p_category: 'biyoloji',
      p_difficulty: 5,
      p_exam_ref: 'TYT',
    })
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'select_random_questions', {
      p_game: 'fen',
      p_limit: 3,
      p_category: 'biyoloji',
      p_exam_ref: 'TYT',
    })
    await expect(response.json()).resolves.toEqual({
      question: expect.objectContaining({ id: 'tyt-bio', category: 'biyoloji' }),
    })
  })

  it('does not retry without scope when exact TYT biyoloji pool is empty', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const response = await GET(makeRequest({
      game: 'fen',
      category: 'biyoloji',
      examRef: 'TYT',
    }) as never)

    expect(mockRpc).toHaveBeenCalledTimes(1)
    await expect(response.json()).resolves.toEqual({ question: null })
  })

  it('fails closed if the RPC returns an AYT row for a TYT request', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [makeQuestionRow('ayt-bio', { exam_ref: 'AYT-SAY', topic: 'İnsan Fizyolojisi' })],
      error: null,
    })

    const response = await GET(makeRequest({
      game: 'fen',
      category: 'biyoloji',
      examRef: 'TYT',
    }) as never)

    await expect(response.json()).resolves.toEqual({ question: null })
  })
})
