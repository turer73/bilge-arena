/**
 * POST /api/profile/avatar-decorations/purchase — coin'le avatar süsü alma.
 * nameplate purchase deseninin aynası: RL sırası, auth, katalog doğrulama,
 * atomik RPC, 0-satır ayrımı (zaten-sahip vs yetersiz-coin).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  ipCheck: vi.fn(),
  userCheck: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  profileRead: vi.fn(),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: (name: string) => ({
    check: name.includes('-ip') ? m.ipCheck : m.userCheck,
  }),
}))
vi.mock('@/lib/utils/client-ip', () => ({ getClientIp: () => '1.2.3.4' }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: m.getUser } }),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    rpc: m.rpc,
    from: () => ({ select: () => ({ eq: () => ({ single: m.profileRead }) }) }),
  }),
}))

import { POST } from '../route'

function req(body: unknown) {
  return new Request('http://localhost/api/profile/avatar-decorations/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  m.ipCheck.mockResolvedValue({ success: true })
  m.userCheck.mockResolvedValue({ success: true })
  m.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  m.rpc.mockResolvedValue({
    data: [{ new_balance: 850, new_owned: ['aura'] }],
    error: null,
  })
})

describe('POST /api/profile/avatar-decorations/purchase', () => {
  it('misafir: 401', async () => {
    m.getUser.mockResolvedValue({ data: { user: null } })
    expect((await POST(req({ decorationId: 'aura' }))).status).toBe(401)
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('geçersiz id: 404', async () => {
    expect((await POST(req({ decorationId: 'olmayan' }))).status).toBe(404)
  })

  it('ücretsiz süs satın alınamaz: 400', async () => {
    expect((await POST(req({ decorationId: 'konfeti' }))).status).toBe(400)
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('başarılı: atomik RPC doğru parametrelerle', async () => {
    const res = await POST(req({ decorationId: 'aura' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toMatchObject({ success: true, decorationId: 'aura', coin_balance: 850 })
    expect(m.rpc).toHaveBeenCalledWith('purchase_avatar_decoration', {
      p_user_id: 'u1',
      p_decoration_id: 'aura',
      p_cost: 150,
    })
  })

  it('0 satır + zaten sahip: 400', async () => {
    m.rpc.mockResolvedValue({ data: [], error: null })
    m.profileRead.mockResolvedValue({ data: { coin_balance: 999, owned_avatar_decorations: ['aura'] } })
    const res = await POST(req({ decorationId: 'aura' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('zaten sahipsiniz')
  })

  it('0 satır + yetersiz coin: 402', async () => {
    m.rpc.mockResolvedValue({ data: [], error: null })
    m.profileRead.mockResolvedValue({ data: { coin_balance: 10, owned_avatar_decorations: [] } })
    const res = await POST(req({ decorationId: 'aura' }))
    expect(res.status).toBe(402)
    expect((await res.json()).error).toContain('Yetersiz coin')
  })

  it("IP limiti auth'tan önce: 429", async () => {
    m.ipCheck.mockResolvedValue({ success: false, retryAfter: 60 })
    expect((await POST(req({ decorationId: 'aura' }))).status).toBe(429)
    expect(m.getUser).not.toHaveBeenCalled()
  })

  it('RPC hatası: 500', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect((await POST(req({ decorationId: 'aura' }))).status).toBe(500)
  })
})
