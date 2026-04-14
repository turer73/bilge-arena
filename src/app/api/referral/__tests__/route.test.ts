import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { referral_code: 'ABC123' }, error: null }),
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { referral_code: 'ABC123' }, error: null }),
          })),
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  }),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({
    check: vi.fn().mockResolvedValue({ success: true }),
  }),
}))

import { POST } from '../route'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/referral', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/referral', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ code: 'ABC123' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 if code is empty', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ code: '' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if code is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 if code exceeds 20 chars', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ code: 'a'.repeat(21) }))
    expect(res.status).toBe(400)
  })
})
