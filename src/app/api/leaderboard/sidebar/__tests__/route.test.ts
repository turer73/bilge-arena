import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockWeeklyRes,
  mockWeeklySingleRes,
  mockProfilesRes,
  mockGetUser,
  mockIpCheck,
  mockUserCheck,
} = vi.hoisted(() => ({
  mockWeeklyRes: vi.fn(),
  mockWeeklySingleRes: vi.fn(),
  mockProfilesRes: vi.fn(),
  mockGetUser: vi.fn(async () => ({
    data: { user: null as null | { id: string; email?: string } },
  })),
  mockIpCheck: vi.fn(async () => ({ success: true, retryAfter: 0 })),
  mockUserCheck: vi.fn(async () => ({ success: true, retryAfter: 0 })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'leaderboard_weekly_ranked') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => mockWeeklyRes()),
            })),
            eq: vi.fn(() => ({
              single: vi.fn(() => mockWeeklySingleRes()),
            })),
          })),
        }
      }
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => mockProfilesRes()),
            })),
          })),
        }
      }
      return {}
    }),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  // Iki farkli limiter (IP + user); module ad'ina gore farkli check mock
  createRateLimiter: vi.fn((name: string) => ({
    check: name === 'leaderboard-sidebar-user' ? mockUserCheck : mockIpCheck,
  })),
}))

import { GET } from '../route'

function makeRequest(currentUserId?: string, ip = '1.2.3.4') {
  const headers = new Headers()
  headers.set('x-forwarded-for', ip)
  const url = currentUserId
    ? `http://localhost/api/leaderboard/sidebar?currentUserId=${currentUserId}`
    : 'http://localhost/api/leaderboard/sidebar'
  return new Request(url, { headers })
}

const VALID_UUID = '11111111-2222-3333-4444-555555555555'

describe('GET /api/leaderboard/sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: anon user; her test override edebilir
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockIpCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockUserCheck.mockResolvedValue({ success: true, retryAfter: 0 })
  })

  it('returns weekly source when view has data', async () => {
    mockWeeklyRes.mockResolvedValueOnce({
      data: [
        { user_id: 'u1', username: 'Ali', display_name: null, avatar_url: null, xp_earned: 500, current_rank: 1 },
        { user_id: 'u2', username: 'Veli', display_name: null, avatar_url: '/v.png', xp_earned: 300, current_rank: 2 },
      ],
      error: null,
    })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe('weekly')
    expect(body.players).toHaveLength(2)
    expect(body.players[0]).toMatchObject({ rank: 1, name: 'Ali', xp_earned: 500, is_me: false })
    expect(body.myRank).toBe(0)
  })

  it('marks is_me=true when currentUserId matches', async () => {
    mockWeeklyRes.mockResolvedValueOnce({
      data: [
        { user_id: 'u1', username: 'Ali', display_name: null, avatar_url: null, xp_earned: 500, current_rank: 1 },
        { user_id: VALID_UUID, username: 'Me', display_name: null, avatar_url: null, xp_earned: 300, current_rank: 2 },
      ],
      error: null,
    })
    const res = await GET(makeRequest(VALID_UUID) as never)
    const body = await res.json()
    expect(body.players[1].is_me).toBe(true)
    expect(body.myRank).toBe(2)
  })

  it('queries my rank separately when not in top 5', async () => {
    mockWeeklyRes.mockResolvedValueOnce({
      data: [
        { user_id: 'u1', username: 'A', display_name: null, avatar_url: null, xp_earned: 500, current_rank: 1 },
      ],
      error: null,
    })
    mockWeeklySingleRes.mockResolvedValueOnce({ data: { current_rank: 42 }, error: null })
    const res = await GET(makeRequest(VALID_UUID) as never)
    const body = await res.json()
    expect(body.myRank).toBe(42)
  })

  it('falls back to profiles when weekly view empty', async () => {
    mockWeeklyRes.mockResolvedValueOnce({ data: [], error: null })
    mockProfilesRes.mockResolvedValueOnce({
      data: [
        { id: 'u1', username: 'Ali', display_name: null, avatar_url: null, total_xp: 1000 },
      ],
      error: null,
    })
    const res = await GET(makeRequest() as never)
    const body = await res.json()
    expect(body.source).toBe('profiles_fallback')
    expect(body.players[0].name).toBe('Ali')
  })

  it('returns empty when both view and profiles empty', async () => {
    mockWeeklyRes.mockResolvedValueOnce({ data: [], error: null })
    mockProfilesRes.mockResolvedValueOnce({ data: [], error: null })
    const res = await GET(makeRequest() as never)
    const body = await res.json()
    expect(body.source).toBe('empty')
    expect(body.players).toEqual([])
  })

  it('rejects invalid currentUserId (not UUID format)', async () => {
    mockWeeklyRes.mockResolvedValueOnce({
      data: [
        { user_id: 'attacker', username: 'X', display_name: null, avatar_url: null, xp_earned: 100, current_rank: 1 },
      ],
      error: null,
    })
    // Invalid uuid format -> safeUserId = null, is_me always false
    const res = await GET(makeRequest('not-a-uuid') as never)
    const body = await res.json()
    expect(body.players[0].is_me).toBe(false)
  })

  it('returns 500 on weekly view query error', async () => {
    mockWeeklyRes.mockResolvedValueOnce({ data: null, error: { message: 'db down' } })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(500)
  })

  it('sets public cache when no currentUserId (anon leaderboard)', async () => {
    mockWeeklyRes.mockResolvedValueOnce({
      data: [
        { user_id: 'u1', username: 'A', display_name: null, avatar_url: null, xp_earned: 1, current_rank: 1 },
      ],
      error: null,
    })
    const res = await GET(makeRequest() as never)
    const cc = res.headers.get('Cache-Control') ?? ''
    expect(cc).toContain('public')
    expect(cc).toContain('s-maxage=60')
  })

  it('sets private cache when currentUserId provided (user-specific payload)', async () => {
    mockWeeklyRes.mockResolvedValueOnce({
      data: [
        { user_id: 'u1', username: 'A', display_name: null, avatar_url: null, xp_earned: 1, current_rank: 1 },
      ],
      error: null,
    })
    // currentUserId top 5'te degil -> ayri myRank sorgusu calisir
    mockWeeklySingleRes.mockResolvedValueOnce({ data: { current_rank: 99 }, error: null })
    const res = await GET(makeRequest(VALID_UUID) as never)
    const cc = res.headers.get('Cache-Control') ?? ''
    expect(cc).toContain('private')
    expect(cc).toContain('max-age=60')
    expect(cc).not.toContain('public')
  })

  it('does NOT include user_id in response (data minimization)', async () => {
    mockWeeklyRes.mockResolvedValueOnce({
      data: [
        { user_id: 'leaked-uuid', username: 'A', display_name: null, avatar_url: null, xp_earned: 1, current_rank: 1 },
      ],
      error: null,
    })
    const res = await GET(makeRequest() as never)
    const body = await res.json()
    expect(body.players[0]).not.toHaveProperty('user_id')
    expect(JSON.stringify(body)).not.toContain('leaked-uuid')
  })

  it('rejects non-canonical UUID format (e.g. all dashes)', async () => {
    mockWeeklyRes.mockResolvedValueOnce({
      data: [
        { user_id: 'u1', username: 'X', display_name: null, avatar_url: null, xp_earned: 1, current_rank: 1 },
      ],
      error: null,
    })
    // 36 chars ama kanonik 8-4-4-4-12 degil — gecersiz
    const res = await GET(makeRequest('------------------------------------') as never)
    const body = await res.json()
    expect(body.players[0].is_me).toBe(false)
  })
})

