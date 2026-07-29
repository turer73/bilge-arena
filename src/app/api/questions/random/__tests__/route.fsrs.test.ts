import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QuestionRow } from '@/lib/utils/question-public'

/** FSRS rollout kohortuna dahil kullanicinin route davranisi. */
vi.mock('@/lib/review/fsrs-rollout', () => ({
  getFsrsReviewRollout: vi.fn(() => ({ enabled: true, bucket: 0, percentage: 100, reason: 'cohort' })),
}))

function makeTableMock() {
  const queue: { data: unknown; error: unknown }[] = []
  const push = (r: { data: unknown; error: unknown }) => queue.push(r)
  const from = vi.fn(() => {
    const result = queue.length > 0 ? queue.shift()! : { data: [], error: null }
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'gte', 'or', 'order', 'limit']) {
      chain[m] = vi.fn(() => chain)
    }
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject)
    return chain
  })
  return { from, push, reset: () => { queue.length = 0 } }
}

const { mockGetUser, mockRpc, mockHistory, sessionAnswersMock, questionsMock } = vi.hoisted(() => {
  function makeTableMockHoisted() {
    const queue: { data: unknown; error: unknown }[] = []
    const push = (r: { data: unknown; error: unknown }) => queue.push(r)
    let lastChain: Record<string, ReturnType<typeof vi.fn>> | null = null
    const from = vi.fn(() => {
      const result = queue.length > 0 ? queue.shift()! : { data: [], error: null }
      const chain: Record<string, ReturnType<typeof vi.fn>> = {}
      for (const m of ['select', 'eq', 'in', 'gte', 'or', 'order', 'limit']) {
        chain[m] = vi.fn(() => chain)
      }
      ;(chain as unknown as { then: unknown }).then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject)
      lastChain = chain
      return chain
    })
    return { from, push, reset: () => { queue.length = 0; lastChain = null }, getLastChain: () => lastChain }
  }
  return {
    mockGetUser: vi.fn(),
    mockRpc: vi.fn(),
    mockHistory: vi.fn(async (): Promise<{ data: Array<{ question_id: string }>; error: null }> => ({
      data: [],
      error: null,
    })),
    sessionAnswersMock: makeTableMockHoisted(),
    questionsMock: makeTableMockHoisted(),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    rpc: mockRpc,
    from: vi.fn((table: string) => {
      if (table === 'user_question_history') {
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: mockHistory })) })) })),
        }
      }
      if (table === 'session_answers') return sessionAnswersMock.from()
      if (table === 'questions') return questionsMock.from()
      return makeTableMock().from()
    }),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check: vi.fn(async () => ({ success: true })) })),
}))

import { GET } from '../route'

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

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/questions/random')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers = new Headers()
  headers.set('x-forwarded-for', '1.2.3.4')
  return new Request(url.toString(), { headers })
}

describe('GET /api/questions/random — FSRS rollout kohortu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionAnswersMock.reset()
    questionsMock.reset()
  })

  it('due<=simdi olan soru FSRS-fold ile havuza girer', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [makeQuestionRow('q1')], error: null })

    // 1) aday-tarama: wq1 en az bir kez yanlis
    sessionAnswersMock.push({ data: [{ question_id: 'wq1' }], error: null })
    // 2) tam gecmis: tek yanlis cevap, 30 gun once — Again sonrasi due kisa
    // vadeli (dakikalar) oldugu icin bugun kesinlikle due'dur
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    sessionAnswersMock.push({
      data: [{ question_id: 'wq1', is_correct: false, answered_at: thirtyDaysAgo }],
      error: null,
    })
    // 3) questions final-fetch
    questionsMock.push({ data: [makeQuestionRow('wq1')], error: null })

    const res = await GET(makeRequest({ game: 'matematik', includeReview: 'true' }) as never)
    const body = await res.json()
    expect(body.reviewQuestions).toEqual([
      expect.objectContaining({ id: 'wq1', game: 'matematik', category: 'sayilar' }),
    ])
  })

  it('Vercel Agent Review bulgusu: dueIds kirpilmadan .in()e gecirilir, limit DB-tarafinda + filtrelerden SONRA uygulanir', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [makeQuestionRow('q1')], error: null })

    // 25 farkli soru, hepsi due (30 gun once yanlis) -- 20'den fazla, cross-game
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const ids = Array.from({ length: 25 }, (_, i) => `wq${i}`)
    sessionAnswersMock.push({ data: ids.map((id) => ({ question_id: id })), error: null })
    sessionAnswersMock.push({
      data: ids.map((id) => ({ question_id: id, is_correct: false, answered_at: thirtyDaysAgo })),
      error: null,
    })
    questionsMock.push({ data: [makeQuestionRow('wq0')], error: null })

    await GET(makeRequest({ game: 'matematik', includeReview: 'true' }) as never)

    const chain = questionsMock.getLastChain()!
    // .in() TUM 25 id ile cagrilmis olmali (JS-tarafinda 20'ye kirpilmamis)
    expect(chain.in).toHaveBeenCalledWith('id', ids)
    // .limit(20) filtrelerden (eq('game',...)) SONRA cagrilmis olmali
    const inOrder = chain.in.mock.invocationCallOrder[0]
    const eqGameOrder = chain.eq.mock.invocationCallOrder[0]
    const limitOrder = chain.limit.mock.invocationCallOrder[0]
    expect(inOrder).toBeLessThan(eqGameOrder)
    expect(limitOrder).toBeGreaterThan(eqGameOrder)
  })

  it('henuz due OLMAYAN soru havuza girmez ve 7-gun fallback calismaz', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [makeQuestionRow('q1')], error: null })

    const now = new Date().toISOString()
    // 1) aday-tarama: wq1 gecmiste yanlis
    sessionAnswersMock.push({ data: [{ question_id: 'wq1' }], error: null })
    // 2) tam gecmis: yanlis + hemen ardindan dogru (simdi) -> stability yuksek,
    // due uzak gelecekte -- HENUZ due degil
    sessionAnswersMock.push({
      data: [
        { question_id: 'wq1', is_correct: false, answered_at: new Date(Date.now() - 60_000).toISOString() },
        { question_id: 'wq1', is_correct: true, answered_at: now },
      ],
      error: null,
    })
    // questions sorgusuna hic gidilmemeli (dueIds bos) -- push YOK

    const res = await GET(makeRequest({ game: 'matematik', includeReview: 'true' }) as never)
    const body = await res.json()
    expect(body.reviewQuestions).toEqual([])
    expect(sessionAnswersMock.from).toHaveBeenCalledTimes(2)
  })

  it('FSRS fold hata atarsa 7-gune duser (crash etmez)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [makeQuestionRow('q1')], error: null })

    // 1) aday-tarama basarisiz (error) -> fetchDueQuestions throw eder; route
    // yalniz hata halinde 7-gun fallback'ine gecer.
    sessionAnswersMock.push({ data: null, error: { code: '500' } })
    // 7-gun fallback: yanlis-cevaplar sorgusu
    sessionAnswersMock.push({ data: [], error: null })

    const res = await GET(makeRequest({ game: 'matematik', includeReview: 'true' }) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reviewQuestions).toEqual([])
  })
})
