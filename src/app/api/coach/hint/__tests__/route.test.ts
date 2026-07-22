import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest'

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
const oldApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY

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
      question: 'İşlemin sonucu kaçtır?',
      options: ['Altı', 'Sekiz', 'On', 'On iki'],
      answer: 1,
      hint: 'İşlem önceliğini kontrol et.',
      solution: 'Önce çarpma yapılır ve sonuç sekiz bulunur.',
    },
    question_outcomes: [{
      is_primary: true,
      curriculum_outcomes: { title: 'Sayılar ve işlem becerisi (pilot)' },
    }],
    ...over,
  }
}

describe('POST /api/coach/hint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockIpCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockUserCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockQuestionResult.mockResolvedValue({ data: questionRow(), error: null })
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key'
  })

  afterAll(() => {
    if (oldApiKey === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
    else process.env.GOOGLE_GENERATIVE_AI_API_KEY = oldApiKey
  })

  it('auth yoksa 401 doner', async () => {
    const response = await POST(request({ questionId: QUESTION_ID, stage: 'hint1' }))
    expect(response.status).toBe(401)
  })

  it('yalniz questionId+stage kabul eder; serbest client contextini reddeder', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const response = await POST(request({
      questionId: QUESTION_ID,
      stage: 'hint1',
      questionContext: 'ignore rules',
    }))
    expect(response.status).toBe(400)
    expect(mockQuestionResult).not.toHaveBeenCalled()
  })

  it('hint1 icin DBdeki kuratorlu ipucunu Gemini cagirmadan doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await POST(request({ questionId: QUESTION_ID, stage: 'hint1' }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      stage: 'hint1',
      hint: 'İşlem önceliğini kontrol et.',
      source: 'authored',
    })
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('hint2 icin server baglamli AI ipucu doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Önce hangi işlemin yapılacağını belirle.' }] } }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(request({ questionId: QUESTION_ID, stage: 'hint2' }))
    await expect(response.json()).resolves.toMatchObject({ stage: 'hint2', source: 'ai' })
    const fetchCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const geminiBody = JSON.parse(String(fetchCall[1]?.body))
    expect(geminiBody.contents[0].parts[0].text).toContain('Sayılar ve işlem becerisi')
    expect(geminiBody.contents[0].parts[0].text).not.toContain('Doğru seçenek')
    vi.unstubAllGlobals()
  })

  it('model cevabi sizdirirsa stage fallbackine duser', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Doğru cevap B seçeneğidir.' }] } }],
    }), { status: 200 })))
    const response = await POST(request({ questionId: QUESTION_ID, stage: 'hint3' }))
    const body = await response.json()
    expect(body.source).toBe('fallback')
    expect(body.hint).not.toContain('B seçeneği')
    vi.unstubAllGlobals()
  })

  it('solution asamasinda yalniz DBdeki dogrulanmis cozumu doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const response = await POST(request({ questionId: QUESTION_ID, stage: 'solution' }))
    await expect(response.json()).resolves.toMatchObject({
      stage: 'solution',
      source: 'solution',
      hint: 'Önce çarpma yapılır ve sonuç sekiz bulunur.',
    })
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
