import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Supabase mock — thenable chain (session_answers iki kez sorgulanir:
// 1) yanlis-cevap olaylari + questions join, 2) soru basina son-durum) ────

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
  mockWrongResult: vi.fn((): { data: unknown[] | null; error: { code?: string; message?: string } | null } => ({ data: [], error: null })),
  mockLastResult: vi.fn((): { data: unknown[] | null; error: { code?: string; message?: string } | null } => ({ data: [], error: null })),
  state: { callIndex: 0, chains: [] as Record<string, ReturnType<typeof vi.fn>>[] },
}))

function makeThenableChain(resultGetter: () => unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const self = () => chain
  for (const m of ['select', 'eq', 'or', 'order', 'limit', 'in', 'returns']) {
    chain[m] = vi.fn(self)
  }
  // Builder gercekte thenable — .returns() sonrasi dogrudan await edilir.
  ;(chain as unknown as { then: (res: (v: unknown) => void) => Promise<unknown> }).then = (resolve) =>
    Promise.resolve(resultGetter()).then(resolve)
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table !== 'session_answers') return makeThenableChain(() => ({ data: [], error: null }))
      state.callIndex++
      const chain = makeThenableChain(state.callIndex === 1 ? mockWrongResult : mockLastResult)
      state.chains.push(chain)
      return chain
    }),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn((name: string) => ({
    check: name === 'wrong-answers-user' ? mockUserCheck : mockIpCheck,
  })),
}))

vi.mock('@/lib/review/fsrs-rollout', () => ({
  getFsrsReviewRollout: vi.fn(() => ({ enabled: false, bucket: 0, percentage: 0, reason: 'master_disabled' })),
}))

import { GET } from '../route'

const U1 = '11111111-2222-3333-4444-555555555555'

function makeRequest(query = '', ip = '1.2.3.4') {
  const headers = new Headers()
  headers.set('x-forwarded-for', ip)
  return new Request(`http://localhost/api/review/wrong-answers${query}`, { headers }) as never
}

const Q1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const Q2 = 'aaaaaaaa-0000-4000-8000-000000000002'

const questionJoin = (overrides: Record<string, unknown> = {}) => ({
  id: Q1,
  game: 'matematik',
  category: 'sayilar',
  subcategory: null,
  difficulty: 2,
  content: { question: 'Soru?', options: ['A', 'B', 'C', 'D'], answer: 1, solution: 'Cozum' },
  ...overrides,
})

