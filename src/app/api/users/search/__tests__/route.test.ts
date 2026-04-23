import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockRpc = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
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
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns empty array if no query', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.users).toEqual([])
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('cagirmak: search_profiles RPC + accent-insensitive parametre', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({
      data: [{ id: 'u2', username: 'ozkan', display_name: 'Özkan', avatar_url: null, total_xp: 100 }],
    })

    // ASCII sorgu ile Turkce karakterli profil bulunmali (unaccent sayesinde)
    const res = await GET(makeRequest('ozkan'))
    expect(res.status).toBe(200)

    expect(mockRpc).toHaveBeenCalledWith('search_profiles', {
      q: 'ozkan',
      exclude_id: 'u1',
      result_limit: 10,
    })

    const json = await res.json()
    expect(json.users).toHaveLength(1)
    expect(json.users[0].display_name).toBe('Özkan')
  })

  it('returns empty when RPC returns null (no matches)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: null })

    const res = await GET(makeRequest('xyz'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.users).toEqual([])
  })

  it('kendini exclude eder (exclude_id = current user id)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-current' } } })
    mockRpc.mockResolvedValue({ data: [] })

    await GET(makeRequest('test'))
    expect(mockRpc).toHaveBeenCalledWith(
      'search_profiles',
      expect.objectContaining({ exclude_id: 'user-current' }),
    )
  })
})
