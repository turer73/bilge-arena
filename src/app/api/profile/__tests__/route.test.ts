import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: mockUpdate,
          })),
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({
    check: vi.fn().mockResolvedValue({ success: true }),
  }),
}))

import { PATCH } from '../route'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/profile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makeRequest({ display_name: 'Ali' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 if body is empty', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await PATCH(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 if username too short', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await PATCH(makeRequest({ username: 'a' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if grade out of range', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await PATCH(makeRequest({ grade: 8 }))
    expect(res.status).toBe(400)
  })

  it('accepts valid profile update', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockUpdate.mockResolvedValue({
      data: { id: 'u1', display_name: 'Ali', city: 'Istanbul', grade: 11, avatar_url: null },
      error: null,
    })

    const res = await PATCH(makeRequest({ display_name: 'Ali', city: 'Istanbul', grade: 11 }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.display_name).toBe('Ali')
  })
})
