/**
 * api-helpers — getAuthRateLimited rate limit + auth ordering testleri.
 *
 * Memory pattern: feedback_dual_rate_limit_pattern + feedback_auth_lookup_after_rate_limit.
 * Kritik: IP rejection'da auth.getUser CAGRILMAMALI (Supabase Auth quota tasarruf).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUser, mockGetSession } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
  })),
}))

import { getAuthRateLimited } from '../api-helpers'

const VALID_UUID = '11111111-2222-3333-4444-555555555555'
const VALID_JWT = 'eyJ.test.jwt'

function makeReq(ip = '1.2.3.4'): Request {
  const headers = new Headers()
  headers.set('cf-connecting-ip', ip)
  return new Request('http://localhost/api/rooms/x/test', { method: 'POST', headers })
}

function makeLimiter(success: boolean, retryAfter = 0) {
  return {
    check: vi.fn(async () => ({ success, retryAfter })),
  }
}

describe('getAuthRateLimited', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: null } })
  })

  it('SECURITY: IP rejection ONCE — auth.getUser cagrilmaz (anon flood quota koruma)', async () => {
    const ipLimiter = makeLimiter(false, 30)
    const userLimiter = makeLimiter(true)
    const result = await getAuthRateLimited(makeReq(), ipLimiter, userLimiter)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(429)
      expect(result.response.headers.get('Retry-After')).toBe('30')
    }
    // KRITIK: IP rejection'da auth.getUser CAGRILMAMALI
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(mockGetSession).not.toHaveBeenCalled()
    expect(userLimiter.check).not.toHaveBeenCalled()
  })

  it('Auth fail (no user) → 401, user limiter cagrilmaz', async () => {
    const ipLimiter = makeLimiter(true)
    const userLimiter = makeLimiter(true)
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const result = await getAuthRateLimited(makeReq(), ipLimiter, userLimiter)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(401)
    }
    expect(ipLimiter.check).toHaveBeenCalled()
    expect(mockGetUser).toHaveBeenCalled()
    // Auth fail sonra user limiter SKIP — user.id yok cunku
    expect(userLimiter.check).not.toHaveBeenCalled()
  })

  it('User limit reject — 429 (IP gectikten sonra)', async () => {
    const ipLimiter = makeLimiter(true)
    const userLimiter = makeLimiter(false, 15)
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } }, error: null })

    const result = await getAuthRateLimited(makeReq(), ipLimiter, userLimiter)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(429)
      expect(result.response.headers.get('Retry-After')).toBe('15')
    }
    expect(userLimiter.check).toHaveBeenCalledWith(VALID_UUID)
    // JWT extract user-id reject sonrasi yapilmamali
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('Session missing — 401 (user var ama JWT yok)', async () => {
    const ipLimiter = makeLimiter(true)
    const userLimiter = makeLimiter(true)
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    const result = await getAuthRateLimited(makeReq(), ipLimiter, userLimiter)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(401)
    }
  })

  it('Happy path — IP + user limit OK + auth OK + JWT var', async () => {
    const ipLimiter = makeLimiter(true)
    const userLimiter = makeLimiter(true)
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: VALID_JWT } } })

    const result = await getAuthRateLimited(makeReq(), ipLimiter, userLimiter)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.userId).toBe(VALID_UUID)
      expect(result.jwt).toBe(VALID_JWT)
    }
    expect(ipLimiter.check).toHaveBeenCalled()
    expect(userLimiter.check).toHaveBeenCalledWith(VALID_UUID)
  })

  it('IP extracted from cf-connecting-ip (XFF anti-spoof)', async () => {
    const headers = new Headers()
    headers.set('x-forwarded-for', '99.99.99.99')  // attacker spoof
    headers.set('cf-connecting-ip', '1.2.3.4')      // CF trusted
    const req = new Request('http://localhost', { headers })

    const ipLimiter = makeLimiter(true)
    const userLimiter = makeLimiter(true)
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: VALID_JWT } } })

    await getAuthRateLimited(req, ipLimiter, userLimiter)

    // IP key cf-connecting-ip olmali, x-forwarded-for spoof'a guvenmemeli
    expect(ipLimiter.check).toHaveBeenCalledWith('1.2.3.4')
  })

  it('Anon flood simulation — 5 IP-rejected request, mockGetUser SIFIR cagri', async () => {
    const ipLimiter = makeLimiter(false, 60)
    const userLimiter = makeLimiter(true)

    for (let i = 0; i < 5; i++) {
      await getAuthRateLimited(makeReq(), ipLimiter, userLimiter)
    }

    expect(ipLimiter.check).toHaveBeenCalledTimes(5)
    expect(mockGetUser).toHaveBeenCalledTimes(0)  // SECURITY: hicbir Supabase Auth call
  })
})
