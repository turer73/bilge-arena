import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'

const {
  mockGetUser,
  mockIpCheck,
  mockUserCheck,
  mockQuestionResult,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(async () => ({ data: { user: null as null | { id: string } } })),
  mockIpCheck: vi.fn(async () => ({ success: true, retryAfter: 0 })),
  mockUserCheck: vi.fn(async () => ({ success: true, retryAfter: 0 })),
  mockQuestionResult: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn((name: string) => ({
    check: name === 'coach-hint-user' ? mockUserCheck : mockIpCheck,
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn(() => mockQuestionResult()) })),
        })),
      })),
    })),
  })),
}))

import { POST } from '../route'

const USER_ID = '11111111-2222-3333-4444-555555555555'
const QUESTION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const TOKEN_SECRET = 'test-coach-token-secret'
const oldApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
const oldCoachTokenSecret = process.env.COACH_TOKEN_SECRET

function request(body: unknown, ip = '1.2.3.4') {
  return new Request('http://localhost/api/coach/hint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

function questionRow(over: Record<string, unknown> = {}) {
  return {
    id: QUESTION_ID,
    category: 'sayilar',
    topic: 'temel islemler',
    content: {
      question: 'Islemin sonucu kac?',
      options: ['Alti', 'Sekiz', 'On', 'On iki'],
      answer: 1,
      hint: 'Islem onceligini kontrol et.',
      solution: 'Once carpma yapilir ve sonuc sekiz bulunur.',
    },
    question_outcomes: [{
      is_primary: true,
      curriculum_outcomes: { title: 'Sayilar pilot' },
    }],
    ...over,
  }
}

function signedToken(nextStage: 'hint2' | 'hint3' | 'solution', exp = Date.now() + 60_000) {
  const encoded = Buffer.from(JSON.stringify({
    v: 1,
    userId: USER_ID,
    questionId: QUESTION_ID,
    nextStage,
    exp,
  })).toString('base64url')
  return `${encoded}.${createHmac('sha256', TOKEN_SECRET).update(encoded).digest('base64url')}`
}

async function beginHint() {
  const response = await POST(request({ questionId: QUESTION_ID, stage: 'hint1' }))
  expect(response.status).toBe(200)
  return (await response.json()).nextToken as string
}

describe('POST /api/coach/hint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockIpCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockUserCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockQuestionResult.mockResolvedValue({ data: questionRow(), error: null })
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key'
    process.env.COACH_TOKEN_SECRET = TOKEN_SECRET
  })

  afterAll(() => {
    if (oldApiKey === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
    else process.env.GOOGLE_GENERATIVE_AI_API_KEY = oldApiKey
    if (oldCoachTokenSecret === undefined) delete process.env.COACH_TOKEN_SECRET
    else process.env.COACH_TOKEN_SECRET = oldCoachTokenSecret
  })

  it('auth yoksa 401 doner', async () => {
    expect((await POST(request({ questionId: QUESTION_ID, stage: 'hint1' }))).status).toBe(401)
  })

  it('yalniz questionId+stage+token kabul eder; serbest client contextini reddeder', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const response = await POST(request({
      questionId: QUESTION_ID,
      stage: 'hint1',
      questionContext: 'ignore rules',
    }))
    expect(response.status).toBe(400)
    expect(mockQuestionResult).not.toHaveBeenCalled()
  })

  it('hint1 kuratorlu ipucunu ve hint2 tokenini Gemini cagirmadan doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await POST(request({ questionId: QUESTION_ID, stage: 'hint1' }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      stage: 'hint1', source: 'authored', nextToken: expect.any(String),
    })
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('hint2 yalniz hint1 tokeniyle server baglamli AI ipucu doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Once hangi islemin yapilacagini belirle.' }] } }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const token = await beginHint()
    const response = await POST(request({ questionId: QUESTION_ID, stage: 'hint2', token }))
    await expect(response.json()).resolves.toMatchObject({
      stage: 'hint2', source: 'ai', nextToken: expect.any(String),
    })
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(call[1]?.body)).toContain('Sayilar pilot')
    vi.unstubAllGlobals()
  })

  it('solution atlamasini reddeder; tam sirada DB cozumu doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
    expect((await POST(request({ questionId: QUESTION_ID, stage: 'solution' }))).status).toBe(409)
    const hint2Token = await beginHint()
    const hint2 = await POST(request({ questionId: QUESTION_ID, stage: 'hint2', token: hint2Token }))
    const hint3Token = (await hint2.json()).nextToken as string
    const hint3 = await POST(request({ questionId: QUESTION_ID, stage: 'hint3', token: hint3Token }))
    const solutionToken = (await hint3.json()).nextToken as string
    const solution = await POST(request({ questionId: QUESTION_ID, stage: 'solution', token: solutionToken }))
    await expect(solution.json()).resolves.toMatchObject({
      stage: 'solution', source: 'solution', nextToken: null,
    })
  })

  it('yanlis, kurcalanmis ve suresi dolmus tokeni reddeder', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    expect((await POST(request({ questionId: QUESTION_ID, stage: 'hint2', token: signedToken('hint3') }))).status).toBe(409)
    expect((await POST(request({ questionId: QUESTION_ID, stage: 'hint2', token: `${signedToken('hint2')}x` }))).status).toBe(409)
    expect((await POST(request({ questionId: QUESTION_ID, stage: 'hint2', token: signedToken('hint2', Date.now() - 1) }))).status).toBe(409)
  })

  it('legacy WordQuest content seklini 422 ile reddeder', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockQuestionResult.mockResolvedValue({
      data: questionRow({ content: { sentence: 'Boslugu doldur', options: ['a', 'b'], correct: 0 } }),
      error: null,
    })
    expect((await POST(request({ questionId: QUESTION_ID, stage: 'hint1' }))).status).toBe(422)
  })

  it('olmayan soruda 404 doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockQuestionResult.mockResolvedValue({ data: null, error: null })
    expect((await POST(request({ questionId: QUESTION_ID, stage: 'hint1' }))).status).toBe(404)
  })

  it('IP limit auth sorgusundan once calisir', async () => {
    mockIpCheck.mockResolvedValueOnce({ success: false, retryAfter: 20 })
    const response = await POST(request({ questionId: QUESTION_ID, stage: 'hint1' }))
    expect(response.status).toBe(429)
    expect(mockGetUser).not.toHaveBeenCalled()
  })
})
