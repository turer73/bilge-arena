import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const ipCheck = vi.fn()
  const userCheck = vi.fn()
  const from = vi.fn()
  const filterTytSocialQuestionIds = vi.fn()
  const issueVerifiedAttempt = vi.fn()
  const issueVerifiedExamAttempt = vi.fn()
  return {
    getUser,
    ipCheck,
    userCheck,
    from,
    filterTytSocialQuestionIds,
    issueVerifiedAttempt,
    issueVerifiedExamAttempt,
  }
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

vi.mock('@/lib/verified-attempts', () => ({
  filterTytSocialQuestionIds: mocks.filterTytSocialQuestionIds,
  issueVerifiedAttempt: mocks.issueVerifiedAttempt,
  issueVerifiedExamAttempt: mocks.issueVerifiedExamAttempt,
  toPublicVerifiedQuestions: (snapshots: unknown[]) => snapshots,
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

function question(
  id: string,
  category = 'sayilar',
  overrides: Record<string, unknown> = {},
) {
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
    ...overrides,
  }
}

const U1 = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
const oldStrategyFlag = process.env.MOCK_STRATEGY_ENABLED
const oldStrategyUiFlag = process.env.NEXT_PUBLIC_MOCK_STRATEGY_ENABLED
const oldTytSocialFlag = process.env.TYT_SOCIAL_V2_LEARNER_ENABLED
const oldTytSocialUiFlag = process.env.NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED

function request(queryString = 'game=matematik&exam_ref=TYT', withRequestId = false) {
  return new Request(`http://localhost/api/study/personalized-mock?${queryString}`, {
    headers: withRequestId ? { 'X-Idempotency-Key': REQUEST_ID } : undefined,
  }) as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.MOCK_STRATEGY_ENABLED
  delete process.env.NEXT_PUBLIC_MOCK_STRATEGY_ENABLED
  delete process.env.TYT_SOCIAL_V2_LEARNER_ENABLED
  delete process.env.NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED
  mocks.ipCheck.mockResolvedValue({ success: true })
  mocks.userCheck.mockResolvedValue({ success: true })
  mocks.getUser.mockResolvedValue({ data: { user: { id: U1 } } })
  mocks.filterTytSocialQuestionIds.mockImplementation(async (
    _admin: unknown,
    _userId: string,
    ids: string[],
  ) => ids)
  const projected = (id: string, game: string) => ({
    id,
    game,
    category: 'sayilar',
    subcategory: null,
    topic: null,
    difficulty: 3,
    level_tag: null,
    base_points: 30,
    content: { question: `${id}?`, options: ['a', 'b', 'c', 'd'] },
  })
  mocks.issueVerifiedAttempt.mockImplementation(async (_admin: unknown, input: { game: string; questionIds: string[] }) => ({
    attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    expiresAt: '2099-01-01T00:00:00.000Z',
    questionSnapshots: input.questionIds.map(id => projected(id, input.game)),
  }))
  mocks.issueVerifiedExamAttempt.mockImplementation(async (_admin: unknown, input: { game: string; items: Array<{ questionId: string }> }) => ({
    attemptId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    expiresAt: '2099-01-01T00:00:00.000Z',
    strategyEligible: true,
    blueprintVersion: 'personalized-mock-v1',
    questionSnapshots: input.items.map(item => projected(item.questionId, input.game)),
  }))

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

afterAll(() => {
  if (oldStrategyFlag === undefined) delete process.env.MOCK_STRATEGY_ENABLED
  else process.env.MOCK_STRATEGY_ENABLED = oldStrategyFlag
  if (oldStrategyUiFlag === undefined) delete process.env.NEXT_PUBLIC_MOCK_STRATEGY_ENABLED
  else process.env.NEXT_PUBLIC_MOCK_STRATEGY_ENABLED = oldStrategyUiFlag
  if (oldTytSocialFlag === undefined) delete process.env.TYT_SOCIAL_V2_LEARNER_ENABLED
  else process.env.TYT_SOCIAL_V2_LEARNER_ENABLED = oldTytSocialFlag
  if (oldTytSocialUiFlag === undefined) delete process.env.NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED
  else process.env.NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED = oldTytSocialUiFlag
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
    expect((await GET(request('game=constructor'))).status).toBe(400)
    expect((await GET(request('game=toString'))).status).toBe(400)
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
    expect(body).toMatchObject({
      attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expiresAt: '2099-01-01T00:00:00.000Z',
    })
    expect(mocks.issueVerifiedAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: U1,
        game: 'matematik',
        mode: 'deneme',
        questionIds: body.questions.map((item: { id: string }) => item.id),
        examRef: 'TYT',
        requestId: expect.any(String),
      }),
    )
    expect(body.questions[0]).not.toHaveProperty('source')
    expect(body.questions[0]).not.toHaveProperty('times_answered')
  })

  it('40 sorudan küçük havuzu kısmi deneme olarak başlatmaz', async () => {
    const response = await GET(request())
    const body = await response.json()
    expect(response.status).toBe(422)
    expect(body).toMatchObject({ available: 1 })
    expect(mocks.issueVerifiedAttempt).not.toHaveBeenCalled()
  })

  it('TYT Sosyal havuzunu seçim politikasına göre filtreleyip policy-aware bilet üretir', async () => {
    process.env.TYT_SOCIAL_V2_LEARNER_ENABLED = 'true'
    process.env.NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED = 'true'
    const profileQuery = query({ data: { exam_type: 'yks' }, error: null })
    const pool = Array.from({ length: 45 }, (_, index) => question(
      `s${index}`,
      index < 15 ? 'tarih' : index < 30 ? 'cografya' : 'felsefe',
      { game: 'sosyal' },
    ))
    const questionQuery = query({ data: pool, error: null })
    const historyQuery = query({ data: [], error: null })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') return profileQuery
      if (table === 'questions') return questionQuery
      if (table === 'session_answers') return historyQuery
      throw new Error(`unexpected table: ${table}`)
    })
    mocks.filterTytSocialQuestionIds.mockResolvedValue(pool.slice(0, 40).map(item => item.id))

    const response = await GET(request('game=sosyal&exam_ref=TYT'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.questions).toHaveLength(40)
    expect(mocks.filterTytSocialQuestionIds).toHaveBeenCalledWith(
      expect.anything(),
      U1,
      pool.map(item => item.id),
    )
    expect(mocks.issueVerifiedAttempt).not.toHaveBeenCalled()
    expect(mocks.issueVerifiedExamAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        game: 'sosyal',
        examRef: 'TYT',
        items: expect.arrayContaining([expect.objectContaining({ questionId: expect.any(String) })]),
      }),
    )
    expect(body.strategyEligible).toBe(false)
    expect(body).not.toHaveProperty('blueprintVersion')
  })

  it('TYT Sosyal seçim politikası çözülemezse soru döndürmeden kapanır', async () => {
    process.env.TYT_SOCIAL_V2_LEARNER_ENABLED = 'true'
    process.env.NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED = 'true'
    const profileQuery = query({ data: { exam_type: 'yks' }, error: null })
    const pool = Array.from({ length: 40 }, (_, index) => question(`s${index}`, 'tarih', { game: 'sosyal' }))
    const questionQuery = query({ data: pool, error: null })
    const historyQuery = query({ data: [], error: null })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') return profileQuery
      if (table === 'questions') return questionQuery
      if (table === 'session_answers') return historyQuery
      throw new Error(`unexpected table: ${table}`)
    })
    mocks.filterTytSocialQuestionIds.mockRejectedValue(new Error('private detail'))

    const response = await GET(request('game=sosyal&exam_ref=TYT'))

    expect(response.status).toBe(409)
    expect(mocks.issueVerifiedAttempt).not.toHaveBeenCalled()
    expect(mocks.issueVerifiedExamAttempt).not.toHaveBeenCalled()
  })

  it('server flag açıkken ordered source snapshot ile atomic verified exam üretir', async () => {
    process.env.MOCK_STRATEGY_ENABLED = 'true'
    process.env.NEXT_PUBLIC_MOCK_STRATEGY_ENABLED = 'true'
    const profileQuery = query({ data: { exam_type: 'yks' }, error: null })
    const pool = Array.from({ length: 40 }, (_, index) => question(`q${index}`))
    const questionQuery = query({ data: pool, error: null })
    const historyQuery = query({ data: [], error: null })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') return profileQuery
      if (table === 'questions') return questionQuery
      if (table === 'session_answers') return historyQuery
      throw new Error(`unexpected table: ${table}`)
    })

    const response = await GET(request(undefined, true))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      attemptId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      strategyEligible: true,
      blueprintVersion: 'personalized-mock-v1',
    })
    expect(mocks.issueVerifiedAttempt).not.toHaveBeenCalled()
    expect(mocks.issueVerifiedExamAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: U1,
        game: 'matematik',
        examRef: 'TYT',
        blueprintVersion: 'personalized-mock-v1',
        plannedDurationSec: 2700,
        requestId: REQUEST_ID,
        items: expect.arrayContaining([
          expect.objectContaining({ sourceBucket: 'coverage' }),
        ]),
      }),
    )
    const issued = mocks.issueVerifiedExamAttempt.mock.calls[0][1]
    expect(issued.items.map((item: { questionId: string }) => item.questionId))
      .toEqual(body.questions.map((item: { id: string }) => item.id))
  })

  it('fails closed without returning questions when ticket issuance fails', async () => {
    const profileQuery = query({ data: { exam_type: 'yks' }, error: null })
    const pool = Array.from({ length: 40 }, (_, index) => question(`q${index}`))
    const questionQuery = query({ data: pool, error: null })
    const historyQuery = query({ data: [], error: null })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') return profileQuery
      if (table === 'questions') return questionQuery
      if (table === 'session_answers') return historyQuery
      throw new Error(`unexpected table: ${table}`)
    })
    mocks.issueVerifiedAttempt.mockRejectedValueOnce(new Error('database detail'))

    const response = await GET(request())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Deneme baslatilamadi' })
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
