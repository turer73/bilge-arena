import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }))
vi.mock('../context', () => ({
  requireTytSocialExamRoleContext: mocks.context,
  tytSocialExamRoleRpc: mocks.rpc,
}))

import { POST as prepare } from '../prepare/route'
import { POST as review } from '../review/route'

const USER = '11111111-1111-4111-8111-111111111111'
const REVISION = '22222222-2222-4222-8222-222222222222'
const CANDIDATE = '33333333-3333-4333-8333-333333333333'
const REQUEST = '44444444-4444-4444-8444-444444444444'
const context = { ok: true as const, userId: USER, client: {} }
const result = {
  candidateId: CANDIDATE,
  revisionId: REVISION,
  policyVersion: 'tyt-social-2026-v1',
  examRole: 'common_history',
  status: 'pending',
  replayed: false,
}

function post(path: string, body: unknown, idempotencyKey = REQUEST) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.mockResolvedValue(context)
  mocks.rpc.mockResolvedValue({ data: result, error: null })
})

describe('TYT Social exam-role admin routes', () => {
  it('binds prepare to the server actor and exact migration 205 arguments', async () => {
    const response = await prepare(post('/api/admin/content-quality/tyt-social/exam-role/prepare', {
      revisionId: REVISION, examRole: 'common_history', rationale: 'Kaynak ve rol uyumu doğrulandı.', requestId: REQUEST,
    }))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual(result)
    expect(mocks.context).toHaveBeenCalledWith(expect.any(Request), 'content.prepare')
    expect(mocks.rpc).toHaveBeenCalledWith(context.client, 'prepare_tyt_social_exam_role', {
      p_actor_user_id: USER, p_revision_id: REVISION, p_exam_role: 'common_history',
      p_rationale: 'Kaynak ve rol uyumu doğrulandı.', p_request_id: REQUEST,
    })
  })

  it('requires strict UUID/rationale input and an exact idempotency header match', async () => {
    const base = { revisionId: REVISION, examRole: 'common_history', rationale: 'Yeterli gerekçe burada.', requestId: REQUEST }
    expect((await prepare(post('/prepare', { ...base, unexpected: true }))).status).toBe(400)
    expect((await prepare(post('/prepare', base, '55555555-5555-4555-8555-555555555555'))).status).toBe(400)
    expect((await prepare(post('/prepare', { ...base, rationale: 'kısa' }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('selects review permission from stage and sends the review contract', async () => {
    const body = {
      candidateId: CANDIDATE, stage: 2, decision: 'approved',
      rationale: 'Bağımsız ikinci inceleme tamamlandı.', requestId: REQUEST,
    }
    const response = await review(post('/api/admin/content-quality/tyt-social/exam-role/review', body))
    expect(response.status).toBe(200)
    expect(mocks.context).toHaveBeenCalledWith(expect.any(Request), 'content.review.stage2')
    expect(mocks.rpc).toHaveBeenCalledWith(context.client, 'review_tyt_social_exam_role', {
      p_actor_user_id: USER, p_candidate_id: CANDIDATE, p_stage: 2,
      p_decision: 'approved', p_rationale: body.rationale, p_request_id: REQUEST,
    })
  })

  it('returns generic fail-closed DB errors and rejects malformed RPC output', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'secret detail' } })
    const failed = await prepare(post('/prepare', {
      revisionId: REVISION, examRole: 'common_history', rationale: 'Kaynak ve rol uyumu doğrulandı.', requestId: REQUEST,
    }))
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({ error: 'Exam-role hazırlığı kaydedilemedi' })

    mocks.rpc.mockResolvedValueOnce({ data: { ...result, internalNote: 'private' }, error: null })
    const malformed = await prepare(post('/prepare', {
      revisionId: REVISION, examRole: 'common_history', rationale: 'Kaynak ve rol uyumu doğrulandı.', requestId: REQUEST,
    }))
    expect(malformed.status).toBe(500)
    expect(await malformed.json()).toEqual({ error: 'Exam-role hazırlığı kaydedilemedi' })
  })
})
