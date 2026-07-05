import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

// JWT_SECRET module-load'da okunur -> import'tan ONCE set et (hoisted).
vi.hoisted(() => {
  process.env.BILGE_ARENA_REALTIME_JWT_SECRET = 'test-secret'
})

const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

import { GET } from '../route'

function b64urlDecode(s: string): string {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
}

describe('GET /api/realtime/token', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('imzali HS256 token dondurur — payload role/sub/exp dogru', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-42' } } })
    const res = await GET()
    expect(res.status).toBe(200)
    const { token } = await res.json()

    const [header, payload, sig] = token.split('.')
    // Header: HS256
    expect(JSON.parse(b64urlDecode(header)).alg).toBe('HS256')
    // Payload: role=authenticated, sub=user.id, exp=iat+3600
    const claims = JSON.parse(b64urlDecode(payload))
    expect(claims.role).toBe('authenticated')
    expect(claims.sub).toBe('user-42')
    expect(claims.exp - claims.iat).toBe(3600)

    // Imza test-secret ile dogrulanabilir olmali (forge-koruma)
    const expectedSig = createHmac('sha256', 'test-secret')
      .update(`${header}.${payload}`)
      .digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(sig).toBe(expectedSig)
  })

  it('Cache-Control private header set eder', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await GET()
    expect(res.headers.get('Cache-Control')).toContain('private')
  })
})
