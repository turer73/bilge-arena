import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const ipCheck = vi.fn()
  const userCheck = vi.fn()
  const from = vi.fn()
  return { getUser, ipCheck, userCheck, from }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ from: mocks.from })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn((name: string) => ({
    check: name.endsWith('-ip') ? mocks.ipCheck : mocks.userCheck,
  })),
}))

import { GET } from '../route'

type QueryResult = { data: unknown; error: { code?: string } | null }

function query(result: QueryResult) {
  const chain: Record<string, ReturnType<typeof vi.fn>> & {
    then?: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
  } = {}
  for (const method of ['select', 'eq', 'or', 'order', 'limit']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn(async () => result)
  chain.returns = vi.fn(async () => result)
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function question(id: string, category = 'sayilar') {
  return {
    id,
    external_id: null,
    game: 'matematik',
    category,
    subcategory: null,
    topic: null,
    difficulty: 3,
    level_tag: null,
    content: { question: `${id}?`, options: ['a', 'b', 'c', 'd'], answer: 1 },
    base_points: 30,
    is_active: true,
    is_boss: false,
    times_answered: 99,
    times_correct: 50,
    source: 'private-source',
    exam_ref: 'TYT',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

const U1 = '11111111-1111-4111-8111-111111111111'

function request(queryString = 'game=matematik&exam_ref=TYT') {
  return new Request(`http://localhost/api/study/personalized-mock?${queryString}`) as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.ipCheck.mockResolvedValue({ success: true })
  mocks.userCheck.mockResolvedValue({ success: true })
  mocks.getUser.mockResolvedValue({ data: { user: { id: U1 } } })

  const profileQuery = query({ data: { exam_type: 'yks' }, error: null })
  const questionQuery = query({ data: [question('q1')], error: null })
  const historyQuery = query({ data: [], error: null })
  mocks.from.mockImplementation((table: string) => {
    if (table === 'profiles') return profileQuery
    if (table === 'questions') return questionQuery
    if (table === 'session_answers') return historyQuery
    throw new Error(`unexpected table: ${table}`)
  })
})

describe('GET /api/study/personalized-mock', () => {
  it('IP limiti auth sorgusundan önce uygular', async () => {
    mocks.ipCheck.mockResolvedValueOnce({ success: false, retryAfter: 17 })
    const response = await GET(request())
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('17')
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('anonim kullanıcıyı reddeder', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    const response = await GET(request())
    expect(response.status).toBe(401)
    expect(mocks.userCheck).not.toHaveBeenCalled()
  })

  it('oyun, sınav referansı ve profil uyumunu doğrular', async () => {
    expect((await GET(request('game=bilinmeyen'))).status).toBe(400)
    expect((await GET(request('game=matematik&exam_ref=KPSS'))).status).toBe(400)

    const profileQuery = query({ data: { exam_type: 'lgs' }, error: null })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') return profileQuery
      throw new Error(`unexpected table: ${table}`)
    })
    expect((await GET(request('game=matematik&exam_ref=TYT'))).status).toBe(400)
    expect((await GET(request('game=wordquest'))).status).toBe(400)
  })

  it('yalnız auth kullanıcının oyun/sınav geçmişini, skip hariç sorgular', async () => {
    const profileQuery = query({ data: { exam_type: 'yks' }, error: null })
    const pool = Array.from({ length: 40 }, (_, index) => question(`q${index}`))
    const questionQuery = query({ data: pool, error: null })
    const historyQuery = query({
      data: [{
        question_id: 'q1',
        is_correct: false,
        is_skipped: null,
        answered_at: '2026-07-28T10:00:00.000Z',
        questions: question('q1'),
      }],
      error: null,
    })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') return profileQuery
      if (table === 'questions') return questionQuery
      if (table === 'session_answers') return historyQuery
      throw new Error(`unexpected table: ${table}`)
    })

    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(questionQuery.eq).toHaveBeenCalledWith('game', 'matematik')
    expect(questionQuery.eq).toHaveBeenCalledWith('exam_ref', 'TYT')
    expect(historyQuery.eq).toHaveBeenCalledWith('user_id', U1)
    expect(historyQuery.eq).toHaveBeenCalledWith('questions.game', 'matematik')
    expect(historyQuery.eq).toHaveBeenCalledWith('questions.exam_ref', 'TYT')
    expect(historyQuery.or).toHaveBeenCalledWith('is_skipped.eq.false,is_skipped.is.null')
    expect(body.breakdown.wrong).toBe(1)
    expect(body.questions).toHaveLength(40)
    expect(body.questions[0]).not.toHaveProperty('source')
    expect(body.questions[0]).not.toHaveProperty('times_answered')
  })

  it('40 sorudan küçük havuzu kısmi deneme olarak başlatmaz', async () => {
    const response = await GET(request())
    const body = await response.json()
    expect(response.status).toBe(422)
    expect(body).toMatchObject({ available: 1 })
  })

  it('profil varsayılanını kullanır ve sorgu hatasında 500 döner', async () => {
    const profileQuery = query({ data: { exam_type: 'yks' }, error: null })
    const questionQuery = query({ data: null, error: { code: 'DB_DOWN' } })
    const historyQuery = query({ data: [], error: null })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') return profileQuery
      if (table === 'questions') return questionQuery
      if (table === 'session_answers') return historyQuery
      throw new Error(`unexpected table: ${table}`)
    })

    const response = await GET(request('game=matematik'))
    expect(response.status).toBe(500)
    expect(questionQuery.eq).toHaveBeenCalledWith('exam_ref', 'TYT')
  })
})
