import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────

const mockGetUser = vi.fn()
const mockUpsert = vi.fn()
const mockDeleteEq = vi.fn()
const mockUserFrom = vi.fn()
const mockServiceFrom = vi.fn()
const deleteFilters: Array<[string, string]> = []

// Kullanici istemcisi yalniz oturumu dogrular; tablo migration 224'ten beri
// tarayici rollerine kapali, yazma service-role ile.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockUserFrom,
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: mockServiceFrom.mockImplementation(() => ({
      upsert: mockUpsert,
      delete: vi.fn(() => ({
        eq: vi.fn((column: string, value: string) => {
          deleteFilters.push([column, value])
          return {
            eq: (column2: string, value2: string) => {
              deleteFilters.push([column2, value2])
              return mockDeleteEq()
            },
          }
        }),
      })),
    })),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({
    check: vi.fn().mockResolvedValue({ success: true }),
  }),
}))

import { POST, DELETE } from '../route'

// ─── Helpers ────────────────────────────────────────

function makeRequest(body: Record<string, unknown>, method = 'POST') {
  return new Request('http://localhost/api/push', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validSub = { endpoint: 'https://fcm.googleapis.com/fcm/send/xyz', p256dh: 'key1', auth: 'auth1' }

// ─── Tests ──────────────────────────────────────────

describe('POST /api/push', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deleteFilters.length = 0
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest(validSub))
    expect(res.status).toBe(401)
  })

  it('returns 400 if endpoint missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ p256dh: 'k', auth: 'a' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if p256dh missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ endpoint: 'e', auth: 'a' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if auth missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ endpoint: 'e', p256dh: 'k' }))
    expect(res.status).toBe(400)
  })

  it('subscribes successfully', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockUpsert.mockResolvedValue({ error: null })

    const res = await POST(makeRequest({ ...validSub, user_id: 'someone-else' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('subscribed')
    expect(mockServiceFrom).toHaveBeenCalledWith('push_subscriptions')
    expect(mockUserFrom).not.toHaveBeenCalled()
    expect(mockUpsert).toHaveBeenCalledWith(
      { user_id: 'u1', endpoint: validSub.endpoint, p256dh: 'key1', auth: 'auth1' },
      { onConflict: 'user_id,endpoint' },
    )
  })

  it('rejects an address that is not a browser push service without storing it', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    for (const endpoint of ['https://fcm.example.com/xyz', 'https://169.254.169.254/latest', 'http://fcm.googleapis.com/x']) {
      const res = await POST(makeRequest({ ...validSub, endpoint }))
      expect(res.status).toBe(400)
    }
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns 500 on upsert error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockUpsert.mockResolvedValue({ error: { message: 'DB error' } })

    const res = await POST(makeRequest(validSub))
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/push', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deleteFilters.length = 0
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeRequest({ endpoint: 'e' }, 'DELETE'))
    expect(res.status).toBe(401)
  })

  it('returns 400 if endpoint missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await DELETE(makeRequest({}, 'DELETE'))
    expect(res.status).toBe(400)
  })

  it('unsubscribes successfully', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockDeleteEq.mockResolvedValue({ error: null })

    const res = await DELETE(makeRequest({ endpoint: 'https://fcm.example.com/xyz' }, 'DELETE'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('unsubscribed')
    expect(mockServiceFrom).toHaveBeenCalledWith('push_subscriptions')
    expect(mockUserFrom).not.toHaveBeenCalled()
    expect(deleteFilters).toEqual([['user_id', 'u1'], ['endpoint', 'https://fcm.example.com/xyz']])
  })

  it('returns 500 when the delete fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockDeleteEq.mockResolvedValue({ error: { message: 'DB error' } })

    const res = await DELETE(makeRequest({ endpoint: 'https://fcm.googleapis.com/fcm/send/xyz' }, 'DELETE'))
    expect(res.status).toBe(500)
  })
})
