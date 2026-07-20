import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * FEATURES.FSRS_REVIEW=true yolu — ayri dosya, cunku bu flag route modulunun
 * IMPORT ANINDA okunuyor (module-level const), tek dosya icinde test-basina
 * toggle etmek dynamic-import/resetModules gerektirirdi. Bu dosya FSRS_REVIEW'i
 * BASTAN true mock'luyor.
 */
vi.mock('@/lib/constants/premium', () => ({
  FEATURES: { QUIZ_LIMIT: false, ADS: false, PREMIUM_UPSELL: false, FSRS_REVIEW: true },
  FREE_DAILY_LIMIT: 5,
}))

function makeTableMock() {
  const queue: { data: unknown; error: unknown }[] = []
  const push = (r: { data: unknown; error: unknown }) => queue.push(r)
  const from = vi.fn(() => {
    const result = queue.length > 0 ? queue.shift()! : { data: [], error: null }
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'gte', 'order', 'limit']) {
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
    const from = vi.fn(() => {
      const result = queue.length > 0 ? queue.shift()! : { data: [], error: null }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'gte', 'order', 'limit']) {
        chain[m] = vi.fn(() => chain)
      }
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject)
      return chain
    })
    return { from, push, reset: () => { queue.length = 0 } }
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

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/questions/random')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers = new Headers()
  headers.set('x-forwarded-for', '1.2.3.4')
  return new Request(url.toString(), { headers })
}

describe('GET /api/questions/random — FEATURES.FSRS_REVIEW=true', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionAnswersMock.reset()
    questionsMock.reset()
  })

  it('due<=simdi olan soru FSRS-fold ile havuza girer', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [{ id: 'q1' }], error: null })

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
    questionsMock.push({ data: [{ id: 'wq1', game: 'matematik' }], error: null })

    const res = await GET(makeRequest({ game: 'matematik', includeReview: 'true' }) as never)
    const body = await res.json()
    expect(body.reviewQuestions).toEqual([{ id: 'wq1', game: 'matematik' }])
  })

  it('henuz due OLMAYAN soru (yakin zamanda dogru cevaplanmis) havuza girmez, 7-gun fallback da bos doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [{ id: 'q1' }], error: null })

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
  })

  it('FSRS fold hata atarsa 7-gune duser (crash etmez)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [{ id: 'q1' }], error: null })

    // 1) aday-tarama basarisiz (error) -> wrongRows null -> candidateIds bos ->
    // fetchFsrsDueQuestions [] doner (try/catch'e girmeden), sonra 7-gun
    // fallback'ine geciliyor: o da 2 sorgu bekliyor
    sessionAnswersMock.push({ data: null, error: { code: '500' } })
    // 7-gun fallback: yanlis-cevaplar sorgusu
    sessionAnswersMock.push({ data: [], error: null })

    const res = await GET(makeRequest({ game: 'matematik', includeReview: 'true' }) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reviewQuestions).toEqual([])
  })
})
