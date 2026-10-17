import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

// JWT_SECRET module-load'da okunur -> import'tan ONCE set et (hoisted).
const mocks = vi.hoisted(() => {
  process.env.BILGE_ARENA_REALTIME_JWT_SECRET = 'test-secret'
  return { getUser: vi.fn(), limiter: vi.fn() }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({ check: mocks.limiter }),
}))

import { GET } from '../route'

function b64urlDecode(s: string): string {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
}

describe('GET /api/realtime/token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.limiter.mockResolvedValue({ success: true })
  })

  it('returns 401 if not authenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mocks.limiter).not.toHaveBeenCalled()
  })

  it('imzali HS256 token dondurur — role/aud/sub ve 10 dakikalik omur', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-42' } } })
    const res = await GET()
    expect(res.status).toBe(200)
    const { token, expires_at } = await res.json()

    const [header, payload, sig] = token.split('.')
    expect(JSON.parse(b64urlDecode(header)).alg).toBe('HS256')
    const claims = JSON.parse(b64urlDecode(payload))
    expect(claims.role).toBe('authenticated')
    expect(claims.aud).toBe('bilge-arena-realtime')
    expect(claims.sub).toBe('user-42')
    expect(claims.exp - claims.iat).toBe(600)
    expect(expires_at).toBe(claims.exp)

    // Imza test-secret ile dogrulanabilir olmali (forge-koruma)
    const expectedSig = createHmac('sha256', 'test-secret')
      .update(`${header}.${payload}`)
      .digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(sig).toBe(expectedSig)
  })

  it('hiz siniri kullanici kimligiyle sorulur; asilirsa 429 + Retry-After', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mocks.limiter.mockResolvedValue({ success: false, retryAfter: 42, reason: 'limit_exceeded' })
    const res = await GET()
    expect(mocks.limiter).toHaveBeenCalledWith('u1')
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('42')
    expect(await res.json()).not.toHaveProperty('token')
  })

  it('hiz siniri arka ucu yoksa 503 doner, token basmaz', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mocks.limiter.mockResolvedValue({ success: false, retryAfter: 60, reason: 'backend_unavailable' })
    const res = await GET()
    expect(res.status).toBe(503)
    expect(await res.json()).not.toHaveProperty('token')
  })

  it('yanit onbelleklenmez (no-store)', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await GET()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
