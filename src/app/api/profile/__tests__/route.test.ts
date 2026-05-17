import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUser, mockProfileSelect, mockRolesSelect, mockProfileUpdate } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockProfileSelect: vi.fn(),
  mockRolesSelect: vi.fn(),
  mockProfileUpdate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          // GET: .select('*').eq('id', x).single()
          select: vi.fn((cols: string) => ({
            eq: vi.fn(() => ({ single: mockProfileSelect })),
          })),
          // PATCH: .update(x).eq('id', y).select(...).single()
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({ single: mockProfileUpdate })),
            })),
          })),
        }
      }
      if (table === 'user_roles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ limit: mockRolesSelect })),
          })),
        }
      }
      return {}
    }),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({
    check: vi.fn(async () => ({ success: true })),
  })),
}))

import { GET, PATCH } from '../route'

function makeGet() {
  const headers = new Headers()
  headers.set('x-forwarded-for', '1.2.3.4')
  return new Request('http://localhost/api/profile', { headers })
}

function makePatch(body: Record<string, unknown>) {
  const headers = new Headers()
  headers.set('x-forwarded-for', '1.2.3.4')
  headers.set('Content-Type', 'application/json')
  return new Request('http://localhost/api/profile', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
}

describe('GET /api/profile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGet() as never)
    expect(res.status).toBe(401)
  })

  it('returns profile + isAdmin=false when no roles', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSelect.mockResolvedValue({
      data: { id: 'u1', username: 'ali', total_xp: 100 },
      error: null,
    })
    mockRolesSelect.mockResolvedValue({ data: [], error: null })

    const res = await GET(makeGet() as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile).toMatchObject({ id: 'u1', username: 'ali' })
    expect(body.isAdmin).toBe(false)
  })

  it('returns isAdmin=true when role exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSelect.mockResolvedValue({
      data: { id: 'u1', username: 'admin' },
      error: null,
    })
    mockRolesSelect.mockResolvedValue({
      data: [{ role_id: 'admin-role-id' }],
      error: null,
    })

    const res = await GET(makeGet() as never)
    const body = await res.json()
    expect(body.isAdmin).toBe(true)
  })

  it('returns 404 when profile not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSelect.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    })
    mockRolesSelect.mockResolvedValue({ data: [], error: null })

    const res = await GET(makeGet() as never)
    expect(res.status).toBe(404)
  })

  it('sets Cache-Control no-store', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSelect.mockResolvedValue({ data: { id: 'u1' }, error: null })
    mockRolesSelect.mockResolvedValue({ data: [], error: null })

    const res = await GET(makeGet() as never)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('PATCH /api/profile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makePatch({ display_name: 'Ali' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 if body is empty', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await PATCH(makePatch({}) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 if username too short', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await PATCH(makePatch({ username: 'a' }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 if grade out of range', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await PATCH(makePatch({ grade: 8 }) as never)
    expect(res.status).toBe(400)
  })

  it('accepts valid profile update', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileUpdate.mockResolvedValue({
      data: { id: 'u1', display_name: 'Ali', city: 'Istanbul', grade: 11, avatar_url: null },
      error: null,
    })

    const res = await PATCH(makePatch({ display_name: 'Ali', city: 'Istanbul', grade: 11 }) as never)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.display_name).toBe('Ali')
  })

  it('returns 500 on db error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileUpdate.mockResolvedValue({ data: null, error: { code: '23505' } })
    const res = await PATCH(makePatch({ username: 'taken' }) as never)
    expect(res.status).toBe(500)
  })
})
