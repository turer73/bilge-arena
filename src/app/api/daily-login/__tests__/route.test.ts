import { describe, it, expect, vi, beforeEach } from 'vitest'

// Seri, gün sınırı ve tek-kazanan kuralı claim_daily_login RPC'sinde; gerçek
// PostgreSQL davranışı database/__tests__/economy-integrity-postgres'te
// sınanır. Bu dosya route'un RPC sözleşmesini ve hata eşlemesini sınar.

const { mockGetUser, mockRpc, mockLimiterCheck } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
  mockLimiterCheck: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ rpc: mockRpc }),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({ check: mockLimiterCheck }),
}))

import { POST } from '../route'

describe('POST /api/daily-login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLimiterCheck.mockResolvedValue({ success: true })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await POST()
    expect(res.status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 429 when rate limited, before the RPC', async () => {
    mockLimiterCheck.mockResolvedValue({ success: false })

    const res = await POST()
    expect(res.status).toBe(429)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('claims through the single RPC with the authenticated user id', async () => {
    mockRpc.mockResolvedValue({
      data: { status: 'claimed', streak: 3, xpAwarded: 30, coinsAwarded: 6 },
      error: null,
    })

    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: 'claimed', streak: 3, xpAwarded: 30, coinsAwarded: 6, maxXP: 70,
    })
    expect(mockRpc).toHaveBeenCalledWith('claim_daily_login', { p_user_id: 'u1' })
  })

  it('passes through already_claimed and streak_reset', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { status: 'already_claimed', streak: 4, xpAwarded: 0, coinsAwarded: 0 },
      error: null,
    })
    expect(await (await POST()).json()).toMatchObject({ status: 'already_claimed', xpAwarded: 0 })

    mockRpc.mockResolvedValueOnce({
      data: { status: 'streak_reset', streak: 1, xpAwarded: 10, coinsAwarded: 2 },
      error: null,
    })
    expect(await (await POST()).json()).toMatchObject({ status: 'streak_reset', streak: 1 })
  })

  it('maps a missing profile to 404 and a missing RPC to 503', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'P0002', message: 'profile not found' } })
    expect((await POST()).status).toBe(404)

    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'not found' } })
    expect((await POST()).status).toBe(503)
  })

  it('does not echo database errors or malformed results', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'sensitive detail' } })
    const failed = await POST()
    expect(failed.status).toBe(500)
    expect(JSON.stringify(await failed.json())).not.toContain('sensitive')

    mockRpc.mockResolvedValueOnce({ data: { status: 'claimed', streak: -1 }, error: null })
    expect((await POST()).status).toBe(500)
  })
})
