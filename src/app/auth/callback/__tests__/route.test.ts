import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockExchangeCodeForSession,
  mockClaimActivationReward,
  mockCookieGet,
  mockServiceClient,
} = vi.hoisted(() => ({
  mockExchangeCodeForSession: vi.fn(),
  mockClaimActivationReward: vi.fn(),
  mockCookieGet: vi.fn(),
  mockServiceClient: {},
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: vi.fn(() => []),
    set: vi.fn(),
    get: mockCookieGet,
  })),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { exchangeCodeForSession: mockExchangeCodeForSession },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockServiceClient),
}))

vi.mock('@/lib/activation/server-reward', () => ({
  ACTIVATION_REWARD_COOKIE: 'ba_activation_reward',
  claimActivationReward: mockClaimActivationReward,
}))

import { GET } from '../route'

describe('GET /auth/callback activation reward', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCookieGet.mockReturnValue({ value: 'signed-ticket' })
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    })
    mockClaimActivationReward.mockResolvedValue({ xpAwarded: 100, alreadyProcessed: false })
  })

  it('claims the signed guest reward before redirect and exposes only the bounded XP notice', async () => {
    const response = await GET(new Request(
      'http://localhost/auth/callback?code=oauth-code&next=%2Farena%2Fturkce',
    ))

    expect(mockClaimActivationReward).toHaveBeenCalledWith(
      mockServiceClient,
      'user-1',
      'signed-ticket',
    )
    expect(response.headers.get('location')).toBe('http://localhost/arena/turkce?activationXp=100')
    expect(response.headers.get('set-cookie')).toContain('ba_activation_reward=')
    expect(response.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })

  it('never turns a replay into a second XP notice', async () => {
    mockClaimActivationReward.mockResolvedValue({ xpAwarded: 0, alreadyProcessed: true })

    const response = await GET(new Request(
      'http://localhost/auth/callback?code=oauth-code&next=%2Farena%2Fturkce',
    ))

    expect(response.headers.get('location')).toBe('http://localhost/arena/turkce')
  })

  it('keeps the signed ticket when a transient claim error needs retry after redirect', async () => {
    mockClaimActivationReward.mockRejectedValue(new Error('temporary-db-error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await GET(new Request(
      'http://localhost/auth/callback?code=oauth-code&next=%2Farena%2Fturkce',
    ))

    expect(response.headers.get('location')).toBe('http://localhost/arena/turkce')
    expect(response.headers.get('set-cookie')).toBeNull()
    consoleSpy.mockRestore()
  })

  it('keeps the open-redirect guard while processing normal OAuth callbacks', async () => {
    mockCookieGet.mockReturnValue(undefined)

    const response = await GET(new Request(
      'http://localhost/auth/callback?code=oauth-code&next=%2F%2Fevil.example',
    ))

    expect(response.headers.get('location')).toBe('http://localhost/arena')
    expect(mockClaimActivationReward).not.toHaveBeenCalled()
  })

  it('rejects backslash URL parser tricks as external redirect candidates', async () => {
    mockCookieGet.mockReturnValue(undefined)

    const response = await GET(new Request(
      'http://localhost/auth/callback?code=oauth-code&next=%2F%5C%5Cevil.example',
    ))

    expect(response.headers.get('location')).toBe('http://localhost/arena')
  })
})
