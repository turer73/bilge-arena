import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockListResult = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        or: vi.fn(() => ({
          neq: vi.fn(() => ({
            limit: mockListResult,
          })),
        })),
      })),
    })),
  })),
}))

import { GET } from '../route'

function makeRequest(q?: string) {
  const url = q ? `http://localhost/api/users/search?q=${encodeURIComponent(q)}` : 'http://localhost/api/users/search'
  return new Request(url)
}

describe('GET /api/users/search', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest('abc'))
    expect(res.status).toBe(401)
  })

  it('returns empty array if query too short', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await GET(makeRequest('a'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.users).toEqual([])
  })

  it('returns empty array if no query', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.users).toEqual([])
  })

  it('returns user list matching query', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockListResult.mockResolvedValue({
      data: [{ id: 'u2', username: 'alice', display_name: 'Alice', avatar_url: null, total_xp: 100 }],
    })

    const res = await GET(makeRequest('ali'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.users).toHaveLength(1)
    expect(json.users[0].username).toBe('alice')
  })

  it('returns empty when data is null (no matches)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockListResult.mockResolvedValue({ data: null })

    const res = await GET(makeRequest('xyz'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.users).toEqual([])
  })
})
