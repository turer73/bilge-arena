/**
 * Admin kozmetik rozet CRUD — GET (liste) + POST (oluştur).
 * Permission guard, Zod, yayın-görsel kuralı, admin_logs. reports test deseni.
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

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ checkPermission: m.checkPermission }))
vi.mock('@/lib/utils/admin-rate-limit', () => ({ checkAdminMutationRl: m.rlCheck }))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'admin_logs') return { insert: m.logInsert }
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
  return new Request('http://localhost/api/admin/cosmetic-badges') as unknown as NextRequest
}
function postReq(body: unknown) {
  return new Request('http://localhost/api/admin/cosmetic-badges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

const VALID = {
  slug: 'sampiyon-2026',
  name: 'Şampiyon 2026',
  coinCost: 500,
  iconUrl: 'https://cdn.example.com/sampiyon/icon.png',
  isPublished: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  m.checkPermission.mockResolvedValue(ADMIN)
  m.rlCheck.mockResolvedValue(null)
  m.listResult.mockResolvedValue({ data: [], error: null })
  m.insertResult.mockResolvedValue({ data: { id: 'b1' }, error: null })
  m.logInsert.mockResolvedValue({ error: null })
})

describe('GET /api/admin/cosmetic-badges', () => {
  it('izin yoksa 403', async () => {
    m.checkPermission.mockResolvedValue(null)
    const res = await GET(getReq())
    expect(res.status).toBe(403)
    expect(m.checkPermission).toHaveBeenCalledWith(expect.anything(), 'admin.badges.view')
  })

  it('yetkiliyse 200 + liste', async () => {
    m.listResult.mockResolvedValue({ data: [{ id: 'b1', slug: 'x' }], error: null })
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    expect((await res.json()).badges).toHaveLength(1)
  })
})

describe('POST /api/admin/cosmetic-badges', () => {
  it('izin yoksa 403', async () => {
    m.checkPermission.mockResolvedValue(null)
    const res = await POST(postReq(VALID))
    expect(res.status).toBe(403)
    expect(m.checkPermission).toHaveBeenCalledWith(expect.anything(), 'admin.badges.manage')
  })

  it('geçersiz gövde (eksik slug): 400', async () => {
    const res = await POST(postReq({ name: 'X', coinCost: 10 }))
    expect(res.status).toBe(400)
  })

  it('yayınla=true ama görsel yok: 400', async () => {
    const res = await POST(postReq({ ...VALID, iconUrl: undefined, isPublished: true }))
    expect(res.status).toBe(400)
  })

  it('geçerli istek: 201 + admin_log', async () => {
    const res = await POST(postReq(VALID))
    expect(res.status).toBe(201)
    expect((await res.json()).badge).toEqual({ id: 'b1' })
    expect(m.logInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create_cosmetic_badge', target_id: 'b1' }),
    )
  })

  it('slug çakışması (23505): 409', async () => {
    m.insertResult.mockResolvedValue({ data: null, error: { code: '23505' } })
    const res = await POST(postReq(VALID))
    expect(res.status).toBe(409)
  })
})
