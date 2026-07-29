import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser, mockQuestionQuery, mockUserLimiter, mockIpLimiter, mockGetClientIp } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockQuestionQuery: vi.fn(),
  mockUserLimiter: { check: vi.fn() },
  mockIpLimiter: { check: vi.fn() },
  mockGetClientIp: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: mockQuestionQuery })),
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn((name: string) => name === 'questions-grade-user' ? mockUserLimiter : mockIpLimiter),
}))

vi.mock('@/lib/utils/client-ip', () => ({ getClientIp: mockGetClientIp }))

import { POST } from '../route'

const QUESTION_ID = '10000000-0000-4000-8000-000000000001'

function request(body: unknown, headers?: HeadersInit) {
  return new Request('http://localhost/api/questions/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/questions/grade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetClientIp.mockReturnValue('203.0.113.8')
    mockIpLimiter.check.mockResolvedValue({ success: true })
    mockUserLimiter.check.mockResolvedValue({ success: true })
    mockQuestionQuery.mockResolvedValue({
      data: { id: QUESTION_ID, content: { options: ['a', 'b', 'c', 'd'], answer: 2, solution: 'Co\u0308zu\u0308m' } },
      error: null,
    })
  })

  it('rejects an invalid request before querying a question', async () => {
    const res = await POST(request({ questionId: 'not-a-uuid', selectedOption: 5 }))

    expect(res.status).toBe(400)
    expect(mockQuestionQuery).not.toHaveBeenCalled()
  })

  it('returns 429 from the anonymous IP limit', async () => {
    mockIpLimiter.check.mockResolvedValue({ success: false, retryAfter: 17 })

    const res = await POST(request({ questionId: QUESTION_ID, selectedOption: 2 }))

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('17')
    expect(mockIpLimiter.check).toHaveBeenCalledWith('203.0.113.8')
  })

  it('returns a generic 404 for missing, inactive, or malformed question data', async () => {
    mockQuestionQuery.mockResolvedValueOnce({ data: null, error: null })
    const missing = await POST(request({ questionId: QUESTION_ID, selectedOption: 2 }))
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'Soru bulunamadi' })

    mockQuestionQuery.mockResolvedValueOnce({ data: { id: QUESTION_ID, content: { options: ['a', 'b'], answer: 9 } }, error: null })
    const malformed = await POST(request({ questionId: QUESTION_ID, selectedOption: 2 }))
    expect(malformed.status).toBe(404)
    expect(await malformed.json()).toEqual({ error: 'Soru bulunamadi' })
  })

  it('rejects conflicting answer fields and out-of-range option indexes', async () => {
    mockQuestionQuery.mockResolvedValueOnce({
      data: { id: QUESTION_ID, content: { options: ['a', 'b', 'c'], answer: 1, correct: 2 } },
      error: null,
    })
    expect((await POST(request({ questionId: QUESTION_ID, selectedOption: 1 }))).status).toBe(404)

    mockQuestionQuery.mockResolvedValueOnce({
      data: { id: QUESTION_ID, content: { options: ['a', 'b'], answer: 2 } },
      error: null,
    })
    expect((await POST(request({ questionId: QUESTION_ID, selectedOption: 1 }))).status).toBe(404)
  })

  it('does not expose database errors', async () => {
    mockQuestionQuery.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'sensitive database detail' } })

    const res = await POST(request({ questionId: QUESTION_ID, selectedOption: 2 }))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Notlandirma su anda kullanilamiyor' })
  })

  it('returns the post-submit feedback for correct and wrong selections', async () => {
    const correct = await POST(request({ questionId: QUESTION_ID, selectedOption: 2 }))
    expect(correct.status).toBe(200)
    expect(await correct.json()).toEqual({ isCorrect: true, correctOption: 2, solution: 'Co\u0308zu\u0308m' })

    const wrong = await POST(request({ questionId: QUESTION_ID, selectedOption: 1 }))
    expect(wrong.status).toBe(200)
    expect(await wrong.json()).toEqual({ isCorrect: false, correctOption: 2, solution: 'Co\u0308zu\u0308m' })
  })

  it('reveals feedback after a timed-out skip without marking it correct', async () => {
    const res = await POST(request({ questionId: QUESTION_ID, selectedOption: -1 }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      isCorrect: false,
      correctOption: 2,
      solution: 'Co\u0308zu\u0308m',
    })
  })

  it('uses the authenticated user key instead of the anonymous IP key', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-42' } } })

    const res = await POST(request({ questionId: QUESTION_ID, selectedOption: 2 }))

    expect(res.status).toBe(200)
    expect(mockUserLimiter.check).toHaveBeenCalledWith('user-42')
    expect(mockIpLimiter.check).not.toHaveBeenCalled()
    expect(mockGetClientIp).not.toHaveBeenCalled()
  })

  it('supports WordQuest correct/explanation content and caps feedback length', async () => {
    mockQuestionQuery.mockResolvedValue({
      data: { id: QUESTION_ID, content: { options: ['a', 'b', 'c', 'd', 'e'], correct: 4, explanation: 'x'.repeat(2_100) } },
      error: null,
    })

    const res = await POST(request({ questionId: QUESTION_ID, selectedOption: 4 }))
    const body = await res.json()

    expect(body).toMatchObject({ isCorrect: true, correctOption: 4 })
    expect(body.solution).toHaveLength(2_000)
  })
})
