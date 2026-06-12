/**
 * Bilge Arena: POST /api/profile/backgrounds/purchase — coin'le arka plan alma.
 * Frame-purchase deseninin aynası: RL sırası, auth, katalog doğrulama,
 * atomik RPC çağrısı, 0-satır ayrımı (zaten-sahip vs yetersiz-coin).
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
  return new Request('http://localhost/api/profile/backgrounds/purchase', {
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
    data: [{ new_balance: 100, new_owned: ['none', 'gece-mavisi', 'nebula'] }],
    error: null,
  })
})

describe('POST /api/profile/backgrounds/purchase', () => {
  it('misafir: 401', async () => {
    m.getUser.mockResolvedValue({ data: { user: null } })
    expect((await POST(req({ backgroundId: 'nebula' }))).status).toBe(401)
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('geçersiz id: 404', async () => {
    expect((await POST(req({ backgroundId: 'olmayan' }))).status).toBe(404)
  })

  it('ücretsiz arka plan satın alınamaz: 400', async () => {
    expect((await POST(req({ backgroundId: 'gece-mavisi' }))).status).toBe(400)
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('başarılı satın alma: atomik RPC doğru parametrelerle + güncel bakiye döner', async () => {
    const res = await POST(req({ backgroundId: 'nebula' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toMatchObject({ success: true, backgroundId: 'nebula', coin_balance: 100 })
    expect(m.rpc).toHaveBeenCalledWith('purchase_background', {
      p_user_id: 'u1',
      p_background_id: 'nebula',
      p_cost: 400,
    })
  })

  it('0 satır + zaten sahip: 400', async () => {
    m.rpc.mockResolvedValue({ data: [], error: null })
    m.profileRead.mockResolvedValue({
      data: { coin_balance: 999, owned_backgrounds: ['none', 'nebula'] },
    })
    const res = await POST(req({ backgroundId: 'nebula' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('zaten sahipsiniz')
  })

  it('0 satır + yetersiz coin: 402 + gerekli/bakiye bilgisi', async () => {
    m.rpc.mockResolvedValue({ data: [], error: null })
    m.profileRead.mockResolvedValue({
      data: { coin_balance: 50, owned_backgrounds: ['none'] },
    })
    const res = await POST(req({ backgroundId: 'nebula' }))
    expect(res.status).toBe(402)
    expect((await res.json()).error).toContain('Yetersiz coin')
  })

  it('IP limiti auth\'tan önce: 429', async () => {
    m.ipCheck.mockResolvedValue({ success: false, retryAfter: 60 })
    expect((await POST(req({ backgroundId: 'nebula' }))).status).toBe(429)
    expect(m.getUser).not.toHaveBeenCalled()
  })
})
