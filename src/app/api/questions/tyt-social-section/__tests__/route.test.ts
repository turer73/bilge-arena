import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getUser,
  check,
  createServiceRoleClient,
  issueOfficialSection,
  toPublicVerifiedQuestions,
  admin,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  check: vi.fn(),
  createServiceRoleClient: vi.fn(),
  issueOfficialSection: vi.fn(),
  toPublicVerifiedQuestions: vi.fn(),
  admin: { kind: 'service-role-client' },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient }))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check })),
}))

vi.mock('@/lib/verified-attempts', () => ({
  issueVerifiedTytSocialOfficialSection: issueOfficialSection,
  toPublicVerifiedQuestions,
}))

import { POST } from '../route'

const REQUEST_ID = '40000000-0000-4000-8000-000000000001'
const OTHER_REQUEST_ID = '50000000-0000-4000-8000-000000000001'
const ATTEMPT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EXPIRES_AT = '2099-01-01T00:00:00.000Z'
const privateSnapshots = Array.from({ length: 20 }, (_, index) => ({
  position: index + 1,
  questionId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  correctOption: 1,
  content: {
    question: `Soru ${index + 1}`,
    options: ['A', 'B', 'C', 'D'],
    answer: 1,
    solution: 'sunucu sırrı',
  },
}))
const publicQuestions = privateSnapshots.map(snapshot => ({
  id: snapshot.questionId,
  game: 'sosyal',
  category: 'tarih',
  subcategory: null,
  topic: null,
  difficulty: 2,
  level_tag: null,
  base_points: 20,
  content: {
    question: snapshot.content.question,
    options: snapshot.content.options,
  },
}))

function request(
  body: unknown = { requestId: REQUEST_ID },
  idempotencyKey: string | null = REQUEST_ID,
) {
  const headers = new Headers({
    'content-type': 'application/json',
    'x-forwarded-for': '203.0.113.7',
    origin: 'https://bilgearena.com',
  })
  if (idempotencyKey) headers.set('x-idempotency-key', idempotencyKey)
  return new Request('http://localhost/api/questions/tyt-social-section', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('POST /api/questions/tyt-social-section', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    check.mockResolvedValue({ success: true })
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    createServiceRoleClient.mockReturnValue(admin)
    issueOfficialSection.mockResolvedValue({
      attemptId: ATTEMPT_ID,
      expiresAt: EXPIRES_AT,
      questionSnapshots: privateSnapshots,
      variant: 'questions_16_20',
      snapshot: { items: privateSnapshots },
    })
    toPublicVerifiedQuestions.mockReturnValue(publicQuestions)
  })

  it('rejects malformed input and header/body idempotency mismatch before auth', async () => {
    const malformed = await POST(request({ requestId: 'not-a-uuid' }) as never)
    const mismatch = await POST(request({ requestId: REQUEST_ID }, OTHER_REQUEST_ID) as never)

    expect(malformed.status).toBe(400)
    expect(mismatch.status).toBe(400)
    expect(getUser).not.toHaveBeenCalled()
    expect(issueOfficialSection).not.toHaveBeenCalled()
  })

  it('binds the actor to the authenticated cookie and returns only the public projection', async () => {
    const response = await POST(request() as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(createServiceRoleClient).toHaveBeenCalledTimes(1)
    expect(issueOfficialSection).toHaveBeenCalledWith(admin, {
      userId: 'user-1',
      requestId: REQUEST_ID,
    })
    expect(toPublicVerifiedQuestions).toHaveBeenCalledWith(privateSnapshots)
    expect(body).toEqual({
      questions: publicQuestions,
      reviewQuestions: [],
      attemptId: ATTEMPT_ID,
      expiresAt: EXPIRES_AT,
    })
    expect(JSON.stringify(body)).not.toContain('sunucu sırrı')
    expect(body).not.toHaveProperty('variant')
    expect(body).not.toHaveProperty('snapshot')
  })

  it('returns 401 before creating the service-role client for an anonymous request', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    const response = await POST(request() as never)

    expect(response.status).toBe(401)
    expect(createServiceRoleClient).not.toHaveBeenCalled()
    expect(issueOfficialSection).not.toHaveBeenCalled()
  })

  it('fails closed when the IP rate-limit backend is unavailable', async () => {
    check.mockResolvedValueOnce({
      success: false,
      reason: 'backend_unavailable',
      retryAfter: 17,
    })

    const response = await POST(request() as never)

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('17')
    expect(getUser).not.toHaveBeenCalled()
  })

  it('fails closed when the authenticated-user limiter is unavailable', async () => {
    check
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: false,
        reason: 'backend_unavailable',
        retryAfter: 23,
      })

    const response = await POST(request() as never)

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('23')
    expect(issueOfficialSection).not.toHaveBeenCalled()
  })

  it.each([
    ['tyt_social_section_setup_required', 409, 'TYT_SOCIAL_POLICY_REQUIRED'],
    ['tyt_social_section_conflict', 409, 'TYT_SOCIAL_REQUEST_CONFLICT'],
    ['tyt_social_section_expired', 410, 'TYT_SOCIAL_REQUEST_EXPIRED'],
    ['tyt_social_section_unavailable', 503, 'TYT_SOCIAL_SECTION_UNAVAILABLE'],
    ['tyt_social_section_issue_failed', 500, 'TYT_SOCIAL_SECTION_FAILED'],
  ])('maps %s to %s without returning internal detail', async (reason, status, code) => {
    issueOfficialSection.mockRejectedValue(new Error(reason))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(request() as never)
    const body = await response.json()

    expect(response.status).toBe(status)
    expect(JSON.stringify(body)).not.toContain(reason)
    expect(body).toEqual({ error: expect.any(String), code })
    if (status === 503) expect(response.headers.get('Retry-After')).toBe('60')
  })

  it('fails closed if the projected official section is not exactly 20 questions', async () => {
    toPublicVerifiedQuestions.mockReturnValue(publicQuestions.slice(0, 19))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(request() as never)

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Deneme başlatılamadı',
      code: 'TYT_SOCIAL_SECTION_FAILED',
    })
  })
})
