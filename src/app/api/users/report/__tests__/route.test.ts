import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRateLimitCheck } = vi.hoisted(() => ({
  mockRateLimitCheck: vi.fn(async () => ({ success: true })),
}))

const mockGetUser = vi.fn()
const mockInsert = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      insert: (...args: unknown[]) => mockInsert(...args),
    })),
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: (...args: unknown[]) => mockInsert(...args),
    })),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check: mockRateLimitCheck })),
}))

import { POST } from '../route'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/users/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_UUID = '10000000-0000-4000-8000-000000000001'
const OTHER_UUID = '20000000-0000-4000-8000-000000000002'

describe('POST /api/users/report', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimitCheck.mockResolvedValue({ success: true })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ reportedUserId: VALID_UUID, reportType: 'harassment' }))
    expect(res.status).toBe(401)
  })

  it('returns 429 on rate limit', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRateLimitCheck.mockResolvedValueOnce({ success: false } as never)
    const res = await POST(makeRequest({ reportedUserId: VALID_UUID, reportType: 'harassment' }))
    expect(res.status).toBe(429)
  })

  it('returns 400 if reportedUserId invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ reportedUserId: 'bad', reportType: 'harassment' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if reportType not in enum', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ reportedUserId: VALID_UUID, reportType: 'bogus' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when reporting yourself', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    const res = await POST(makeRequest({ reportedUserId: VALID_UUID, reportType: 'spam' }))
    expect(res.status).toBe(400)
  })

  it('creates report on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mockInsert.mockResolvedValue({ error: null })
    const res = await POST(makeRequest({ reportedUserId: OTHER_UUID, reportType: 'inappropriate', reason: 'kötü avatar' }))
    expect(res.status).toBe(200)
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      reporter_id: VALID_UUID,
      reported_user_id: OTHER_UUID,
      report_type: 'inappropriate',
    }))
    expect(await res.json()).toEqual({ status: 'reported' })
  })
})
