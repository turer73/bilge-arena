import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUser, mockRpc, mockSelectChain } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
  mockSelectChain: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    rpc: mockRpc,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            gte: vi.fn(() => Promise.resolve({ data: [], error: null })),
            in: vi.fn(() => ({
              gte: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
          in: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: mockSelectChain,
            })),
          })),
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
  const url = new URL('http://localhost/api/questions/random')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers = new Headers()
  headers.set('x-forwarded-for', '1.2.3.4')
  return new Request(url.toString(), { headers })
}

describe('GET /api/questions/random', () => {
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

  it('returns 400 if game param invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await GET(makeRequest({ game: 'invalid-game' }) as never)
    expect(res.status).toBe(400)
  })

  it('calls select_random_questions RPC with correct args', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })

    await GET(makeRequest({ game: 'matematik', limit: '10', category: 'cebir', difficulty: '3', examRef: 'TYT' }) as never)

    expect(mockRpc).toHaveBeenCalledWith('select_random_questions', expect.objectContaining({
      p_game: 'matematik',
      p_limit: 20, // limit*2 cap 50
      p_category: 'cebir',
      p_difficulty: 3,
      p_exam_ref: 'TYT',
    }))
  })

  it('returns questions list on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const fakeQuestions = [
      { id: 'q1', game: 'matematik' },
      { id: 'q2', game: 'matematik' },
    ]
    mockRpc.mockResolvedValue({ data: fakeQuestions, error: null })

    const res = await GET(makeRequest({ game: 'matematik', limit: '10' }) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.questions).toEqual(fakeQuestions)
  })

  it('returns 500 on RPC error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501' } })
    const res = await GET(makeRequest({ game: 'matematik' }) as never)
    expect(res.status).toBe(500)
  })

  it('caps limit at 100', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })
    await GET(makeRequest({ game: 'matematik', limit: '500' }) as never)
    // limit clamped to 100 -> fetchLimit = min(100*2, 50) = 50
    expect(mockRpc).toHaveBeenCalledWith('select_random_questions', expect.objectContaining({
      p_limit: 50,
    }))
  })

  it('filters excludeIds to valid UUIDs only', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })
    const validId = '12345678-1234-1234-1234-123456789012'
    await GET(makeRequest({
      game: 'matematik',
      excludeIds: `${validId},invalid-id,not-a-uuid`,
    }) as never)
    expect(mockRpc).toHaveBeenCalledWith('select_random_questions', expect.objectContaining({
      p_exclude_ids: [validId],
    }))
  })

  it('sets Cache-Control no-store', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })
    const res = await GET(makeRequest({ game: 'matematik' }) as never)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('does not include reviewQuestions when includeReview=false', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [{ id: 'q1' }], error: null })
    const res = await GET(makeRequest({ game: 'matematik' }) as never)
    const body = await res.json()
    expect(body.reviewQuestions).toEqual([])
  })
})
