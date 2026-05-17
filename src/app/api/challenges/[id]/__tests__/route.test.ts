import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Mocks ──────────────────────────────────────────

const { mockGetUser, mockChallengeSingle, mockUpdateEq, mockGetChallengeMaybeSingle, mockGetQuestionsIn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockChallengeSingle: vi.fn(),
  mockUpdateEq: vi.fn(),
  mockGetChallengeMaybeSingle: vi.fn(),
  mockGetQuestionsIn: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: vi.fn((table: string) => {
      if (table === 'challenges') {
        return {
          select: vi.fn(() => ({
            // PATCH path: .select().eq().eq().eq().single()
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: mockChallengeSingle,
                })),
              })),
              // GET path: .select().eq().or().maybeSingle()
              or: vi.fn(() => ({
                maybeSingle: mockGetChallengeMaybeSingle,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: mockUpdateEq,
          })),
        }
      }
      if (table === 'questions') {
        return {
          select: vi.fn(() => ({
            in: mockGetQuestionsIn,
          })),
        }
      }
      return {}
    }),
  }),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({
    check: vi.fn(async () => ({ success: true })),
  })),
}))

import { GET, PATCH } from '../route'

// ─── Helpers ────────────────────────────────────────

const CHALLENGE_ID = '20000000-0000-4000-8000-000000000001'

function makePatchReq(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/challenges/${CHALLENGE_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  })
}

function makeGetReq() {
  const headers = new Headers()
  headers.set('x-forwarded-for', '1.2.3.4')
  return new Request(`http://localhost/api/challenges/${CHALLENGE_ID}`, { headers })
}

const paramsPromise = Promise.resolve({ id: CHALLENGE_ID })

// ─── PATCH Tests ────────────────────────────────────

describe('PATCH /api/challenges/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateEq.mockResolvedValue({ error: null })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makePatchReq({ action: 'accept' }), { params: paramsPromise })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid action', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } })
    const res = await PATCH(makePatchReq({ action: 'invalid' }), { params: paramsPromise })
    expect(res.status).toBe(400)
  })

  it('returns 404 if challenge not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } })
    mockChallengeSingle.mockResolvedValue({ data: null, error: null })
    const res = await PATCH(makePatchReq({ action: 'accept' }), { params: paramsPromise })
    expect(res.status).toBe(404)
  })

  it('returns 400 if challenge expired', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } })
    mockChallengeSingle.mockResolvedValue({
      data: { id: CHALLENGE_ID, status: 'pending', opponent_id: 'u2', expires_at: '2020-01-01T00:00:00Z' },
      error: null,
    })
    const res = await PATCH(makePatchReq({ action: 'accept' }), { params: paramsPromise })
    expect(res.status).toBe(400)
  })

  it('accepts challenge successfully', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } })
    mockChallengeSingle.mockResolvedValue({
      data: { id: CHALLENGE_ID, status: 'pending', opponent_id: 'u2', expires_at: '2099-01-01T00:00:00Z' },
      error: null,
    })
    const res = await PATCH(makePatchReq({ action: 'accept' }), { params: paramsPromise })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('accepted')
  })

  it('declines challenge successfully', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } })
    mockChallengeSingle.mockResolvedValue({
      data: { id: CHALLENGE_ID, status: 'pending', opponent_id: 'u2', expires_at: '2099-01-01T00:00:00Z' },
      error: null,
    })
    const res = await PATCH(makePatchReq({ action: 'decline' }), { params: paramsPromise })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('declined')
  })
})

// ─── GET Tests ──────────────────────────────────────

describe('GET /api/challenges/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetReq() as never, { params: paramsPromise })
    expect(res.status).toBe(401)
  })

  it('returns 400 if id invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await GET(makeGetReq() as never, { params: Promise.resolve({ id: 'not-uuid' }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 if challenge not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetChallengeMaybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await GET(makeGetReq() as never, { params: paramsPromise })
    expect(res.status).toBe(404)
  })

  it('returns challenge + questions on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetChallengeMaybeSingle.mockResolvedValue({
      data: {
        id: CHALLENGE_ID,
        challenger_id: 'u1',
        opponent_id: 'u2',
        question_ids: ['q1', 'q2'],
      },
      error: null,
    })
    mockGetQuestionsIn.mockResolvedValue({
      data: [
        { id: 'q1', content: { options: ['A', 'B'] } },
        { id: 'q2', content: { options: ['C', 'D'] } },
      ],
      error: null,
    })

    const res = await GET(makeGetReq() as never, { params: paramsPromise })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.challenge.id).toBe(CHALLENGE_ID)
    expect(body.questions).toHaveLength(2)
    expect(body.questions[0].id).toBe('q1')
  })

  it('preserves question_ids order', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetChallengeMaybeSingle.mockResolvedValue({
      data: {
        id: CHALLENGE_ID,
        challenger_id: 'u1',
        opponent_id: 'u2',
        question_ids: ['q2', 'q1'], // Reverse order
      },
      error: null,
    })
    mockGetQuestionsIn.mockResolvedValue({
      data: [
        { id: 'q1', content: {} },
        { id: 'q2', content: {} },
      ],
      error: null,
    })

    const res = await GET(makeGetReq() as never, { params: paramsPromise })
    const body = await res.json()
    expect(body.questions[0].id).toBe('q2')
    expect(body.questions[1].id).toBe('q1')
  })

  it('returns empty questions array when question_ids empty', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetChallengeMaybeSingle.mockResolvedValue({
      data: { id: CHALLENGE_ID, question_ids: [] },
      error: null,
    })

    const res = await GET(makeGetReq() as never, { params: paramsPromise })
    const body = await res.json()
    expect(body.questions).toEqual([])
  })

  it('returns 500 on challenge query error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetChallengeMaybeSingle.mockResolvedValue({ data: null, error: { code: '42501' } })
    const res = await GET(makeGetReq() as never, { params: paramsPromise })
    expect(res.status).toBe(500)
  })

  it('sets Cache-Control no-store', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetChallengeMaybeSingle.mockResolvedValue({
      data: { id: CHALLENGE_ID, question_ids: [] },
      error: null,
    })
    const res = await GET(makeGetReq() as never, { params: paramsPromise })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
