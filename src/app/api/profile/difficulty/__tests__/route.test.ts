import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUser, mockChain, mockChainWithCategory } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockChain: vi.fn(),
  mockChainWithCategory: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => {
            // 2nd eq returns query that can be awaited OR chained with .eq for category
            const result = { eq: mockChainWithCategory }
            // Allow direct await on this object too — return a thenable
            return Object.assign(
              Promise.resolve(mockChain()),
              result,
            )
          }),
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({
    check: vi.fn(async () => ({ success: true })),
  })),
}))

import { GET } from '../route'

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/profile/difficulty')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers = new Headers()
  headers.set('x-forwarded-for', '1.2.3.4')
  return new Request(url.toString(), { headers })
}

describe('GET /api/profile/difficulty', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest({ game: 'matematik' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 if game param missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 if game invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await GET(makeRequest({ game: 'invalid' }) as never)
    expect(res.status).toBe(400)
  })

  it('returns null when no data', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockChain.mockReturnValue({ data: [], error: null })
    const res = await GET(makeRequest({ game: 'matematik' }) as never)
    const body = await res.json()
    expect(body.difficulty).toBeNull()
  })

  it('returns null when totalSeen < 10', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockChain.mockReturnValue({
      data: [{ questions_seen: 5, correct: 3 }, { questions_seen: 3, correct: 2 }],
      error: null,
    })
    const res = await GET(makeRequest({ game: 'matematik' }) as never)
    const body = await res.json()
    expect(body.difficulty).toBeNull()
  })

  it('returns 1 for accuracy < 30%', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockChain.mockReturnValue({
      data: [{ questions_seen: 20, correct: 4 }], // 20%
      error: null,
    })
    const res = await GET(makeRequest({ game: 'matematik' }) as never)
    const body = await res.json()
    expect(body.difficulty).toBe(1)
  })

  it('returns 3 for accuracy 50-70%', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockChain.mockReturnValue({
      data: [{ questions_seen: 20, correct: 12 }], // 60%
      error: null,
    })
    const res = await GET(makeRequest({ game: 'matematik' }) as never)
    const body = await res.json()
    expect(body.difficulty).toBe(3)
  })

  it('returns 5 for accuracy >= 85%', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockChain.mockReturnValue({
      data: [{ questions_seen: 20, correct: 18 }], // 90%
      error: null,
    })
    const res = await GET(makeRequest({ game: 'matematik' }) as never)
    const body = await res.json()
    expect(body.difficulty).toBe(5)
  })

  it('returns 500 on query error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockChain.mockReturnValue({ data: null, error: { code: '42501' } })
    const res = await GET(makeRequest({ game: 'matematik' }) as never)
    expect(res.status).toBe(500)
  })

  it('sets Cache-Control no-store', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockChain.mockReturnValue({ data: [], error: null })
    const res = await GET(makeRequest({ game: 'matematik' }) as never)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
