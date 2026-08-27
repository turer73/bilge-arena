import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUser, mockProfileSelect, mockPlatformAdmin, mockProfileUpdate } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockProfileSelect: vi.fn(),
  mockPlatformAdmin: vi.fn(),
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
          select: vi.fn((_cols: string) => ({
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
      return {}
    }),
  })),
}))

vi.mock('@/lib/supabase/platform-access', () => ({
  userHasPlatformAdminAccess: mockPlatformAdmin,
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
  beforeEach(() => {
    vi.clearAllMocks()
    mockPlatformAdmin.mockResolvedValue(false)
  })

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
    const res = await GET(makeGet() as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile).toMatchObject({ id: 'u1', username: 'ali' })
    expect(body.isAdmin).toBe(false)
  })

  it('returns isAdmin=true only when a platform admin permission exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSelect.mockResolvedValue({
      data: { id: 'u1', username: 'admin' },
      error: null,
    })
    mockPlatformAdmin.mockResolvedValue(true)

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
    const res = await GET(makeGet() as never)
    expect(res.status).toBe(404)
  })

  it('sets Cache-Control no-store', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSelect.mockResolvedValue({ data: { id: 'u1' }, error: null })
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

  it('accepts is_discoverable toggle (opt-in kesif)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileUpdate.mockResolvedValue({
      data: { id: 'u1', is_discoverable: false },
      error: null,
    })
    const res = await PATCH(makePatch({ is_discoverable: false }) as never)
    expect(res.status).toBe(200)
    expect((await res.json()).is_discoverable).toBe(false)
  })

  it('rejects non-boolean is_discoverable', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await PATCH(makePatch({ is_discoverable: 'yes' }) as never)
    expect(res.status).toBe(400)
  })

  it('accepts a boolean public leaderboard opt-in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileUpdate.mockResolvedValue({
      data: { id: 'u1', leaderboard_opt_in: true },
      error: null,
    })

    const res = await PATCH(makePatch({ leaderboard_opt_in: true }) as never)
    expect(res.status).toBe(200)
    expect((await res.json()).leaderboard_opt_in).toBe(true)
  })

  it('rejects a non-boolean public leaderboard preference', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await PATCH(makePatch({ leaderboard_opt_in: 'yes' }) as never)
    expect(res.status).toBe(400)
  })
})
