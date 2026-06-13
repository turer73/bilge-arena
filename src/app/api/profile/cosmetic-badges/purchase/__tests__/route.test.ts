/**
 * POST /api/profile/cosmetic-badges/purchase — coin'le kozmetik rozet alma.
 * Fiyat DB'den (cosmetic_badges, yalnız yayında); atomik RPC; 0-satır ayrımı.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  ipCheck: vi.fn(),
  userCheck: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  badgeRead: vi.fn(),
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
    from: (table: string) =>
      table === 'cosmetic_badges'
        ? { select: () => ({ eq: () => ({ maybeSingle: m.badgeRead }) }) }
        : { select: () => ({ eq: () => ({ single: m.profileRead }) }) },
  }),
}))

import { POST } from '../route'

function req(body: unknown) {
  return new Request('http://localhost/api/profile/cosmetic-badges/purchase', {
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
  m.badgeRead.mockResolvedValue({ data: { coin_cost: 500, is_published: true } })
  m.rpc.mockResolvedValue({ data: [{ new_balance: 520, new_owned: ['sampiyon'] }], error: null })
})

describe('POST /api/profile/cosmetic-badges/purchase', () => {
  it('misafir: 401', async () => {
    m.getUser.mockResolvedValue({ data: { user: null } })
    expect((await POST(req({ badgeId: 'sampiyon' }))).status).toBe(401)
  })

  it('geçersiz/yok rozet: 404', async () => {
    m.badgeRead.mockResolvedValue({ data: null })
    expect((await POST(req({ badgeId: 'yok' }))).status).toBe(404)
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('yayında değil: 404', async () => {
    m.badgeRead.mockResolvedValue({ data: { coin_cost: 500, is_published: false } })
    expect((await POST(req({ badgeId: 'taslak' }))).status).toBe(404)
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('başarılı: DB fiyatıyla atomik RPC', async () => {
    const res = await POST(req({ badgeId: 'sampiyon' }))
    expect(res.status).toBe(200)
    expect(m.rpc).toHaveBeenCalledWith('purchase_cosmetic_badge', {
      p_user_id: 'u1',
      p_badge_id: 'sampiyon',
      p_cost: 500,
    })
  })

  it('0 satır + zaten sahip: 400', async () => {
    m.rpc.mockResolvedValue({ data: [], error: null })
    m.profileRead.mockResolvedValue({ data: { coin_balance: 999, owned_cosmetic_badges: ['sampiyon'] } })
    const res = await POST(req({ badgeId: 'sampiyon' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('zaten sahipsiniz')
  })

  it('0 satır + yetersiz coin: 402', async () => {
    m.rpc.mockResolvedValue({ data: [], error: null })
    m.profileRead.mockResolvedValue({ data: { coin_balance: 10, owned_cosmetic_badges: [] } })
    expect((await POST(req({ badgeId: 'sampiyon' }))).status).toBe(402)
  })

  it('IP limiti auth\'tan önce: 429', async () => {
    m.ipCheck.mockResolvedValue({ success: false, retryAfter: 60 })
    expect((await POST(req({ badgeId: 'sampiyon' }))).status).toBe(429)
    expect(m.getUser).not.toHaveBeenCalled()
  })
})