describe('GET /api/leaderboard/sidebar rate limit (Codex PR #75 + #78 P1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockIpCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockUserCheck.mockResolvedValue({ success: true, retryAfter: 0 })
  })

  it('IP limit ONCE — anon flood erken kes, auth.getUser cagrilmaz (PR #78 P1)', async () => {
    mockIpCheck.mockResolvedValueOnce({ success: false, retryAfter: 30 })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
    // KRITIK: IP rejection'da auth.getUser CAGRILMAMALI — Supabase Auth quota tasarruf
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(mockUserCheck).not.toHaveBeenCalled()
  })

  it('anon: IP gecince auth.getUser cagrilir, user limit skip (anon)', async () => {
    mockWeeklyRes.mockResolvedValueOnce({
      data: [
        { user_id: 'u1', username: 'A', display_name: null, avatar_url: null, xp_earned: 1, current_rank: 1 },
      ],
      error: null,
    })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(200)
    expect(mockIpCheck).toHaveBeenCalled()
    expect(mockGetUser).toHaveBeenCalled()
    expect(mockUserCheck).not.toHaveBeenCalled()  // anon -> user limit skip
  })

  it('auth user: IP + user-id cift kalkan, ikisi de cagrilir', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_UUID, email: 'a@b.com' } },
    })
    mockWeeklyRes.mockResolvedValueOnce({
      data: [
        { user_id: 'u1', username: 'A', display_name: null, avatar_url: null, xp_earned: 1, current_rank: 1 },
      ],
      error: null,
    })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(200)
    expect(mockIpCheck).toHaveBeenCalled()
    expect(mockUserCheck).toHaveBeenCalledWith(VALID_UUID)
  })

  it('auth user: user-id limit reject -> 429 (IP geçti ama user limit doldu)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_UUID } },
    })
    mockUserCheck.mockResolvedValueOnce({ success: false, retryAfter: 15 })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('15')
  })

  it('SECURITY: anon flood IP limit durur, auth API tetiklenmez (PR #78 P1)', async () => {
    // 100 anon flood request - hepsi IP limit'te 429
    mockIpCheck.mockResolvedValue({ success: false, retryAfter: 60 })
    for (let i = 0; i < 5; i++) {
      const res = await GET(makeRequest() as never)
      expect(res.status).toBe(429)
    }
    // KRITIK: 5 anon hit'te auth.getUser SIFIR cagri
    expect(mockGetUser).toHaveBeenCalledTimes(0)
  })
})
