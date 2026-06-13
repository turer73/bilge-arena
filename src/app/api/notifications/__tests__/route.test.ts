/**
 * Bilge Arena: /api/notifications (GET liste) + /read (POST okundu).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  listResult: vi.fn(),
  svcUpdate: vi.fn(),
  eqChain: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: m.getUser },
    from: () => ({
      select: () => ({ order: () => ({ limit: () => Promise.resolve(m.listResult()) }) }),
    }),
  }),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      update: (patch: unknown) => {
        m.svcUpdate(patch)
        // .eq('user_id').eq('is_read'|'id') zinciri — son await sonucu
        const second = Object.assign(Promise.resolve({ error: null }), { eq: () => { m.eqChain(); return Promise.resolve({ error: null }) } })
        return { eq: () => second }
      },
    }),
  }),
}))

import { GET } from '../route'
import { POST } from '../read/route'

function readReq(body: unknown) {
  return new Request('http://localhost/api/notifications/read', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  m.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  m.listResult.mockReturnValue({
    data: [
      { id: 'n1', type: 'submission_approved', title: 'A', body: null, link: null, is_read: false, created_at: 't' },
      { id: 'n2', type: 'submission_rejected', title: 'B', body: null, link: null, is_read: true, created_at: 't' },
    ],
    error: null,
  })
})

describe('GET /api/notifications', () => {
  it('misafir: 401', async () => {
    m.getUser.mockResolvedValue({ data: { user: null } })
    expect((await GET()).status).toBe(401)
  })

  it('liste + okunmamış sayısı', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.notifications).toHaveLength(2)
    expect(data.unread).toBe(1)
  })

  it('sorgu hatası: 500', async () => {
    m.listResult.mockReturnValue({ data: null, error: { code: '42P01' } })
    expect((await GET()).status).toBe(500)
  })
})

describe('POST /api/notifications/read', () => {
  it('misafir: 401', async () => {
    m.getUser.mockResolvedValue({ data: { user: null } })
    expect((await POST(readReq({ all: true }))).status).toBe(401)
  })

  it('all:true → güncelleme (is_read=true)', async () => {
    const res = await POST(readReq({ all: true }))
    expect(res.status).toBe(200)
    expect(m.svcUpdate).toHaveBeenCalledWith({ is_read: true })
  })

  it('geçerli id → güncelleme', async () => {
    const res = await POST(readReq({ id: '11111111-2222-4333-8444-555555555555' }))
    expect(res.status).toBe(200)
    expect(m.svcUpdate).toHaveBeenCalled()
  })

  it('id de all de yoksa: 400', async () => {
    const res = await POST(readReq({}))
    expect(res.status).toBe(400)
    expect(m.svcUpdate).not.toHaveBeenCalled()
  })

  it('geçersiz uuid: 400', async () => {
    const res = await POST(readReq({ id: 'abc' }))
    expect(res.status).toBe(400)
  })
})
