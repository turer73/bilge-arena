import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks ───────────────────────────────────

const {
  mockGetUser,
  mockRateLimitCheck,
  mockProfileSingle,
  mockRolesLimit,
  mockAnswersReturns,
  mockSessionsLimit,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRateLimitCheck: vi.fn(async () => ({ success: true })),
  mockProfileSingle: vi.fn(),
  mockRolesLimit: vi.fn(),
  mockAnswersReturns: vi.fn(),
  mockSessionsLimit: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

/**
 * Service-role mock — 4 tablo:
 *   profiles  → .select('*').eq().single()
 *   user_roles → .select('role_id').eq().limit()
 *   session_answers → .select(...).eq().returns()
 *   game_sessions → .select(...).eq().eq().order().limit()
 */
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: mockProfileSingle })),
          })),
        }
      }
      if (table === 'user_roles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ limit: mockRolesLimit })),
          })),
        }
      }
      if (table === 'session_answers') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ returns: mockAnswersReturns })),
          })),
        }
      }
      if (table === 'game_sessions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: mockSessionsLimit,
                })),
              })),
            })),
          })),
        }
      }
      return {}
    }),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check: mockRateLimitCheck })),
}))

import { GET } from '../route'

// ─── Helpers ────────────────────────────────────────

function makeGet() {
  const headers = new Headers()
  headers.set('x-forwarded-for', '1.2.3.4')
  return new Request('http://localhost/api/profile/bootstrap', { headers })
}

const PROFILE = {
  id: 'u1', username: 'ali', display_name: null, avatar_url: null,
  total_xp: 100, current_streak: 3, created_at: '2026-01-01',
}

// ─── Tests ──────────────────────────────────────────

describe('GET /api/profile/bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Defaults: auth OK, rate limit OK, empty data
    mockRateLimitCheck.mockResolvedValue({ success: true })
    mockProfileSingle.mockResolvedValue({ data: PROFILE, error: null })
    mockRolesLimit.mockResolvedValue({ data: [], error: null })
    mockAnswersReturns.mockResolvedValue({ data: [], error: null })
    mockSessionsLimit.mockResolvedValue({ data: [], error: null })
  })

  it('returns 429 on IP rate limit', async () => {
    mockRateLimitCheck.mockResolvedValueOnce({ success: false, retryAfter: 30 } as never)
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGet() as never)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGet() as never)
    expect(res.status).toBe(401)
  })

  it('returns 429 on user rate limit', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRateLimitCheck
      .mockResolvedValueOnce({ success: true })  // IP passes
      .mockResolvedValueOnce({ success: false, retryAfter: 45 } as never) // user fails
    const res = await GET(makeGet() as never)
    expect(res.status).toBe(429)
  })

  it('returns 404 if profile not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSingle.mockResolvedValue({ data: null, error: null })
    const res = await GET(makeGet() as never)
    expect(res.status).toBe(404)
  })

  it('returns 500 on answers query error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockAnswersReturns.mockResolvedValue({ data: null, error: { code: '42501' } })
    const res = await GET(makeGet() as never)
    expect(res.status).toBe(500)
  })

  it('returns combined profile + empty stats for new user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    const res = await GET(makeGet() as never)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.profile).toMatchObject({ id: 'u1', username: 'ali' })
    expect(body.isAdmin).toBe(false)
    expect(body.gameStats).toEqual([])
    expect(body.recentGames).toEqual([])
  })

  it('sets isAdmin true when user_roles returns a row', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRolesLimit.mockResolvedValue({ data: [{ role_id: 'admin' }], error: null })

    const res = await GET(makeGet() as never)
    const body = await res.json()
    expect(body.isAdmin).toBe(true)
  })

  it('aggregates game stats from session_answers', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockAnswersReturns.mockResolvedValue({
      data: [
        { is_correct: true,  questions: { game: 'tyt', category: 'matematik' } },
        { is_correct: true,  questions: { game: 'tyt', category: 'matematik' } },
        { is_correct: false, questions: { game: 'tyt', category: 'matematik' } },
        { is_correct: true,  questions: { game: 'tyt', category: 'turkce' } },
      ],
      error: null,
    })

    const res = await GET(makeGet() as never)
    const body = await res.json()
    expect(body.gameStats).toHaveLength(1)
    const tyt = body.gameStats[0]
    expect(tyt.game).toBe('tyt')
    expect(tyt.total).toBe(4)
    expect(tyt.correct).toBe(3)
    expect(tyt.percentage).toBe(75)
    expect(tyt.categories).toHaveLength(2)
  })

  it('returns recent games from game_sessions', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSessionsLimit.mockResolvedValue({
      data: [
        { id: 's1', game: 'tyt', mode: 'classic', correct_count: 8,
          total_questions: 10, total_xp: 50, completed_at: '2026-05-01' },
      ],
      error: null,
    })

    const res = await GET(makeGet() as never)
    const body = await res.json()
    expect(body.recentGames).toHaveLength(1)
    expect(body.recentGames[0].id).toBe('s1')
    expect(body.recentGames[0].correct_count).toBe(8)
  })

  it('sets Cache-Control: no-store header', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await GET(makeGet() as never)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
