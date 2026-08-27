import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  insert: vi.fn(),
  limit: vi.fn(),
  ip: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert: mocks.insert })),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check: mocks.limit })),
}))

vi.mock('@/lib/utils/client-ip', () => ({ getClientIp: mocks.ip }))

import { POST } from '../route'

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://bilgearena.com/api/consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'route-agent', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/consent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    mocks.limit.mockResolvedValue({ success: true })
    mocks.ip.mockReturnValue('203.0.113.10')
    mocks.insert.mockResolvedValue({ error: null })
  })

  it('writes anonymous consent through the service boundary with server evidence', async () => {
    const response = await POST(request({
      type: 'cookie',
      value: { essential: true, analytics: false },
    }))

    expect(response.status).toBe(200)
    expect(mocks.limit).toHaveBeenCalledWith('203.0.113.10')
    expect(mocks.insert).toHaveBeenCalledWith({
      user_id: null,
      consent_type: 'cookie',
      consent_value: {
        essential: true,
        analytics: false,
        policyVersion: 'cookie-policy@2026-05-17-v1',
        source: 'cookie_banner',
      },
      ip_address: '203.0.113.10',
      user_agent: 'route-agent',
    })
  })

  it('binds an authenticated cookie preference to the session user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'server-user' } } })
    const response = await POST(request({
      type: 'cookie',
      value: { essential: true, analytics: true },
    }))

    expect(response.status).toBe(200)
    expect(mocks.limit).toHaveBeenCalledWith('server-user')
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'server-user',
      consent_value: {
        essential: true,
        analytics: true,
        policyVersion: 'cookie-policy@2026-05-17-v1',
        source: 'cookie_banner',
      },
    }))
  })

  it('never accepts legal evidence through the generic cookie endpoint', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'server-user' } } })
    const response = await POST(request({ type: 'terms', value: { accepted: true } }))

    expect(response.status).toBe(400)
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('rejects client-supplied policy versions and extra evidence fields', async () => {
    const response = await POST(request({
      type: 'cookie',
      value: { essential: true, analytics: false, policyVersion: 'forged' },
    }))

    expect(response.status).toBe(400)
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('rejects identity and forensic fields outside the strict payload', async () => {
    const response = await POST(request({
      type: 'terms',
      value: { accepted: true },
      user_id: 'forged-user',
      ip_address: '198.51.100.99',
    }))

    expect(response.status).toBe(400)
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('fails closed when the rate-limit backend is unavailable', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'server-user' } } })
    mocks.limit.mockResolvedValue({ success: false, reason: 'backend_unavailable', retryAfter: 60 })
    const response = await POST(request({
      type: 'cookie',
      value: { essential: true, analytics: false },
    }))

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('rejects oversized evidence and database failures', async () => {
    const tooLarge = await POST(request({ type: 'kvkk', value: { note: 'x'.repeat(4097) } }))
    expect(tooLarge.status).toBe(400)

    mocks.insert.mockResolvedValueOnce({ error: { message: 'unavailable' } })
    const failed = await POST(request({
      type: 'cookie',
      value: { essential: true, analytics: true },
    }))
    expect(failed.status).toBe(500)
  })
})
