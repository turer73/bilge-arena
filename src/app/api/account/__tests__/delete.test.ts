import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockRpc = vi.fn()
const mockSignOut = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser, signOut: mockSignOut },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    rpc: mockRpc,
  }),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({
    check: vi.fn().mockResolvedValue({ success: true }),
  }),
}))

import { POST } from '../delete/route'

describe('POST /api/account/delete', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('calls soft_delete_user RPC and signs out', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ error: null })
    mockSignOut.mockResolvedValue({})

    const res = await POST()
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.message).toContain('30 gun')
    expect(mockRpc).toHaveBeenCalledWith('soft_delete_user', { p_user_id: 'u1' })
    expect(mockSignOut).toHaveBeenCalled()
  })

  it('returns 500 if RPC fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ error: { message: 'DB error' } })

    const res = await POST()
    expect(res.status).toBe(500)
  })
})
