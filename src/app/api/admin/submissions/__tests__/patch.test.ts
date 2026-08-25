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
  logInsert: vi.fn(),
  rpc: vi.fn(),           // increment_coins (ödül)
  notifInsert: vi.fn(),   // notifications.insert() satırı
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ checkPermission: m.checkPermission }))
vi.mock('@/lib/utils/admin-rate-limit', () => ({ checkAdminMutationRl: m.rl }))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    rpc: (...args: unknown[]) => m.rpc(...args),
    from: (table: string) => {
      if (table === 'curriculum_outcomes') {
        const chain: Record<string, unknown> = {}
        chain.select = vi.fn(() => chain)
        chain.eq = vi.fn(() => chain)
        chain.maybeSingle = vi.fn(async () => ({ data: {
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', game: 'matematik', category: 'problemler',
          exam_ref: null, is_active: true, node_id: 'node-outcome', taxonomy_version: 'test-v1',
        }, error: null }))
        return chain
      }
      if (table === 'curriculum_nodes') {
        const nodes = [
          { id: 'node-outcome', code: 'OUT', title: 'Kazanım', game: 'matematik', category: 'problemler', exam_ref: null, parent_id: 'node-topic', node_type: 'outcome', taxonomy_version: 'test-v1', is_active: true },
          { id: 'node-topic', code: 'TOP', title: 'Konu', game: 'matematik', category: 'problemler', exam_ref: null, parent_id: 'node-unit', node_type: 'topic', taxonomy_version: 'test-v1', is_active: true },
          { id: 'node-unit', code: 'UNIT', title: 'Ünite', game: 'matematik', category: null, exam_ref: null, parent_id: 'node-course', node_type: 'unit', taxonomy_version: 'test-v1', is_active: true },
          { id: 'node-course', code: 'COURSE', title: 'Ders', game: 'matematik', category: null, exam_ref: null, parent_id: null, node_type: 'course', taxonomy_version: 'test-v1', is_active: true },
        ]
        const chain: Record<string, unknown> = {}
        chain.select = vi.fn(() => chain)
        chain.in = vi.fn(async (_column: string, ids: string[]) => ({
          data: nodes.filter((node) => ids.includes(node.id)), error: null,
        }))
        return chain
      }
      if (table === 'notifications') {
        return { insert: (row: unknown) => { m.notifInsert(row); return Promise.resolve({ error: null }) } }
      }
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
      // admin_logs
      return { insert: (row: unknown) => { m.logInsert(row); return Promise.resolve({ error: null }) } }
    },
  }),
}))

import { PATCH } from '../[id]/route'

const CLAIMED = {
  id: '11111111-2222-4333-8444-555555555555',
  user_id: 'submitter-1',
  game: 'matematik',
  category: 'problemler',
  difficulty: 3,
  content: { question: 'Soru?', options: ['a', 'b', 'c', 'd'], answer: 1 },
}

function req(body: unknown) {
  const value = body as { action?: string; outcomeId?: unknown }
  const payload = value.action === 'approve' && !Object.hasOwn(value, 'outcomeId')
    ? { ...value, outcomeId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }
    : body
  return new Request('http://localhost/api/admin/submissions/x', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }) as never
}
const params = { params: Promise.resolve({ id: CLAIMED.id }) }

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('CONTENT_GOVERNANCE_ENABLED', 'true')
  m.checkPermission.mockResolvedValue({ id: 'admin-1' })
  m.rl.mockResolvedValue(null)
  m.claim.mockResolvedValue({ data: CLAIMED, error: null })
  m.rpc.mockImplementation((name: string) => {
    if (name === 'create_governed_question') {
      return Promise.resolve({ data: {
        questionId: '99999999-9999-4999-8999-999999999999', revisionId: '88888888-8888-4888-8888-888888888888',
        revisionNo: 1, status: 'draft', replayed: false,
      }, error: null })
    }
    return Promise.resolve({ error: null })
  })
})

