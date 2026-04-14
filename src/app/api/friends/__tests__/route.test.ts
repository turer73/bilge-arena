import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Supabase mock ──────────────────────────────────

const mockGetUser = vi.fn()
const mockFriendSelect = vi.fn()
const mockFriendInsert = vi.fn()
const mockFriendUpdate = vi.fn()
const mockFriendDelete = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        or: vi.fn(() => ({
          in: vi.fn(() => mockFriendSelect()),
        })),
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => mockFriendUpdate()),
              })),
            })),
          })),
        })),
      })),
      insert: vi.fn(() => mockFriendInsert()),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          or: vi.fn(() => mockFriendDelete()),
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

import { GET, POST, PATCH, DELETE } from '../route'

// ─── Helpers ────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/friends', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_UUID = '10000000-0000-4000-8000-000000000001'

// ─── Tests ──────────────────────────────────────────

describe('GET /api/friends', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns friend lists when authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFriendSelect.mockResolvedValue({ data: [], error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('friends')
    expect(json).toHaveProperty('pendingReceived')
    expect(json).toHaveProperty('pendingSent')
  })
})

describe('POST /api/friends', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ friendId: VALID_UUID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 if friendId is invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ friendId: 'not-uuid' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if trying to friend yourself', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    const res = await POST(makeRequest({ friendId: VALID_UUID }))
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/friends', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makeRequest({ friendshipId: VALID_UUID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 if friendshipId is invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await PATCH(makeRequest({ friendshipId: 'bad' }))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/friends', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeRequest({ friendshipId: VALID_UUID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 if friendshipId is invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await DELETE(makeRequest({ friendshipId: 'bad' }))
    expect(res.status).toBe(400)
  })
})
