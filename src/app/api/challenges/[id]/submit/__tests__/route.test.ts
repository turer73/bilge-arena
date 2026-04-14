import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Mocks ──────────────────────────────────────────

const mockGetUser = vi.fn()
const mockChallengeSingle = vi.fn()
const mockQuestionsIn = vi.fn()
const mockChallengeUpdate = vi.fn()

// Chainable mock builder — terminal overrides end the chain
function chain(terminal?: Record<string, ReturnType<typeof vi.fn>>) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {}
  const self = () => c
  for (const m of ['select', 'insert', 'update', 'eq', 'in', 'single', 'or', 'from']) {
    c[m] = terminal?.[m] ?? vi.fn(self)
  }
  return c
}

const mockSvcFrom = vi.fn((table: string) => {
  if (table === 'challenges') {
    // SELECT path: .select().eq().or().single()
    // UPDATE path: .update().eq()
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          or: vi.fn(() => ({
            single: mockChallengeSingle,
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: mockChallengeUpdate,
      })),
    }
  }
  if (table === 'questions') {
    return chain({ in: mockQuestionsIn })
  }
  if (table === 'xp_log') {
    return chain({ insert: vi.fn(() => ({ then: vi.fn() })) })
  }
  return chain()
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: mockSvcFrom,
    rpc: vi.fn().mockResolvedValue({ error: null }),
  }),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({
    check: vi.fn().mockResolvedValue({ success: true }),
  }),
}))

import { POST } from '../route'

// ─── Helpers ────────────────────────────────────────

const Q1 = '10000000-0000-4000-8000-000000000001'
const Q2 = '10000000-0000-4000-8000-000000000002'
const CHALLENGE_ID = '20000000-0000-4000-8000-000000000001'
const USER_ID = 'user-1'
const OPPONENT_ID = 'user-2'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/challenges/${CHALLENGE_ID}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validAnswers = [
  { questionId: Q1, selectedOption: 1, isCorrect: true, timeTaken: 5 },
  { questionId: Q2, selectedOption: 0, isCorrect: false, timeTaken: 10 },
]

const paramsPromise = Promise.resolve({ id: CHALLENGE_ID })

// ─── Tests ──────────────────────────────────────────

describe('POST /api/challenges/[id]/submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuestionsIn.mockResolvedValue({
      data: [
        { id: Q1, content: { answer: 1 }, difficulty: 2 },
        { id: Q2, content: { answer: 2 }, difficulty: 2 },
      ],
      error: null,
    })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ answers: validAnswers }), { params: paramsPromise })
    expect(res.status).toBe(401)
  })

  it('returns 400 if answers array is empty', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makeRequest({ answers: [] }), { params: paramsPromise })
    expect(res.status).toBe(400)
  })

  it('returns 400 if answers is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makeRequest({}), { params: paramsPromise })
    expect(res.status).toBe(400)
  })

  it('returns 404 if challenge not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockChallengeSingle.mockResolvedValue({ data: null, error: null })

    const res = await POST(makeRequest({ answers: validAnswers }), { params: paramsPromise })
    expect(res.status).toBe(404)
  })

  it('returns 400 if challenge already completed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockChallengeSingle.mockResolvedValue({
      data: { id: CHALLENGE_ID, status: 'completed', challenger_id: USER_ID, opponent_id: OPPONENT_ID },
      error: null,
    })

    const res = await POST(makeRequest({ answers: validAnswers }), { params: paramsPromise })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('tamamlanmis')
  })

  it('returns 400 if user already submitted', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockChallengeSingle.mockResolvedValue({
      data: {
        id: CHALLENGE_ID,
        status: 'accepted',
        challenger_id: USER_ID,
        opponent_id: OPPONENT_ID,
        challenger_score: { correct: 2, total: 2, time_sec: 10 },
        opponent_score: null,
      },
      error: null,
    })

    const res = await POST(makeRequest({ answers: validAnswers }), { params: paramsPromise })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('gonderilmis')
  })

  it('calculates score and returns waiting_opponent if opponent hasnt submitted', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockChallengeSingle.mockResolvedValue({
      data: {
        id: CHALLENGE_ID,
        status: 'accepted',
        challenger_id: USER_ID,
        opponent_id: OPPONENT_ID,
        challenger_score: null,
        opponent_score: null,
      },
      error: null,
    })
    mockChallengeUpdate.mockResolvedValue({ error: null })

    const res = await POST(makeRequest({ answers: validAnswers }), { params: paramsPromise })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.result).toBe('waiting_opponent')
    expect(json.score.correct).toBe(1) // Q1 correct, Q2 wrong
    expect(json.score.total).toBe(2)
  })
})