describe('PATCH /api/admin/submissions/[id]', () => {
  it('yetkisiz: 403, RL hiç çalışmaz', async () => {
    m.checkPermission.mockResolvedValue(null)
    const res = await PATCH(req({ action: 'approve', outcomeId: undefined }), params)
    expect(res.status).toBe(403)
    expect(m.rl).not.toHaveBeenCalled()
  })

  it('geçersiz uuid: 400', async () => {
    const res = await PATCH(req({ action: 'approve' }), { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(400)
  })

  it('approve: önce atomik claim, sonra governed draft RPC', async () => {
    const res = await PATCH(req({ action: 'approve' }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'approved', question_id: '99999999-9999-4999-8999-999999999999' })
    expect(m.subUpdate.mock.calls[0][0]).toMatchObject({ status: 'approved', reviewed_by: 'admin-1' })
    expect(m.rpc).toHaveBeenCalledWith('create_governed_question', expect.objectContaining({
      p_user_id: 'admin-1', p_request_id: CLAIMED.id,
      p_payload: expect.objectContaining({
        changeKind: 'create', outcomes: [expect.objectContaining({ primary: true })],
        source: expect.objectContaining({ kind: 'user_generated', licenseCode: 'PERMISSION' }),
      }),
    }))
    expect(m.subUpdate.mock.calls[1][0]).toEqual({ question_id: '99999999-9999-4999-8999-999999999999' })
    expect(m.logInsert).toHaveBeenCalled()
  })

  it('governance açıkken governed draft oluşturur', async () => {
    const outcomeId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const questionId = '99999999-9999-4999-8999-999999999999'
    m.rpc
      .mockResolvedValueOnce({ data: { questionId, revisionId: '88888888-8888-4888-8888-888888888888', revisionNo: 1, status: 'draft', replayed: false }, error: null })
      .mockResolvedValueOnce({ error: null })
    const res = await PATCH(req({ action: 'approve', outcomeId }), params)
    expect(res.status).toBe(200)
    expect(m.rpc).toHaveBeenNthCalledWith(1, 'create_governed_question', expect.objectContaining({
      p_user_id: 'admin-1', p_request_id: CLAIMED.id,
      p_payload: expect.objectContaining({
        changeKind: 'create', outcomes: [{ outcomeId, weight: 1, primary: true }],
        source: expect.objectContaining({ kind: 'user_generated', licenseCode: 'PERMISSION' }),
      }),
    }))
    expect(await res.json()).toEqual({ status: 'approved', question_id: questionId })
  })

  it('kazanımsız onayı claim etmeden reddeder', async () => {
    const res = await PATCH(req({ action: 'approve', outcomeId: undefined }), params)
    expect(res.status).toBe(400)
    expect(m.claim).not.toHaveBeenCalled()
  })

  it('approve: gönderene coin ödülü (increment_coins) + onay bildirimi', async () => {
    await PATCH(req({ action: 'approve' }), params)
    expect(m.rpc).toHaveBeenCalledWith('increment_coins', { p_user_id: 'submitter-1', p_amount: 50 })
    expect(m.notifInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'submitter-1', type: 'submission_approved' }),
    )
  })

  it('approve + ödül RPC hata: bildirim +50 VAAT ETMEZ (Codex P3)', async () => {
    m.rpc
      .mockResolvedValueOnce({ data: {
        questionId: '99999999-9999-4999-8999-999999999999', revisionId: '88888888-8888-4888-8888-888888888888',
        revisionNo: 1, status: 'draft', replayed: false,
      }, error: null })
      .mockResolvedValueOnce({ error: { message: 'rpc patladı' } })
    await PATCH(req({ action: 'approve' }), params)
    const notif = m.notifInsert.mock.calls[0][0] as { body: string }
    expect(notif.body).not.toContain('50')
    expect(notif.body).toContain('kalite inceleme taslağına alındı')
  })

  it('reject: ödül YOK, gerekçeli red bildirimi gönderilir', async () => {
    await PATCH(req({ action: 'reject', note: 'Telifli içerik' }), params)
    expect(m.rpc).not.toHaveBeenCalled()
    expect(m.notifInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'submitter-1', type: 'submission_rejected', body: expect.stringContaining('Telifli') }),
    )
  })

  it('YARIŞ (Codex P1 regression): claim kazanılamazsa 409 ve insert ASLA çağrılmaz', async () => {
    m.claim.mockResolvedValue({ data: null, error: null })
    const res = await PATCH(req({ action: 'approve' }), params)
    expect(res.status).toBe(409)
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('reject: soru OLUŞTURULMAZ, claim patch\'inde not var', async () => {
    const res = await PATCH(req({ action: 'reject', note: 'Telifli içerik' }), params)
    expect(res.status).toBe(200)
    expect(m.rpc).not.toHaveBeenCalled()
    expect(m.subUpdate.mock.calls[0][0]).toMatchObject({ status: 'rejected', review_note: 'Telifli içerik' })
  })

  it('governed draft RPC düşerse: claim GERİ ALINIR (pending) + 500', async () => {
    m.rpc.mockResolvedValueOnce({ data: null, error: { code: '23505' } })
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

  it('governance kapalıyken claim veya RPC çalıştırmadan 503 döner', async () => {
    vi.stubEnv('CONTENT_GOVERNANCE_ENABLED', 'false')
    const res = await PATCH(req({ action: 'approve', outcomeId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }), params)
    expect(res.status).toBe(503)
    expect(m.claim).not.toHaveBeenCalled()
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('governance kapalıyken reject claim ile tamamlanır, RPC çağırmaz', async () => {
    vi.stubEnv('CONTENT_GOVERNANCE_ENABLED', 'false')
    const res = await PATCH(req({ action: 'reject', note: 'Telifli içerik' }), params)
    expect(res.status).toBe(200)
    expect(m.subUpdate.mock.calls[0][0]).toMatchObject({ status: 'rejected', review_note: 'Telifli içerik' })
    expect(m.rpc).not.toHaveBeenCalled()
  })
})
