import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────

const mockGetUser = vi.fn()
const mockChallengesList = vi.fn()
const mockFriendshipLimit = vi.fn()
const mockQuestionsLimit = vi.fn()
const mockInsertSingle = vi.fn()

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
          // GET path: .select().or().order().limit()
          select: vi.fn(() => ({
            or: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: mockChallengesList,
              })),
            })),
          })),
          // POST path: .insert().select().single()
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: mockInsertSingle,
            })),
          })),
        }
      }
      if (table === 'friendships') {
        return {
          select: vi.fn(() => ({
            or: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: mockFriendshipLimit,
              })),
            })),
          })),
        }
      }
      if (table === 'questions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  limit: mockQuestionsLimit,
                })),
                limit: mockQuestionsLimit,
              })),
            })),
          })),
        }
      }
      return {}
    }),
  }),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({
    check: vi.fn().mockResolvedValue({ success: true }),
  }),
}))

import { GET, POST } from '../route'

// ─── Constants ─────────────────────────────────────

const U1 = '10000000-0000-4000-8000-000000000001'
const U2 = '10000000-0000-4000-8000-000000000002'

// ─── Helpers ────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/challenges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ─── Tests ──────────────────────────────────────────

describe('GET /api/challenges', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns challenges list', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    mockChallengesList.mockResolvedValue({ data: [{ id: 'c1' }], error: null })

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.challenges).toHaveLength(1)
  })

  it('returns 500 on db error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    mockChallengesList.mockResolvedValue({ data: null, error: { message: 'DB down' } })

    const res = await GET()
    expect(res.status).toBe(500)
  })
})

describe('POST /api/challenges', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ opponentId: U2, game: 'matematik' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 if opponentId missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    const res = await POST(makeRequest({ game: 'matematik' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if game missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    const res = await POST(makeRequest({ opponentId: U2 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid game slug', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    const res = await POST(makeRequest({ opponentId: U2, game: 'invalid-game' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Gecersiz')
  })

  it('returns 400 if challenging self', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    const res = await POST(makeRequest({ opponentId: U1, game: 'matematik' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Kendi')
  })

  it('returns 400 if not friends', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    mockFriendshipLimit.mockResolvedValue({ data: [] })

    const res = await POST(makeRequest({ opponentId: U2, game: 'matematik' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('arkadas')
  })

  it('returns 400 if not enough questions', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    mockFriendshipLimit.mockResolvedValue({ data: [{ id: 'f1' }] })
    mockQuestionsLimit.mockResolvedValue({ data: [{ id: 'q1' }, { id: 'q2' }] }) // < 5

    const res = await POST(makeRequest({ opponentId: U2, game: 'matematik' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('soru')
  })

  it('creates challenge successfully', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    mockFriendshipLimit.mockResolvedValue({ data: [{ id: 'f1' }] })
    mockQuestionsLimit.mockResolvedValue({
      data: Array.from({ length: 10 }, (_, i) => ({ id: `q${i}` })),
    })
    mockInsertSingle.mockResolvedValue({ data: { id: 'c1' }, error: null })

    const res = await POST(makeRequest({ opponentId: U2, game: 'matematik' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.challengeId).toBe('c1')
  })
})
