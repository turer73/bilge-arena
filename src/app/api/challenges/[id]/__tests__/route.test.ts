/**
 * Tests: GET + PATCH /api/challenges/[id]
 * Kapsam: H-150-3 (PATCH rate limit), H-150-4 (maybeSingle hata), auth, UUID.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUser, mockChallengeQuery, mockChallengeUpdate, mockQuestionsQuery, mockRateLimitCheck } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockChallengeQuery: vi.fn(),
  mockChallengeUpdate: vi.fn(async () => ({ error: null })),
  mockQuestionsQuery: vi.fn(),
  mockRateLimitCheck: vi.fn(async () => ({ success: true })),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })) }))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'challenges') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              or: vi.fn(() => ({ maybeSingle: mockChallengeQuery })),
              eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mockChallengeQuery })) })),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(() => mockChallengeUpdate()) })),
        }
      }
      if (table === 'questions') return { select: vi.fn(() => ({ in: mockQuestionsQuery })) }
      return {}
    }),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({ createRateLimiter: vi.fn(() => ({ check: mockRateLimitCheck })) }))

import { GET, PATCH } from '../route'

const VALID_ID = '12345678-1234-1234-1234-123456789012'
const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function makeGetReq(id: string) {
  const h = new Headers(); h.set('x-forwarded-for', '1.2.3.4')
  return new Request(`http://localhost/api/challenges/${id}`, { headers: h })
}
function makePatchReq(id: string, body: unknown) {
  const h = new Headers(); h.set('x-forwarded-for', '1.2.3.4'); h.set('Content-Type', 'application/json')
  return new Request(`http://localhost/api/challenges/${id}`, { method: 'PATCH', headers: h, body: JSON.stringify(body) })
}
const makeParams = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/challenges/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    expect((await GET(makeGetReq(VALID_ID) as never, makeParams(VALID_ID))).status).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    expect((await GET(makeGetReq('bad') as never, makeParams('bad'))).status).toBe(400)
  })

  it('returns 429 on IP rate limit', async () => {
    mockRateLimitCheck.mockResolvedValueOnce({ success: false, retryAfter: 30 } as never)
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await GET(makeGetReq(VALID_ID) as never, makeParams(VALID_ID))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
  })

  it('returns 500 on query error, not 404 (H-150-4)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockChallengeQuery.mockResolvedValue({ data: null, error: { code: '42501' } })
    expect((await GET(makeGetReq(VALID_ID) as never, makeParams(VALID_ID))).status).toBe(500)
  })

  it('returns 404 if not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockChallengeQuery.mockResolvedValue({ data: null, error: null })
    expect((await GET(makeGetReq(VALID_ID) as never, makeParams(VALID_ID))).status).toBe(404)
  })

  it('returns 200 with challenge and questions', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockChallengeQuery.mockResolvedValue({ data: { id: VALID_ID, question_ids: ['q1', 'q2'] }, error: null })
    mockQuestionsQuery.mockResolvedValue({ data: [{ id: 'q1', content: {} }, { id: 'q2', content: {} }], error: null })
    const res = await GET(makeGetReq(VALID_ID) as never, makeParams(VALID_ID))
    expect(res.status).toBe(200)
    expect((await res.json()).questions).toHaveLength(2)
  })
})

describe('PATCH /api/challenges/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    expect((await PATCH(makePatchReq(VALID_ID, { action: 'accept' }) as never, makeParams(VALID_ID))).status).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    expect((await PATCH(makePatchReq('bad', { action: 'accept' }) as never, makeParams('bad'))).status).toBe(400)
  })

  it('returns 429 on IP rate limit (H-150-3)', async () => {
    mockRateLimitCheck.mockResolvedValueOnce({ success: false, retryAfter: 60 } as never)
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PATCH(makePatchReq(VALID_ID, { action: 'accept' }) as never, makeParams(VALID_ID))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
  })

  it('returns 429 on user rate limit (H-150-3)', async () => {
    mockRateLimitCheck.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, retryAfter: 20 } as never)
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    expect((await PATCH(makePatchReq(VALID_ID, { action: 'accept' }) as never, makeParams(VALID_ID))).status).toBe(429)
  })

  it('returns 400 for invalid action', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    expect((await PATCH(makePatchReq(VALID_ID, { action: 'bad' }) as never, makeParams(VALID_ID))).status).toBe(400)
  })

  it('returns 500 on DB error, not silent 404 (H-150-4)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockChallengeQuery.mockResolvedValue({ data: null, error: { code: '08006' } })
    expect((await PATCH(makePatchReq(VALID_ID, { action: 'accept' }) as never, makeParams(VALID_ID))).status).toBe(500)
  })

  it('returns 404 if challenge not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockChallengeQuery.mockResolvedValue({ data: null, error: null })
    expect((await PATCH(makePatchReq(VALID_ID, { action: 'accept' }) as never, makeParams(VALID_ID))).status).toBe(404)
  })

  it('accepts challenge', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockChallengeQuery.mockResolvedValue({ data: { id: VALID_ID, opponent_id: USER_ID, status: 'pending', expires_at: new Date(Date.now() + 86400000).toISOString() }, error: null })
    const res = await PATCH(makePatchReq(VALID_ID, { action: 'accept' }) as never, makeParams(VALID_ID))
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('accepted')
  })

  it('declines challenge', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockChallengeQuery.mockResolvedValue({ data: { id: VALID_ID, opponent_id: USER_ID, status: 'pending', expires_at: new Date(Date.now() + 86400000).toISOString() }, error: null })
    const res = await PATCH(makePatchReq(VALID_ID, { action: 'decline' }) as never, makeParams(VALID_ID))
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('declined')
  })

  it('returns 400 for expired challenge', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockChallengeQuery.mockResolvedValue({ data: { id: VALID_ID, opponent_id: USER_ID, status: 'pending', expires_at: new Date(Date.now() - 1000).toISOString() }, error: null })
    expect((await PATCH(makePatchReq(VALID_ID, { action: 'accept' }) as never, makeParams(VALID_ID))).status).toBe(400)
  })
})