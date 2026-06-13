/**
 * Admin video tema CRUD — GET (liste) + POST (oluştur).
 * Permission guard, Zod doğrulama, CSS slug çakışması, yayın-varyant kuralı,
 * admin_logs kaydı. reports/route.test deseni (vi.hoisted + vi.mock).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  rlCheck: vi.fn(),
  listResult: vi.fn(),
  insertResult: vi.fn(),
  logInsert: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({}),
}))
vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: m.checkPermission,
}))
vi.mock('@/lib/utils/admin-rate-limit', () => ({
  checkAdminMutationRl: m.rlCheck,
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'admin_logs') {
        return { insert: m.logInsert }
      }
      // background_assets: GET select().order() · POST insert().select().single()
      return {
        select: () => ({ order: () => m.listResult() }),
        insert: () => ({ select: () => ({ single: m.insertResult }) }),
      }
    },
  }),
}))

import { GET, POST } from '../route'

const ADMIN = { id: 'admin-1' }

function getReq() {
  return new Request('http://localhost/api/admin/backgrounds') as unknown as NextRequest
}
function postReq(body: unknown) {
  return new Request('http://localhost/api/admin/backgrounds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

const VALID = {
  slug: 'orman-yagmuru',
  name: 'Orman Yağmuru',
  coinCost: 900,
  variants: { hd: 'https://cdn.example.com/orman/hd.mp4' },
  isPublished: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  m.checkPermission.mockResolvedValue(ADMIN)
  m.rlCheck.mockResolvedValue(null)
  m.listResult.mockResolvedValue({ data: [], error: null })
  m.insertResult.mockResolvedValue({ data: { id: 'bg-1' }, error: null })
  m.logInsert.mockResolvedValue({ error: null })
})

describe('GET /api/admin/backgrounds', () => {
  it('izin yoksa 403', async () => {
    m.checkPermission.mockResolvedValue(null)
    const res = await GET(getReq())
    expect(res.status).toBe(403)
    expect(m.checkPermission).toHaveBeenCalledWith(expect.anything(), 'admin.backgrounds.view')
  })

  it('yetkiliyse 200 + liste', async () => {
    m.listResult.mockResolvedValue({ data: [{ id: 'bg-1', slug: 'x' }], error: null })
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    expect((await res.json()).backgrounds).toHaveLength(1)
  })
})

describe('POST /api/admin/backgrounds', () => {
  it('izin yoksa 403', async () => {
    m.checkPermission.mockResolvedValue(null)
    const res = await POST(postReq(VALID))
    expect(res.status).toBe(403)
    expect(m.checkPermission).toHaveBeenCalledWith(expect.anything(), 'admin.backgrounds.manage')
  })

  it('geçersiz gövde (eksik slug): 400', async () => {
    const res = await POST(postReq({ name: 'X', coinCost: 10 }))
    expect(res.status).toBe(400)
  })

  it('CSS temasıyla çakışan slug: 409', async () => {
    const res = await POST(postReq({ ...VALID, slug: 'nebula' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('CSS')
  })

  it('yayınla=true ama varyant yok: 400', async () => {
    const res = await POST(postReq({ ...VALID, variants: {}, isPublished: true }))
    expect(res.status).toBe(400)
  })

  it('geçerli istek: 201 + admin_log', async () => {
    const res = await POST(postReq(VALID))
    expect(res.status).toBe(201)
    expect((await res.json()).background).toEqual({ id: 'bg-1' })
    expect(m.logInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create_background', target_id: 'bg-1' }),
    )
  })

  it('slug unique çakışması (23505): 409', async () => {
    m.insertResult.mockResolvedValue({ data: null, error: { code: '23505' } })
    const res = await POST(postReq(VALID))
    expect(res.status).toBe(409)
  })
})
