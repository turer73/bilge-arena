/**
 * POST /api/profile/nameplates/select — seçili nameplate'i DB'ye yaz.
 * Sahiplik guard'ı: ücretsiz herkese açık; ücretli + sahipsiz → 403
 * (localStorage-bypass'ın DB karşılığı). Seçim sıralamada görünür.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  userCheck: vi.fn(),
  getUser: vi.fn(),
  profileRead: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({ check: m.userCheck }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: m.getUser } }),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: m.profileRead }) }),
      update: (payload: unknown) => {
        m.update(payload)
        return { eq: m.updateEq }
      },
    }),
  }),
}))

import { POST } from '../route'

function req(body: unknown) {
  return new Request('http://localhost/api/profile/nameplates/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  m.userCheck.mockResolvedValue({ success: true })
  m.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  m.profileRead.mockResolvedValue({ data: { owned_nameplates: ['none', 'mavi-akim'] } })
  m.updateEq.mockResolvedValue({ error: null })
})

describe('POST /api/profile/nameplates/select', () => {
  it('misafir: 401', async () => {
    m.getUser.mockResolvedValue({ data: { user: null } })
    expect((await POST(req({ nameplateId: 'mavi-akim' }))).status).toBe(401)
  })

  it('geçersiz id: 404', async () => {
    expect((await POST(req({ nameplateId: 'olmayan' }))).status).toBe(404)
    expect(m.update).not.toHaveBeenCalled()
  })

  it('ücretsiz panel: sahiplik gerekmez, 200 + update', async () => {
    const res = await POST(req({ nameplateId: 'gece' }))
    expect(res.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith({ selected_nameplate: 'gece' })
  })

  it('ücretli + sahip: 200', async () => {
    const res = await POST(req({ nameplateId: 'mavi-akim' }))
    expect(res.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith({ selected_nameplate: 'mavi-akim' })
  })

  it('ücretli + sahipsiz: 403, update yapılmaz', async () => {
    m.profileRead.mockResolvedValue({ data: { owned_nameplates: ['none'] } })
    const res = await POST(req({ nameplateId: 'mavi-akim' }))
    expect(res.status).toBe(403)
    expect(m.update).not.toHaveBeenCalled()
  })
})
