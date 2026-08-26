import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  ip: vi.fn(),
  token: vi.fn(),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check: mocks.limit })),
}))
vi.mock('@/lib/utils/client-ip', () => ({ getClientIp: mocks.ip }))
vi.mock('@/lib/legal-consent/server', () => ({
  createLegalConsentIntentToken: mocks.token,
  LEGAL_CONSENT_INTENT_COOKIE: 'ba_legal_consent_intent',
  LEGAL_CONSENT_INTENT_TTL_SECONDS: 1800,
}))

import { POST } from '../route'

describe('POST /api/consent/intent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ip.mockReturnValue('203.0.113.9')
    mocks.limit.mockResolvedValue({ success: true })
    mocks.token.mockReturnValue('signed-token')
  })

  it('issues a no-store signed intent behind a fail-closed limiter', async () => {
    const response = await POST(new Request('https://bilgearena.com/api/consent/intent', {
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('set-cookie')).toContain('ba_legal_consent_intent=signed-token')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(response.headers.get('set-cookie')).toContain('SameSite=lax')
    expect(response.headers.get('set-cookie')).toContain('Path=/auth/callback')
    await expect(response.json()).resolves.toEqual({ ok: true, token: 'signed-token' })
    expect(mocks.limit).toHaveBeenCalledWith('203.0.113.9')
  })

  it('fails closed when limiter storage or signing is unavailable', async () => {
    mocks.limit.mockResolvedValueOnce({
      success: false,
      reason: 'backend_unavailable',
      retryAfter: 30,
    })
    const limited = await POST(new Request('https://bilgearena.com/api/consent/intent', {
      method: 'POST',
    }))
    expect(limited.status).toBe(503)
    expect(limited.headers.get('retry-after')).toBe('30')

    mocks.limit.mockResolvedValueOnce({ success: true })
    mocks.token.mockReturnValueOnce(null)
    const unsigned = await POST(new Request('https://bilgearena.com/api/consent/intent', {
      method: 'POST',
    }))
    expect(unsigned.status).toBe(503)
  })
})
