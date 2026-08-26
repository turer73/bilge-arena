import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockExchangeCodeForSession,
  mockClaimActivationReward,
  mockCookieGet,
  mockCookieGetAll,
  mockSignOut,
  mockServiceClient,
  mockHasCurrentLegalConsent,
  mockLegalConsentIntentMatchesCookie,
  mockRecordLegalConsentIntent,
} = vi.hoisted(() => ({
  mockExchangeCodeForSession: vi.fn(),
  mockClaimActivationReward: vi.fn(),
  mockCookieGet: vi.fn(),
  mockCookieGetAll: vi.fn(),
  mockSignOut: vi.fn(),
  mockServiceClient: {},
  mockHasCurrentLegalConsent: vi.fn(),
  mockLegalConsentIntentMatchesCookie: vi.fn(),
  mockRecordLegalConsentIntent: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: mockCookieGetAll,
    set: vi.fn(),
    get: mockCookieGet,
  })),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      signOut: mockSignOut,
    },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockServiceClient),
}))

vi.mock('@/lib/activation/server-reward', () => ({
  ACTIVATION_REWARD_COOKIE: 'ba_activation_reward',
  claimActivationReward: mockClaimActivationReward,
}))

vi.mock('@/lib/legal-consent/server', () => ({
  hasCurrentLegalConsent: mockHasCurrentLegalConsent,
  legalConsentIntentMatchesCookie: mockLegalConsentIntentMatchesCookie,
  LEGAL_CONSENT_INTENT_COOKIE: 'ba_legal_consent_intent',
  recordLegalConsentIntent: mockRecordLegalConsentIntent,
}))

vi.mock('@/lib/utils/client-ip', () => ({ getClientIp: vi.fn(() => '203.0.113.5') }))

import { GET } from '../route'

describe('GET /auth/callback activation reward', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCookieGet.mockReturnValue({ value: 'signed-ticket' })
    mockCookieGetAll.mockReturnValue([])
    mockSignOut.mockResolvedValue({ error: null })
    mockHasCurrentLegalConsent.mockResolvedValue(true)
    mockLegalConsentIntentMatchesCookie.mockReturnValue(true)
    mockRecordLegalConsentIntent.mockResolvedValue(true)
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

  it('binds a signed legal-consent intent to the exchanged session user', async () => {
    mockCookieGet.mockImplementation((name: string) => (
      name === 'ba_legal_consent_intent'
        ? { value: 'signed-consent-token' }
        : undefined
    ))
    const response = await GET(new Request(
      'http://localhost/auth/callback?code=oauth-code&legalConsent=signed-consent-token',
      { headers: { 'user-agent': 'callback-agent' } },
    ))

    expect(mockRecordLegalConsentIntent).toHaveBeenCalledWith(mockServiceClient, {
      userId: 'user-1',
      rawToken: 'signed-consent-token',
      ipAddress: '203.0.113.5',
      userAgent: 'callback-agent',
    })
    expect(mockLegalConsentIntentMatchesCookie).toHaveBeenCalledWith(
      'signed-consent-token',
      'signed-consent-token',
    )
    expect(mockHasCurrentLegalConsent).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toBe('http://localhost/arena')
    expect(response.headers.get('set-cookie')).toContain('ba_legal_consent_intent=')
    expect(response.headers.get('set-cookie')).toContain('Path=/auth/callback')
  })

  it('rejects a signed consent token stolen from another browser', async () => {
    mockCookieGet.mockImplementation((name: string) => (
      name === 'ba_legal_consent_intent'
        ? { value: 'different-browser-token' }
        : undefined
    ))
    mockLegalConsentIntentMatchesCookie.mockReturnValue(false)

    const response = await GET(new Request(
      'http://localhost/auth/callback?code=oauth-code&legalConsent=signed-consent-token',
    ))

    expect(mockRecordLegalConsentIntent).not.toHaveBeenCalled()
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(response.headers.get('location')).toBe('http://localhost/giris?error=consent_required')
    expect(response.headers.get('set-cookie')).toContain('ba_legal_consent_intent=')
    expect(response.headers.get('set-cookie')).toContain('Path=/auth/callback')
  })

  it('clears the exchanged session when signed intent verification fails', async () => {
    mockCookieGet.mockImplementation((name: string) => (
      name === 'ba_legal_consent_intent'
        ? { value: 'forged-consent-token' }
        : undefined
    ))
    mockRecordLegalConsentIntent.mockResolvedValue(false)

    const response = await GET(new Request(
      'http://localhost/auth/callback?code=oauth-code&legalConsent=forged-consent-token',
    ))

    expect(mockRecordLegalConsentIntent).toHaveBeenCalled()
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(response.headers.get('location')).toBe('http://localhost/giris?error=consent_required')
  })

  it('clears the exchanged session when neither intent nor current legal evidence exists', async () => {
    mockCookieGet.mockReturnValue(undefined)
    mockCookieGetAll.mockReturnValue([
      { name: 'sb-project-auth-token', value: 'session' },
      { name: 'unrelated', value: 'keep' },
    ])
    mockHasCurrentLegalConsent.mockResolvedValue(false)

    const response = await GET(new Request('http://localhost/auth/callback?code=oauth-code'))

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(response.headers.get('location')).toBe('http://localhost/giris?error=consent_required')
    expect(response.headers.get('set-cookie')).toContain('sb-project-auth-token=')
    expect(response.headers.get('set-cookie')).not.toContain('unrelated=')
    expect(mockClaimActivationReward).not.toHaveBeenCalled()
  })

  it('keeps the signed ticket when a transient claim error needs retry after redirect', async () => {
    mockClaimActivationReward.mockRejectedValue(new Error('temporary-db-error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await GET(new Request(
      'http://localhost/auth/callback?code=oauth-code&next=%2Farena%2Fturkce',
    ))

    expect(response.headers.get('location')).toBe('http://localhost/arena/turkce')
    expect(response.headers.get('set-cookie')).toContain('ba_legal_consent_intent=')
    expect(response.headers.get('set-cookie')).toContain('Path=/auth/callback')
    expect(response.headers.get('set-cookie')).not.toContain('ba_activation_reward=')
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
