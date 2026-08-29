import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted ────────────────────────────────────────
const { mockRateLimitCheck } = vi.hoisted(() => ({
  mockRateLimitCheck: vi.fn(async () => ({ success: true })),
}))

const mockGetUser = vi.fn()
const mockRpc = vi.fn()
const mockUnblockDelete = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn(() => ({
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({ maybeSingle: mockUnblockDelete })),
            })),
          })),
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check: mockRateLimitCheck })),
}))

import { POST, DELETE } from '../route'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/friends/block', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_UUID = '10000000-0000-4000-8000-000000000001'

describe('POST /api/friends/block', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimitCheck.mockResolvedValue({ success: true })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ targetId: VALID_UUID }))
    expect(res.status).toBe(401)
  })

  it('returns 429 on rate limit', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRateLimitCheck.mockResolvedValueOnce({ success: false } as never)
    const res = await POST(makeRequest({ targetId: VALID_UUID }))
    expect(res.status).toBe(429)
  })

  it('returns 400 if targetId is invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ targetId: 'not-uuid' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when blocking yourself', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    const res = await POST(makeRequest({ targetId: VALID_UUID }))
    expect(res.status).toBe(400)
  })

  it('blocks via block_user RPC on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ error: null })
    const res = await POST(makeRequest({ targetId: VALID_UUID }))
    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('block_user', { p_target: VALID_UUID })
    expect(await res.json()).toEqual({ status: 'blocked' })
  })

  it('returns 500 (generic, no leak) if RPC errors', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ error: { message: 'pg internal detail' } })
    const res = await POST(makeRequest({ targetId: VALID_UUID }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).not.toContain('pg internal')
  })
})

describe('DELETE /api/friends/block (unblock)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimitCheck.mockResolvedValue({ success: true })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeRequest({ targetId: VALID_UUID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 if targetId is invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await DELETE(makeRequest({ targetId: 'bad' }))
    expect(res.status).toBe(400)
  })

  it('unblocks on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockUnblockDelete.mockResolvedValue({ data: { id: 'b1' }, error: null })
    const res = await DELETE(makeRequest({ targetId: VALID_UUID }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'unblocked' })
  })

  it('returns 404 when block does not exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockUnblockDelete.mockResolvedValue({ data: null, error: null })
    const res = await DELETE(makeRequest({ targetId: VALID_UUID }))
    expect(res.status).toBe(404)
  })
})