describe('GET /api/review/wrong-answers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.callIndex = 0
    state.chains = []
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockIpCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockUserCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockWrongResult.mockReturnValue({ data: [], error: null })
    mockLastResult.mockReturnValue({ data: [], error: null })
  })

  it('rejects unauthorized (no user) with 401', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Yetkisiz')
  })

  it('returns empty list when user never answered wrong', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    mockWrongResult.mockReturnValue({ data: [], error: null })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toEqual([])
    expect(body.hasMore).toBe(false)
    // Aday yoksa 2. sorgu (son-durum) hic calismamali
    expect(state.callIndex).toBe(1)
  })

  it('rejects invalid game with 400', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    const res = await GET(makeRequest('?game=uzay'))
    expect(res.status).toBe(400)
  })

  it('rejects invalid status with 400', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    const res = await GET(makeRequest('?status=bilinmez'))
    expect(res.status).toBe(400)
  })

  it('status=acik: son cevap da yanlissa acik doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    mockWrongResult.mockReturnValue({
      data: [
        {
          question_id: Q1,
          selected_option: 2,
          answered_at: '2026-07-10T10:00:00Z',
          is_skipped: false,
          questions: questionJoin(),
        },
      ],
      error: null,
    })
    mockLastResult.mockReturnValue({
      data: [{ question_id: Q1, is_correct: false, answered_at: '2026-07-10T10:00:00Z' }],
      error: null,
    })
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({
      questionId: Q1,
      status: 'acik',
      userSelectedOption: 2,
      wrongCount: 1,
    })
  })

  it('status=duzeltildi: son cevap dogruysa duzeltildi doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    mockWrongResult.mockReturnValue({
      data: [
        {
          question_id: Q1,
          selected_option: 2,
          answered_at: '2026-07-01T10:00:00Z',
          is_skipped: false,
          questions: questionJoin(),
        },
      ],
      error: null,
    })
    mockLastResult.mockReturnValue({
      // En son cevap DOGRU (daha yeni tarih) — duzeltildi
      data: [
        { question_id: Q1, is_correct: true, answered_at: '2026-07-15T10:00:00Z' },
        { question_id: Q1, is_correct: false, answered_at: '2026-07-01T10:00:00Z' },
      ],
      error: null,
    })
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.items[0].status).toBe('duzeltildi')
  })

  it('ayni soruya birden fazla yanlis cevap -> wrongCount toplanir, en son secim kullanilir', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    mockWrongResult.mockReturnValue({
      // answered_at DESC sirali (route boyle bekler)
      data: [
        { question_id: Q1, selected_option: 3, answered_at: '2026-07-10T10:00:00Z', is_skipped: false, questions: questionJoin() },
        { question_id: Q1, selected_option: 2, answered_at: '2026-07-05T10:00:00Z', is_skipped: false, questions: questionJoin() },
      ],
      error: null,
    })
    mockLastResult.mockReturnValue({
      data: [{ question_id: Q1, is_correct: false, answered_at: '2026-07-10T10:00:00Z' }],
      error: null,
    })
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].wrongCount).toBe(2)
    expect(body.items[0].userSelectedOption).toBe(3) // en son yanlis secim
  })

  it('is_skipped=true satirlar yanlis cevap sayilmaz', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    mockWrongResult.mockReturnValue({
      data: [
        { question_id: Q1, selected_option: null, answered_at: '2026-07-10T10:00:00Z', is_skipped: true, questions: questionJoin() },
      ],
      error: null,
    })
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.items).toEqual([])
    expect(state.callIndex).toBe(1) // aday yok -> son-durum sorgusu calismaz
  })

  it('status query-param filtreler', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    mockWrongResult.mockReturnValue({
      data: [
        { question_id: Q1, selected_option: 1, answered_at: '2026-07-10T10:00:00Z', is_skipped: false, questions: questionJoin({ id: Q1 }) },
        { question_id: Q2, selected_option: 0, answered_at: '2026-07-09T10:00:00Z', is_skipped: false, questions: questionJoin({ id: Q2 }) },
      ],
      error: null,
    })
    mockLastResult.mockReturnValue({
      data: [
        { question_id: Q1, is_correct: false, answered_at: '2026-07-10T10:00:00Z' },
        { question_id: Q2, is_correct: true, answered_at: '2026-07-12T10:00:00Z' },
      ],
      error: null,
    })
    const res = await GET(makeRequest('?status=duzeltildi'))
    const body = await res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].questionId).toBe(Q2)
  })

  it('game query-param questions.game uzerinde eq filtresi uygular', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    mockWrongResult.mockReturnValue({ data: [], error: null })
    await GET(makeRequest('?game=matematik'))
    const wrongChain = state.chains[0]
    expect(wrongChain.eq).toHaveBeenCalledWith('questions.game', 'matematik')
  })

  it('baska kullanicinin verisini sizdirmaz — sorgu auth.uid() ile filtrelenir', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    mockWrongResult.mockReturnValue({ data: [], error: null })
    await GET(makeRequest())
    const wrongChain = state.chains[0]
    expect(wrongChain.eq).toHaveBeenCalledWith('user_id', U1)
  })

  it('sets Cache-Control: no-store', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    const res = await GET(makeRequest())
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('returns 500 on wrong-answers query error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    mockWrongResult.mockReturnValue({ data: null, error: { code: 'PGRST500' } })
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
  })

  it('returns 500 on last-answer query error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    mockWrongResult.mockReturnValue({
      data: [{ question_id: Q1, selected_option: 1, answered_at: '2026-07-10T10:00:00Z', is_skipped: false, questions: questionJoin() }],
      error: null,
    })
    mockLastResult.mockReturnValue({ data: null, error: { code: 'PGRST500' } })
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
  })
})

describe('GET /api/review/wrong-answers rate limit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.callIndex = 0
    state.chains = []
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockIpCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockUserCheck.mockResolvedValue({ success: true, retryAfter: 0 })
  })

  it('IP limit reddi -> 429, auth.getUser cagrilmaz', async () => {
    mockIpCheck.mockResolvedValueOnce({ success: false, retryAfter: 30 })
    const res = await GET(makeRequest())
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('user limit reddi -> 429', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    mockUserCheck.mockResolvedValueOnce({ success: false, retryAfter: 12 })
    const res = await GET(makeRequest())
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('12')
  })
})
