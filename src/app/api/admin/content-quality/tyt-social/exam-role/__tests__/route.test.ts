import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }))
vi.mock('../context', () => ({
  requireTytSocialExamRoleContext: mocks.context,
  tytSocialExamRoleRpc: mocks.rpc,
}))

import { POST as prepare } from '../prepare/route'
import { POST as review } from '../review/route'
import { GET as operations } from '../route'
import { POST as release } from '../../release/route'

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
const queue = {
  items: [{
    questionId: '55555555-5555-4555-8555-555555555555',
    revisionId: REVISION,
    publishedRevisionId: REVISION,
    revisionStatus: 'published',
    revisionCreatedAt: '2026-09-01T12:00:00.000Z',
    category: 'tarih',
    difficulty: 2,
    workflowState: 'role_prepare',
    sourcePolicyReady: true,
    sourceKind: 'official_exam',
    sourceTitle: 'Resmî sınav kitapçığı',
    licenseCode: 'OSYM-REFERENCE',
    provenanceReady: true,
    outcomeCount: 1,
    allowedRoles: ['common_history'],
    candidateId: null,
    proposedRole: null,
    candidateStatus: null,
    examRole: null,
  }],
  nextCursor: null,
  readiness: {
    policyVersion: 'tyt-social-2026-v1',
    scopeStatus: 'validating',
    diagnosticEnabled: false,
    activeQuestionCount: 1316,
    sourceApprovedQuestionCount: 0,
    sourceUnapprovedQuestionCount: 1316,
    sourceEvidenceSha256: 'a'.repeat(64),
    sourceReady: false,
    assignedQuestionCount: 0,
    unassignedQuestionCount: 1316,
    invalidRoleCount: 0,
    invalidApprovalProvenanceCount: 0,
    roleCounts: {
      common_history: 0, common_geography: 0, common_philosophy: 0,
      standard_religion: 0, alternate_philosophy: 0,
    },
    candidatePolicyReady: false,
    masteryReaderReady: true,
    officialSectionComposerReady: true,
    mappingTotal: 1316,
    mappingMapped: 1316,
    mappingUnmapped: 0,
    mappingScopeMismatch: 0,
    mappingNodeOrphan: 0,
    mappingOutcomeOrphan: 0,
    mappingPrimaryMismatch: 0,
    mappingEmptyOutcome: 0,
    mappingReady: true,
    immutableSourceEvidenceRecorded: false,
    reviewReady: false,
    releaseReady: false,
  },
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

  it('lists a privacy-minimised operational queue through the server actor', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: queue, error: null })
    const response = await operations(new Request(
      'http://localhost/api/admin/content-quality/tyt-social/exam-role?state=role_prepare&limit=25',
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual(queue)
    expect(mocks.context).toHaveBeenCalledWith(
      expect.any(Request),
      ['content.prepare', 'content.review.stage1', 'content.review.stage2', 'content.publish'],
      expect.anything(),
    )
    expect(mocks.rpc).toHaveBeenCalledWith(context.client, 'get_tyt_social_release_operations', {
      p_actor_user_id: USER, p_state: 'role_prepare', p_limit: 25, p_cursor: null,
    })
  })

  it('rejects unknown queue parameters and fails closed on private RPC fields', async () => {
    expect((await operations(new Request(
      'http://localhost/api/admin/content-quality/tyt-social/exam-role?unexpected=true',
    ))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()

    mocks.rpc.mockResolvedValueOnce({ data: { ...queue, reviewerIds: [USER] }, error: null })
    const malformed = await operations(new Request(
      'http://localhost/api/admin/content-quality/tyt-social/exam-role',
    ))
    expect(malformed.status).toBe(500)
    expect(await malformed.json()).toEqual({ error: 'TYT Sosyal yönetişim kuyruğu alınamadı' })
  })

  it('releases only through an exact idempotent publish request bound to the actor', async () => {
    const releaseResult = {
      scopeStatus: 'released', diagnosticEnabled: false, activeQuestionCount: 1316,
      sourceEvidenceSha256: 'a'.repeat(64), historicalEvidenceDisposition: 'not_backfilled',
      replayed: false,
    }
    mocks.rpc.mockResolvedValueOnce({ data: releaseResult, error: null })
    const body = {
      expectedSourceEvidenceSha256: 'a'.repeat(64),
      expectedActiveQuestionCount: 1316,
      requestId: REQUEST,
    }
    const response = await release(post('/api/admin/content-quality/tyt-social/release', body))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(releaseResult)
    expect(mocks.context).toHaveBeenCalledWith(expect.any(Request), 'content.publish')
    expect(mocks.rpc).toHaveBeenCalledWith(context.client, 'release_tyt_social_mastery_scope', {
      p_actor_user_id: USER,
      p_expected_source_evidence_sha256: body.expectedSourceEvidenceSha256,
      p_expected_active_question_count: body.expectedActiveQuestionCount,
      p_request_id: REQUEST,
    })

    vi.clearAllMocks()
    mocks.context.mockResolvedValue(context)
    expect((await release(post('/release', body, '55555555-5555-4555-8555-555555555555'))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('keeps release database failures generic and rejects unexpected output', async () => {
    const body = {
      expectedSourceEvidenceSha256: 'a'.repeat(64),
      expectedActiveQuestionCount: 1316,
      requestId: REQUEST,
    }
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '23514', detail: 'private drift' } })
    const failed = await release(post('/release', body))
    expect(failed.status).toBe(409)
    expect(await failed.json()).toEqual({ error: 'TYT Sosyal kapsamı yayınlanamadı' })

    mocks.rpc.mockResolvedValueOnce({
      data: {
        scopeStatus: 'released', diagnosticEnabled: false, activeQuestionCount: 1316,
        sourceEvidenceSha256: 'a'.repeat(64), historicalEvidenceDisposition: 'not_backfilled',
        replayed: false, evidenceManifest: [{ questionId: REVISION }],
      },
      error: null,
    })
    const malformed = await release(post('/release', body))
    expect(malformed.status).toBe(500)
    expect(await malformed.json()).toEqual({ error: 'TYT Sosyal kapsamı yayınlanamadı' })
  })
})
