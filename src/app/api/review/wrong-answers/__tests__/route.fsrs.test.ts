import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * FEATURES.FSRS_REVIEW=true yolu — ayri dosya (route.test.ts FEATURES'i mock'lamiyor,
 * flag import-aninda okunuyor). isDue/dueAt alanlarinin lastRows'tan (EKSTRA SORGU
 * OLMADAN) dogru turetildigini dogrular.
 */
vi.mock('@/lib/constants/premium', () => ({
  FEATURES: { QUIZ_LIMIT: false, ADS: false, PREMIUM_UPSELL: false, FSRS_REVIEW: true },
  FREE_DAILY_LIMIT: 5,
}))

const {
  mockGetUser,
  mockIpCheck,
  mockUserCheck,
  mockWrongResult,
  mockLastResult,
  state,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(async () => ({ data: { user: null as null | { id: string } } })),
  mockIpCheck: vi.fn(async () => ({ success: true, retryAfter: 0 })),
  mockUserCheck: vi.fn(async () => ({ success: true, retryAfter: 0 })),
  mockWrongResult: vi.fn((): { data: unknown[] | null; error: { code?: string } | null } => ({ data: [], error: null })),
  mockLastResult: vi.fn((): { data: unknown[] | null; error: { code?: string } | null } => ({ data: [], error: null })),
  state: { callIndex: 0 },
}))

function makeThenableChain(resultGetter: () => unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const self = () => chain
  for (const m of ['select', 'eq', 'order', 'limit', 'in', 'returns']) {
    chain[m] = vi.fn(self)
  }
  ;(chain as unknown as { then: (res: (v: unknown) => void) => Promise<unknown> }).then = (resolve) =>
    Promise.resolve(resultGetter()).then(resolve)
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table !== 'session_answers') return makeThenableChain(() => ({ data: [], error: null }))
      state.callIndex++
      return makeThenableChain(state.callIndex === 1 ? mockWrongResult : mockLastResult)
    }),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn((name: string) => ({
    check: name === 'wrong-answers-user' ? mockUserCheck : mockIpCheck,
  })),
}))

import { GET } from '../route'

const U1 = '11111111-2222-3333-4444-555555555555'
const Q1 = 'aaaaaaaa-0000-4000-8000-000000000001'

function makeRequest(query = '', ip = '1.2.3.4') {
  const headers = new Headers()
  headers.set('x-forwarded-for', ip)
  return new Request(`http://localhost/api/review/wrong-answers${query}`, { headers }) as never
}

const questionJoin = (overrides: Record<string, unknown> = {}) => ({
  id: Q1,
  game: 'matematik',
  category: 'sayilar',
  subcategory: null,
  difficulty: 2,
  content: { question: 'Soru?', options: ['A', 'B', 'C', 'D'], answer: 1, solution: 'Cozum' },
  ...overrides,
})

describe('GET /api/review/wrong-answers — FEATURES.FSRS_REVIEW=true', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.callIndex = 0
    mockWrongResult.mockReturnValue({ data: [], error: null })
    mockLastResult.mockReturnValue({ data: [], error: null })
  })

  it('30 gun once tek yanlis cevap: isDue=true, dueAt dolu (ekstra sorgu YOK)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    mockWrongResult.mockReturnValue({
      data: [{
        question_id: Q1,
        selected_option: 2,
        answered_at: thirtyDaysAgo,
        is_skipped: false,
        questions: questionJoin(),
      }],
      error: null,
    })
    mockLastResult.mockReturnValue({
      data: [{ question_id: Q1, is_correct: false, answered_at: thirtyDaysAgo }],
      error: null,
    })

    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.items[0].isDue).toBe(true)
    expect(typeof body.items[0].dueAt).toBe('string')
  })

  it('yanlis + hemen ardindan dogru (simdi): isDue=false (henuz due degil)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    const wrongAt = new Date(Date.now() - 60_000).toISOString()
    const correctAt = new Date().toISOString()
    mockWrongResult.mockReturnValue({
      data: [{
        question_id: Q1,
        selected_option: 2,
        answered_at: wrongAt,
        is_skipped: false,
        questions: questionJoin(),
      }],
      error: null,
    })
    mockLastResult.mockReturnValue({
      data: [
        { question_id: Q1, is_correct: true, answered_at: correctAt },
        { question_id: Q1, is_correct: false, answered_at: wrongAt },
      ],
      error: null,
    })

    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.items[0].status).toBe('duzeltildi')
    expect(body.items[0].isDue).toBe(false)
  })
})
