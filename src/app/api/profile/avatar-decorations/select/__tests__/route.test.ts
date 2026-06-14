/**
 * POST /api/profile/avatar-decorations/select — seçili süs(ler)i DB'ye yaz (ÇOKLU).
 * Her id guard: ücretsiz (konfeti) herkese açık; ücretli + sahipsiz → 403 (kısmi
 * yazma yok). Boş dizi = süssüz. Personel hepsini seçebilir. Seçim sıralamada görünür.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  ipCheck: vi.fn(),
  userCheck: vi.fn(),
  getUser: vi.fn(),
  profileRead: vi.fn(),
  rolesRead: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: (name: string) => ({ check: name.includes('-ip') ? m.ipCheck : m.userCheck }),
}))
vi.mock('@/lib/utils/client-ip', () => ({ getClientIp: () => '1.2.3.4' }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: m.getUser } }),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) =>
      table === 'user_roles'
        ? { select: () => ({ eq: () => ({ limit: m.rolesRead }) }) }
        : {
            select: () => ({ eq: () => ({ single: m.profileRead }) }),
            update: (payload: unknown) => {
              m.update(payload)
              return { eq: m.updateEq }
            },
          },
  }),
}))

import { POST } from '../route'

function req(body: unknown) {
  return new Request('http://localhost/api/profile/avatar-decorations/select', {
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
  m.profileRead.mockResolvedValue({ data: { owned_avatar_decorations: ['aura'] } })
  m.rolesRead.mockResolvedValue({ data: [] })
  m.updateEq.mockResolvedValue({ error: null })
})

describe('POST /api/profile/avatar-decorations/select', () => {
  it('misafir: 401', async () => {
    m.getUser.mockResolvedValue({ data: { user: null } })
    expect((await POST(req({ decorationIds: ['konfeti'] }))).status).toBe(401)
  })

  it("IP limiti auth'tan önce: 429, getUser çağrılmaz", async () => {
    m.ipCheck.mockResolvedValue({ success: false, retryAfter: 60 })
    expect((await POST(req({ decorationIds: ['konfeti'] }))).status).toBe(429)
    expect(m.getUser).not.toHaveBeenCalled()
  })

  it('dizi değil / eksik gövde: 400', async () => {
    expect((await POST(req({ decorationIds: 'konfeti' }))).status).toBe(400)
  })

  it('geçersiz id içeriyorsa: 404, update yapılmaz', async () => {
    expect((await POST(req({ decorationIds: ['konfeti', 'olmayan'] }))).status).toBe(404)
    expect(m.update).not.toHaveBeenCalled()
  })

  it('boş dizi (süssüz): 200 + update []', async () => {
    const res = await POST(req({ decorationIds: [] }))
    expect(res.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith({ selected_avatar_decorations: [] })
  })

  it('ücretsiz süs (konfeti): sahiplik gerekmez, 200', async () => {
    const res = await POST(req({ decorationIds: ['konfeti'] }))
    expect(res.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith({ selected_avatar_decorations: ['konfeti'] })
  })

  it('ücretli + sahip (aura) + ücretsiz (konfeti): 200', async () => {
    const res = await POST(req({ decorationIds: ['aura', 'konfeti'] }))
    expect(res.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith({ selected_avatar_decorations: ['aura', 'konfeti'] })
  })

  it('ücretli + sahipsiz (crown): 403, update yapılmaz', async () => {
    const res = await POST(req({ decorationIds: ['crown'] }))
    expect(res.status).toBe(403)
    expect(m.update).not.toHaveBeenCalled()
  })

  it('tek sahipsiz id tüm isteği reddeder (kısmi yazma yok)', async () => {
    const res = await POST(req({ decorationIds: ['konfeti', 'crown'] }))
    expect(res.status).toBe(403)
    expect(m.update).not.toHaveBeenCalled()
  })

  it('aynı id tekrarı dedup edilir', async () => {
    const res = await POST(req({ decorationIds: ['konfeti', 'konfeti'] }))
    expect(res.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith({ selected_avatar_decorations: ['konfeti'] })
  })

  it('personel (rol sahibi): sahipsiz ücretli süs seçilebilir', async () => {
    m.rolesRead.mockResolvedValue({ data: [{ role_id: 'r1' }] })
    m.profileRead.mockResolvedValue({ data: { owned_avatar_decorations: [] } })
    const res = await POST(req({ decorationIds: ['crown', 'kanat'] }))
    expect(res.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith({ selected_avatar_decorations: ['crown', 'kanat'] })
  })

  it('update hatası: 500', async () => {
    m.updateEq.mockResolvedValue({ error: { message: 'boom' } })
    expect((await POST(req({ decorationIds: ['konfeti'] }))).status).toBe(500)
  })
})
