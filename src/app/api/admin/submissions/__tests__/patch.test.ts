/**
 * Bilge Arena: PATCH /api/admin/submissions/[id] — moderasyon akışı.
 * Codex P1 sonrası akış: ATOMIK CLAIM önce (UPDATE..WHERE status='pending'
 * RETURNING) → kazanamayan 409 alır ve questions'a ASLA insert etmez;
 * insert düşerse claim geri alınır (pending'e dönüş).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  rl: vi.fn(),
  claim: vi.fn(),         // update().eq().eq().select().maybeSingle() sonucu
  subUpdate: vi.fn(),     // question_submissions.update() patch'leri (sırayla)
  qInsert: vi.fn(),       // questions.insert() satırı
  qInsertResult: vi.fn(), // questions insert -> {data,error} (test başına ayarlanır)
  logInsert: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ checkPermission: m.checkPermission }))
vi.mock('@/lib/utils/admin-rate-limit', () => ({ checkAdminMutationRl: m.rl }))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'question_submissions') {
        return {
          update: (patch: unknown) => {
            m.subUpdate(patch)
            // Zincir hem await edilebilir (rollback / question_id follow-up)
            // hem .eq().select().maybeSingle() (atomik claim) destekler
            const eq2 = Object.assign(Promise.resolve({ error: null }), {
              select: () => ({ maybeSingle: m.claim }),
            })
            const eq1 = Object.assign(Promise.resolve({ error: null }), {
              eq: () => eq2,
            })
            return { eq: () => eq1 }
          },
        }
      }
      if (table === 'questions') {
        return {
          insert: (row: unknown) => {
            m.qInsert(row)
            return { select: () => ({ single: () => Promise.resolve(m.qInsertResult()) }) }
          },
        }
      }
      // admin_logs
      return { insert: (row: unknown) => { m.logInsert(row); return Promise.resolve({ error: null }) } }
    },
  }),
}))

import { PATCH } from '../[id]/route'

const CLAIMED = {
  id: '11111111-2222-4333-8444-555555555555',
  game: 'matematik',
  category: 'problemler',
  difficulty: 3,
  content: { question: 'Soru?', options: ['a', 'b', 'c', 'd'], answer: 1 },
}

function req(body: unknown) {
  return new Request('http://localhost/api/admin/submissions/x', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never
}
const params = { params: Promise.resolve({ id: CLAIMED.id }) }

beforeEach(() => {
  vi.clearAllMocks()
  m.checkPermission.mockResolvedValue({ id: 'admin-1' })
  m.rl.mockResolvedValue(null)
  m.claim.mockResolvedValue({ data: CLAIMED, error: null })
  m.qInsertResult.mockReturnValue({ data: { id: 'q-new' }, error: null })
})

describe('PATCH /api/admin/submissions/[id]', () => {
  it('yetkisiz: 403, RL hiç çalışmaz', async () => {
    m.checkPermission.mockResolvedValue(null)
    const res = await PATCH(req({ action: 'approve' }), params)
    expect(res.status).toBe(403)
    expect(m.rl).not.toHaveBeenCalled()
  })

  it('geçersiz uuid: 400', async () => {
    const res = await PATCH(req({ action: 'approve' }), { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(400)
  })

  it('approve: önce atomik claim, sonra questions insert (source=ugc, pasif)', async () => {
    const res = await PATCH(req({ action: 'approve' }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'approved', question_id: 'q-new' })
    expect(m.subUpdate.mock.calls[0][0]).toMatchObject({ status: 'approved', reviewed_by: 'admin-1' })
    expect(m.qInsert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'ugc', is_active: false, game: 'matematik' }),
    )
    expect(m.subUpdate.mock.calls[1][0]).toEqual({ question_id: 'q-new' })
    expect(m.logInsert).toHaveBeenCalled()
  })

  it('YARIŞ (Codex P1 regression): claim kazanılamazsa 409 ve insert ASLA çağrılmaz', async () => {
    m.claim.mockResolvedValue({ data: null, error: null })
    const res = await PATCH(req({ action: 'approve' }), params)
    expect(res.status).toBe(409)
    expect(m.qInsert).not.toHaveBeenCalled()
  })

  it('reject: soru OLUŞTURULMAZ, claim patch\'inde not var', async () => {
    const res = await PATCH(req({ action: 'reject', note: 'Telifli içerik' }), params)
    expect(res.status).toBe(200)
    expect(m.qInsert).not.toHaveBeenCalled()
    expect(m.subUpdate.mock.calls[0][0]).toMatchObject({ status: 'rejected', review_note: 'Telifli içerik' })
  })

  it('insert düşerse: claim GERİ ALINIR (pending) + 500', async () => {
    m.qInsertResult.mockReturnValue({ data: null, error: { code: '23505' } })
    const res = await PATCH(req({ action: 'approve' }), params)
    expect(res.status).toBe(500)
    const rollback = m.subUpdate.mock.calls.find(
      (c) => (c[0] as { status?: string }).status === 'pending',
    )
    expect(rollback).toBeTruthy()
    expect((rollback![0] as { reviewed_by?: unknown }).reviewed_by).toBeNull()
  })

  it('geçersiz action: 400', async () => {
    const res = await PATCH(req({ action: 'delete' }), params)
    expect(res.status).toBe(400)
  })
})
