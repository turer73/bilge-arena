import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────

const mockGetUser = vi.fn()
const mockUpsert = vi.fn()
const mockDeleteEq = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      upsert: mockUpsert,
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: mockDeleteEq,
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

import { POST, DELETE } from '../route'

// ─── Helpers ────────────────────────────────────────

function makeRequest(body: Record<string, unknown>, method = 'POST') {
  return new Request('http://localhost/api/push', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validSub = { endpoint: 'https://fcm.example.com/xyz', p256dh: 'key1', auth: 'auth1' }

// ─── Tests ──────────────────────────────────────────

describe('POST /api/push', () => {
  beforeEach(() => vi.clearAllMocks())

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

    const res = await POST(makeRequest(validSub))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('subscribed')
  })

  it('returns 500 on upsert error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockUpsert.mockResolvedValue({ error: { message: 'DB error' } })

    const res = await POST(makeRequest(validSub))
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/push', () => {
  beforeEach(() => vi.clearAllMocks())

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
  })
})
