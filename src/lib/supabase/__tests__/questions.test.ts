import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { Question } from '@/types/database'

// ─── Supabase client mock ─────────────────────

type Captured = {
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>
  fromCalls: string[]
  rpcResult: Question[] | null
  rpcError: { message: string } | null
}

const captured: Captured = {
  rpcCalls: [],
  fromCalls: [],
  rpcResult: null,
  rpcError: null,
}

function makeQuestion(id: string, game: string): Question {
  return {
    id,
    external_id: null,
    game: game as Question['game'],
    category: 'cebir',
    subcategory: null,
    topic: null,
    difficulty: 2,
    level_tag: null,
    content: { question: 'Q?', options: ['A', 'B', 'C', 'D'], answer: 0, solution: 'A' },
    base_points: 20,
    is_active: true,
    is_boss: false,
    times_answered: 0,
    times_correct: 0,
    source: 'test',
    exam_ref: null,
    created_at: '2026-05-13T00:00:00Z',
    updated_at: '2026-05-13T00:00:00Z',
  } as unknown as Question
}

// Builder: user_question_history sorgusu için chainable
function makeQueryBuilder() {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.select = vi.fn(chain)
  builder.eq = vi.fn(chain)
  builder.not = vi.fn(chain)
  builder.in = vi.fn(chain)
  builder.gte = vi.fn(chain)
  builder.order = vi.fn(chain)
  builder.limit = vi.fn(() => Promise.resolve({ data: [], error: null }))
  return builder
}

vi.mock('@/lib/supabase/client', () => {
  return {
    createClient: () => ({
      from: vi.fn((table: string) => {
        captured.fromCalls.push(table)
        return makeQueryBuilder()
      }),
      rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
        captured.rpcCalls.push({ fn, args })
        return Promise.resolve({ data: captured.rpcResult, error: captured.rpcError })
      }),
    }),
  }
})

vi.mock('@/lib/utils/question-cache', () => ({
  cacheQuestions: vi.fn().mockResolvedValue(undefined),
  getCachedQuestions: vi.fn().mockResolvedValue([]),
}))

// Import AFTER mocks
import { fetchQuizQuestions } from '../questions'

describe('fetchQuizQuestions — RPC server-side random', () => {
  beforeEach(() => {
    captured.rpcCalls = []
    captured.fromCalls = []
    captured.rpcResult = Array.from({ length: 20 }, (_, i) => makeQuestion(`q-${i}`, 'matematik'))
    captured.rpcError = null
    vi.stubGlobal('navigator', { onLine: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('select_random_questions RPC cagrilir (count + range degil)', async () => {
    await fetchQuizQuestions({ game: 'matematik', limit: 10 })
    expect(captured.rpcCalls.length).toBe(1)
    expect(captured.rpcCalls[0].fn).toBe('select_random_questions')
  })

  it('p_game ve p_limit RPC parametre olarak gecer', async () => {
    await fetchQuizQuestions({ game: 'matematik', limit: 10 })
    const args = captured.rpcCalls[0].args
    expect(args.p_game).toBe('matematik')
    // fetchLimit = min(limit*2, 50) = 20
    expect(args.p_limit).toBe(20)
  })

  it('category filter p_category parametresi olur', async () => {
    await fetchQuizQuestions({ game: 'matematik', limit: 10, category: 'cebir' })
    expect(captured.rpcCalls[0].args.p_category).toBe('cebir')
  })

  it('difficulty filter p_difficulty parametresi olur', async () => {
    await fetchQuizQuestions({ game: 'matematik', limit: 10, difficulty: 3 })
    expect(captured.rpcCalls[0].args.p_difficulty).toBe(3)
  })

  it('category/difficulty yoksa RPC parametre eklenmez', async () => {
    await fetchQuizQuestions({ game: 'matematik', limit: 10 })
    const args = captured.rpcCalls[0].args
    expect(args).not.toHaveProperty('p_category')
    expect(args).not.toHaveProperty('p_difficulty')
    expect(args).not.toHaveProperty('p_exclude_ids')
  })

  it('cevrimdisi mode RPC cagrilmaz', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    captured.rpcCalls = []
    const result = await fetchQuizQuestions({ game: 'matematik', limit: 10 })
    expect(captured.rpcCalls.length).toBe(0)
    expect(result).toEqual([])
  })

  it('RPC sonucu Question dizisi olarak dondurulur', async () => {
    captured.rpcResult = [makeQuestion('q-a', 'matematik'), makeQuestion('q-b', 'matematik')]
    const result = await fetchQuizQuestions({ game: 'matematik', limit: 10 })
    expect(result.length).toBe(2)
    expect(result[0].id).toMatch(/^q-/)
  })

  it('RPC hata donerse offline cache fallback denenir', async () => {
    captured.rpcError = { message: 'rpc failed' }
    captured.rpcResult = null
    const result = await fetchQuizQuestions({ game: 'matematik', limit: 10 })
    expect(result).toEqual([])
  })

  it('limit*2 üst sınır 50', async () => {
    await fetchQuizQuestions({ game: 'matematik', limit: 100 })
    // fetchLimit = min(100*2, 50) = 50
    expect(captured.rpcCalls[0].args.p_limit).toBe(50)
  })
})
