/**
 * Bilge Arena: PATCH /api/admin/submissions/[id] — moderasyon akışı.
 * approve→questions'a pasif insert + submission güncelleme; reject;
 * çifte-değerlendirme 409; permission/RL.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  rl: vi.fn(),
  subSingle: vi.fn(),
  qInsert: vi.fn(),
  subUpdate: vi.fn(),
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
          select: () => ({ eq: () => ({ single: m.subSingle }) }),
          update: (patch: unknown) => ({
            eq: () => ({
              eq: () => {
                m.subUpdate(patch)
                return Promise.resolve({ error: null })
              },
            }),
          }),
        }
      }
      if (table === 'questions') {
        return {
          insert: (row: unknown) => {
            m.qInsert(row)
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'q-new' }, error: null }) }) }
          },
        }
      }
      // admin_logs
      return { insert: (row: unknown) => { m.logInsert(row); return Promise.resolve({ error: null }) } }
    },
  }),
}))

import { PATCH } from '../[id]/route'

const SUB = {
  id: '11111111-2222-4333-8444-555555555555',
  user_id: 'u1',
  game: 'matematik',
  category: 'problemler',
  difficulty: 3,
  content: { question: 'Soru?', options: ['a', 'b', 'c', 'd'], answer: 1 },
  status: 'pending',
}

function req(body: unknown) {
  return new Request('http://localhost/api/admin/submissions/x', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never
}
const params = { params: Promise.resolve({ id: SUB.id }) }

beforeEach(() => {
  vi.clearAllMocks()
  m.checkPermission.mockResolvedValue({ id: 'admin-1' })
  m.rl.mockResolvedValue(null)
  m.subSingle.mockResolvedValue({ data: SUB, error: null })
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

  it('approve: questions\'a source=ugc + is_active=false insert, submission approved', async () => {
    const res = await PATCH(req({ action: 'approve' }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'approved', question_id: 'q-new' })
    expect(m.qInsert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'ugc', is_active: false, game: 'matematik' }),
    )
    expect(m.subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', reviewed_by: 'admin-1', question_id: 'q-new' }),
    )
    expect(m.logInsert).toHaveBeenCalled()
  })

  it('reject: soru OLUŞTURULMAZ, not kaydedilir', async () => {
    const res = await PATCH(req({ action: 'reject', note: 'Telifli içerik' }), params)
    expect(res.status).toBe(200)
    expect(m.qInsert).not.toHaveBeenCalled()
    expect(m.subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected', review_note: 'Telifli içerik' }),
    )
  })

  it('zaten değerlendirilmiş: 409', async () => {
    m.subSingle.mockResolvedValue({ data: { ...SUB, status: 'approved' }, error: null })
    const res = await PATCH(req({ action: 'reject' }), params)
    expect(res.status).toBe(409)
  })

  it('geçersiz action: 400', async () => {
    const res = await PATCH(req({ action: 'delete' }), params)
    expect(res.status).toBe(400)
  })
})
