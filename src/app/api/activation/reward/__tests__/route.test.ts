import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rateLimit: vi.fn(),
  claim: vi.fn(),
  readCookie: vi.fn(),
  admin: {},
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.admin),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check: mocks.rateLimit })),
}))
vi.mock('@/lib/activation/server-reward', () => ({
  ACTIVATION_REWARD_COOKIE: 'ba_activation_reward',
  claimActivationReward: mocks.claim,
  readActivationRewardCookie: mocks.readCookie,
}))

import { POST } from '../route'

function request() {
  return new Request('http://localhost/api/activation/reward', {
    method: 'POST',
    headers: { cookie: 'ba_activation_reward=signed-ticket' },
  })
}

describe('POST /api/activation/reward', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mocks.rateLimit.mockResolvedValue({ success: true })
    mocks.readCookie.mockReturnValue('signed-ticket')
    mocks.claim.mockResolvedValue({ xpAwarded: 100, alreadyProcessed: false })
  })

  it('requires an authenticated OAuth session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    expect((await POST(request())).status).toBe(401)
    expect(mocks.claim).not.toHaveBeenCalled()
  })

  it('returns 204 without a pending HttpOnly ticket', async () => {
    mocks.readCookie.mockReturnValue(null)
    expect((await POST(request())).status).toBe(204)
    expect(mocks.claim).not.toHaveBeenCalled()
  })

  it('claims idempotently and clears the resolved ticket', async () => {
    const response = await POST(request())

    expect(await response.json()).toEqual({ xpAwarded: 100, alreadyProcessed: false })
    expect(mocks.claim).toHaveBeenCalledWith(mocks.admin, 'user-1', 'signed-ticket')
    expect(response.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })

  it('keeps an incomplete ticket retryable', async () => {
    mocks.claim.mockResolvedValue(null)
    const response = await POST(request())

    expect(response.status).toBe(409)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('keeps a ticket on transient infrastructure failure', async () => {
    mocks.claim.mockRejectedValue(new Error('redis-down'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await POST(request())

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('15')
    expect(response.headers.get('set-cookie')).toBeNull()
    consoleSpy.mockRestore()
  })
})
