import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { Question } from '@/types/database'

// ─── Supabase client mock (createClient'i ele alıyoruz) ─────────────────────

type Captured = {
  count?: number
  rangeCalls: Array<{ from: number; to: number }>
  filters: Record<string, unknown[]>
}

const captured: Captured = { rangeCalls: [], filters: {} }

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

// Chainable mock query builder
function makeQueryBuilder(opts: {
  countResult?: number
  rangeResult: Question[]
  recordRange?: boolean
  recordFilter?: boolean
}) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.select = vi.fn(chain)
  builder.eq = vi.fn((col: string, val: unknown) => {
    if (opts.recordFilter) {
      captured.filters[col] = captured.filters[col] || []
      ;(captured.filters[col] as unknown[]).push(val)
    }
    return chain()
  })
  builder.not = vi.fn(chain)
  builder.in = vi.fn(chain)
  builder.gte = vi.fn(chain)
  builder.order = vi.fn(chain)
  builder.limit = vi.fn(() => Promise.resolve({ data: opts.rangeResult, error: null }))
  builder.range = vi.fn((from: number, to: number) => {
    if (opts.recordRange) captured.rangeCalls.push({ from, to })
    return Promise.resolve({ data: opts.rangeResult, error: null })
  })
  // count head:true call returns then-able with { count, error }
  builder.then = (resolve: (v: { count: number; error: null }) => void) =>
    resolve({ count: opts.countResult ?? 0, error: null })
  return builder
}

vi.mock('@/lib/supabase/client', () => {
  return {
    createClient: () => ({
      from: vi.fn((_table: string) => {
        // İlk çağrı: count head:true (questions)
        // İkinci çağrı: range fetch (questions)
        // 3. çağrı: user_question_history (recentIds yoksa hep boş)
        // Sadeleştirme: tek bir akıllı builder döndür — her dalda
        const result = makeQuestion('q-1', 'matematik')
        return makeQueryBuilder({
          countResult: captured.count ?? 2697,
          rangeResult: Array.from({ length: 30 }, (_, i) => makeQuestion(`q-${i}`, 'matematik')),
          recordRange: true,
          recordFilter: true,
        })
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

describe('fetchQuizQuestions — random offset window', () => {
  beforeEach(() => {
    captured.rangeCalls = []
    captured.filters = {}
    captured.count = 2697
    vi.stubGlobal('navigator', { onLine: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('range cagirisi yapilir (limit degil) — random offset penceresi aktif', async () => {
    const result = await fetchQuizQuestions({ game: 'matematik', limit: 10 })
    expect(result.length).toBeGreaterThan(0)
    expect(captured.rangeCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('range penceresi fetchLimit (limit*3=30 veya max 150) boyutunda', async () => {
    await fetchQuizQuestions({ game: 'matematik', limit: 10 })
    const call = captured.rangeCalls[0]
    const windowSize = call.to - call.from + 1
    expect(windowSize).toBe(30) // limit*3, 150'den kucuk
  })

  it('count pool buyukse offset 0..(count-window) araliginda', async () => {
    captured.count = 2697
    // 100 kere cagir, offset'ler degisiyor mu?
    const offsets = new Set<number>()
    for (let i = 0; i < 30; i++) {
      captured.rangeCalls = []
      await fetchQuizQuestions({ game: 'matematik', limit: 10 })
      if (captured.rangeCalls.length > 0) {
        offsets.add(captured.rangeCalls[0].from)
      }
    }
    // Random olmali — 30 deneme icinde en az 5 farkli offset
    expect(offsets.size).toBeGreaterThan(5)
    // Hicbiri max'i asmasin: max = count - fetchLimit = 2697 - 30 = 2667
    for (const off of offsets) {
      expect(off).toBeGreaterThanOrEqual(0)
      expect(off).toBeLessThanOrEqual(2667)
    }
  })

  it('pool kucukse (count < fetchLimit) offset 0 olur', async () => {
    captured.count = 20 // 30'dan az
    await fetchQuizQuestions({ game: 'matematik', limit: 10 })
    expect(captured.rangeCalls[0].from).toBe(0)
  })

  it('cevrimdisi mode supabase cagirmaz, cache kullanir', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    captured.rangeCalls = []
    const result = await fetchQuizQuestions({ game: 'matematik', limit: 10 })
    expect(captured.rangeCalls.length).toBe(0)
    expect(result).toEqual([])
  })

  it('category filter PostgREST eq cagirisinda', async () => {
    captured.filters = {}
    await fetchQuizQuestions({ game: 'matematik', limit: 10, category: 'cebir' })
    expect(captured.filters.category).toContain('cebir')
  })

  it('difficulty filter PostgREST eq cagirisinda', async () => {
    captured.filters = {}
    await fetchQuizQuestions({ game: 'matematik', limit: 10, difficulty: 3 })
    expect(captured.filters.difficulty).toContain(3)
  })
})
