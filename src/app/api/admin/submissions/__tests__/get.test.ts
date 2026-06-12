/**
 * Bilge Arena: GET /api/admin/submissions — moderasyon kuyruğu listesi.
 * Permission, status filtresi (geçersiz → pending default), hata yolu.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  eqStatus: vi.fn(),
  result: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ checkPermission: m.checkPermission }))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: (col: string, val: string) => {
          m.eqStatus(val)
          return { order: () => ({ limit: () => Promise.resolve(m.result()) }) }
        },
      }),
    }),
  }),
}))

import { GET } from '../route'

function req(qs = '') {
  return new Request(`http://localhost/api/admin/submissions${qs}`) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  m.checkPermission.mockResolvedValue({ id: 'admin-1' })
  m.result.mockReturnValue({ data: [{ id: 's1' }], error: null })
})

describe('GET /api/admin/submissions', () => {
  it('yetkisiz: 403', async () => {
    m.checkPermission.mockResolvedValue(null)
    expect((await GET(req())).status).toBe(403)
  })

  it('default: pending filtresiyle listeler', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ submissions: [{ id: 's1' }] })
    expect(m.eqStatus).toHaveBeenCalledWith('pending')
  })

  it('status=approved geçerli filtre olarak geçer', async () => {
    await GET(req('?status=approved'))
    expect(m.eqStatus).toHaveBeenCalledWith('approved')
  })

  it('geçersiz status: pending\'e düşer (injection guard)', async () => {
    await GET(req('?status=__bozuk__'))
    expect(m.eqStatus).toHaveBeenCalledWith('pending')
  })

  it('sorgu hatası: 500', async () => {
    m.result.mockReturnValue({ data: null, error: { code: '42P01' } })
    expect((await GET(req())).status).toBe(500)
  })
})
