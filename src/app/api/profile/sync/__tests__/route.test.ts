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
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: mockProfileSelect })),
          })),
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

import { POST } from '../route'

function makePost() {
  const headers = new Headers()
  headers.set('x-forwarded-for', '1.2.3.4')
  return new Request('http://localhost/api/profile/sync', {
    method: 'POST',
    headers,
  })
}

describe('POST /api/profile/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPlatformAdmin.mockResolvedValue(false)
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePost() as never)
    expect(res.status).toBe(401)
  })

  it('returns 404 if profile not found', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', user_metadata: {} } },
    })
    mockProfileSelect.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    const res = await POST(makePost() as never)
    expect(res.status).toBe(404)
  })

  it('returns updated=false when google metadata matches existing profile', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'u1',
          user_metadata: { full_name: 'Ali', avatar_url: 'https://google/avatar.png' },
        },
      },
    })
    mockProfileSelect.mockResolvedValue({
      data: {
        id: 'u1',
        display_name: 'Ali',
        avatar_url: 'https://google/avatar.png',
      },
      error: null,
    })
    const res = await POST(makePost() as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(false)
    expect(body.isAdmin).toBe(false)
  })

  it('updates display_name when google name differs', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'u1',
          user_metadata: { full_name: 'Ali Yeni', avatar_url: 'https://google/avatar.png' },
        },
      },
    })
    mockProfileSelect.mockResolvedValue({
      data: { id: 'u1', display_name: 'Ali Eski', avatar_url: 'https://google/avatar.png' },
      error: null,
    })
    mockProfileUpdate.mockResolvedValue({
      data: { id: 'u1', display_name: 'Ali Yeni', avatar_url: 'https://google/avatar.png' },
      error: null,
    })

    const res = await POST(makePost() as never)
    const body = await res.json()
    expect(body.updated).toBe(true)
    expect(body.profile.display_name).toBe('Ali Yeni')
  })

  it('preserves custom avatar over google avatar', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'u1',
          user_metadata: { full_name: 'Ali', avatar_url: 'https://google/avatar.png' },
        },
      },
    })
    mockProfileSelect.mockResolvedValue({
      data: {
        id: 'u1',
        display_name: 'Ali',
        avatar_url: 'https://custom/avatars/u1.png', // /avatars/ path
      },
      error: null,
    })
    const res = await POST(makePost() as never)
    const body = await res.json()
    expect(body.updated).toBe(false)
    expect(body.profile.avatar_url).toBe('https://custom/avatars/u1.png')
  })

  it('returns isAdmin=true only when a platform admin permission exists', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', user_metadata: {} } },
    })
    mockProfileSelect.mockResolvedValue({
      data: { id: 'u1', display_name: 'Admin', avatar_url: null },
      error: null,
    })
    mockPlatformAdmin.mockResolvedValue(true)

    const res = await POST(makePost() as never)
    const body = await res.json()
    expect(body.isAdmin).toBe(true)
    expect(body.updated).toBe(false)
  })

  it('falls back gracefully when update fails', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'u1',
          user_metadata: { full_name: 'Ali Yeni' },
        },
      },
    })
    mockProfileSelect.mockResolvedValue({
      data: { id: 'u1', display_name: 'Ali Eski', avatar_url: null },
      error: null,
    })
    mockProfileUpdate.mockResolvedValue({ data: null, error: { code: 'XX' } })

    const res = await POST(makePost() as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(false)
    expect(body.profile.display_name).toBe('Ali Eski')
  })
})
