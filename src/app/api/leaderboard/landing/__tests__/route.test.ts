import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockProfilesRes } = vi.hoisted(() => ({
  mockProfilesRes: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          gt: vi.fn(() => ({
            is: vi.fn(() => ({
              limit: vi.fn(() => mockProfilesRes()),
            })),
          })),
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({
    check: vi.fn(async () => ({ success: true, retryAfter: 0 })),
  })),
}))

import { GET } from '../route'

function makeRequest(ip = '1.2.3.4') {
  const headers = new Headers()
  headers.set('x-forwarded-for', ip)
  return new Request('http://localhost/api/leaderboard/landing', { headers })
}

describe('GET /api/leaderboard/landing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns top 5 leaders with rank assigned', async () => {
    mockProfilesRes.mockResolvedValueOnce({
      data: [
        { username: 'Ali', display_name: null, total_xp: 5000, current_streak: 7 },
        { username: 'Veli', display_name: null, total_xp: 4500, current_streak: 5 },
        { username: null, display_name: 'Ayşe', total_xp: 3000, current_streak: 3 },
      ],
      error: null,
    })

    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.leaders).toHaveLength(3)
    expect(body.leaders[0]).toMatchObject({ rank: 1, username: 'Ali', total_xp: 5000, current_streak: 7 })
    expect(body.leaders[2]).toMatchObject({ rank: 3, username: 'Ayşe', total_xp: 3000 })
  })

  it('returns empty array when no profiles', async () => {
    mockProfilesRes.mockResolvedValueOnce({ data: [], error: null })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.leaders).toEqual([])
  })

  it('returns 500 on query error', async () => {
    mockProfilesRes.mockResolvedValueOnce({ data: null, error: { message: 'db down' } })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(500)
  })

  it('uses fallback name when both username + display_name null', async () => {
    mockProfilesRes.mockResolvedValueOnce({
      data: [{ username: null, display_name: null, total_xp: 100, current_streak: 0 }],
      error: null,
    })
    const res = await GET(makeRequest() as never)
    const body = await res.json()
    expect(body.leaders[0].username).toBe('Oyuncu 1')
  })

  it('sets Cache-Control with s-maxage=300', async () => {
    mockProfilesRes.mockResolvedValueOnce({ data: [], error: null })
    const res = await GET(makeRequest() as never)
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=300')
  })
})

describe('GET /api/leaderboard/landing rate limit', () => {
  it('returns 429 when limiter rejects', async () => {
    vi.resetModules()
    vi.doMock('@/lib/utils/rate-limit', () => ({
      createRateLimiter: vi.fn(() => ({
        check: vi.fn(async () => ({ success: false, retryAfter: 30 })),
      })),
    }))
    vi.doMock('@/lib/supabase/service-role', () => ({
      createServiceRoleClient: vi.fn(),
    }))

    const { GET: GET2 } = await import('../route')
    const res = await GET2(makeRequest() as never)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
  })
})
