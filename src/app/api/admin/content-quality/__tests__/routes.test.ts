import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), notify: vi.fn() }))
vi.mock('@/lib/content-governance/route-context', () => ({ requireContentGovernanceContext: mocks.context, contentRpc: mocks.rpc }))
vi.mock('@/lib/notifications/create', () => ({ createNotification: mocks.notify }))

import { GET as appeals, POST as submitAppeal } from '@/app/api/questions/appeals/route'
import { GET as corrections } from '@/app/api/questions/corrections/route'
import { POST as createRevision } from '../revisions/route'
import { POST as review } from '../revisions/[revisionId]/review/route'
import { POST as mapOutcomes } from '../revisions/[revisionId]/outcomes/route'
import { POST as publish } from '../revisions/[revisionId]/publish/route'
import { GET as contentQuality } from '../route'
import { GET as adminAppeals } from '../appeals/route'
import { POST as resolveAppeal } from '../appeals/[appealId]/resolve/route'
import { POST as refreshPsychometrics } from '../revisions/[revisionId]/psychometrics/route'
import { POST as createIncident } from '../incidents/route'
import { POST as applyIncident } from '../incidents/[incidentId]/apply/route'
import { GET as getEnforcement, POST as setEnforcement } from '../enforcement/route'

const USER = '11111111-1111-4111-8111-111111111111'
const ID = '22222222-2222-4222-8222-222222222222'
const REQUEST = '33333333-3333-4333-8333-333333333333'
const CORRECTED = '44444444-4444-4444-8444-444444444444'
const REVISION = {
  revisionId: ID, questionId: REQUEST, revisionNo: 2, status: 'published', changeKind: 'edit', summary: 'Düzenlendi',
  preparedAt: '2026-08-09T09:00:00.000Z', publishedAt: '2026-08-09T10:00:00.000Z',
  metadata: { game: 'matematik', category: 'Temel', difficulty: 2, isBoss: false },
  content: { question: '2+2?', options: ['3', '4'], answer: 1 },
  source: { kind: 'original', title: 'İç kaynak', licenseCode: 'INTERNAL' }, outcomes: [], approvals: [], psychometrics: [], incidents: [],
}
const context = { ok: true as const, userId: USER, admin: {} }
const post = (path: string, body: unknown) => new Request(`http://localhost${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.mockResolvedValue(context)
  mocks.rpc.mockImplementation((_admin: unknown, name: string) => Promise.resolve(name === 'finalize_legacy_question_appeal_transition'
    ? { data: { legacy: false, awarded: false, replayed: false, coins: 0, userId: null }, error: null }
    : { data: { replayed: false }, error: null }))
})

describe('R4.3 content governance routes', () => {
  it('uses server auth as actor and rejects forged or unknown request fields', async () => {
    expect((await createRevision(post('/api/admin/content-quality/revisions', { questionId: ID, baseRevisionId: null, payload: {}, requestId: REQUEST, userId: 'forged' }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect((await createRevision(post('/api/admin/content-quality/revisions', { questionId: ID, baseRevisionId: null, payload: {}, requestId: REQUEST }))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith(context.admin, 'create_question_content_revision', expect.objectContaining({ p_user_id: USER, p_question_id: ID, p_request_id: REQUEST }))
  })
  it('binds review permission to the submitted stage and never trusts a route actor', async () => {
    const response = await review(post(`/api/admin/content-quality/revisions/${ID}/review`, { stage: 2, decision: 'approved', rationale: 'Pedagojik olarak uygun.', requestId: REQUEST }), { params: Promise.resolve({ revisionId: ID }) })
    expect(response.status).toBe(200)
    expect(mocks.context).toHaveBeenCalledWith(expect.any(Request), expect.anything(), 'content.review.stage2')
    expect(mocks.rpc).toHaveBeenCalledWith(context.admin, 'review_question_content_revision', expect.objectContaining({ p_user_id: USER, p_stage: 2 }))
  })
  it('maps only a validated unique primary outcome through the server actor', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { revisionId: ID, status: 'draft', outcomeCount: 1, mappingRequired: false, replayed: false }, error: null })
    const response = await mapOutcomes(post(`/api/admin/content-quality/revisions/${ID}/outcomes`, {
      outcomes: [{ outcomeId: CORRECTED, weight: 1, primary: true }], requestId: REQUEST,
    }), { params: Promise.resolve({ revisionId: ID }) })
    expect(response.status).toBe(200)
    expect(mocks.context).toHaveBeenLastCalledWith(expect.any(Request), expect.anything(), 'content.prepare')
    expect(mocks.rpc).toHaveBeenLastCalledWith(context.admin, 'set_question_revision_outcomes', {
      p_user_id: USER, p_revision_id: ID,
      p_outcomes: [{ outcomeId: CORRECTED, weight: 1, primary: true }], p_request_id: REQUEST,
    })
    expect((await mapOutcomes(post(`/api/admin/content-quality/revisions/${ID}/outcomes`, {
      outcomes: [{ outcomeId: CORRECTED, weight: 1, primary: false }], requestId: REQUEST,
    }), { params: Promise.resolve({ revisionId: ID }) })).status).toBe(400)
    expect((await mapOutcomes(post(`/api/admin/content-quality/revisions/${ID}/outcomes`, {
      outcomes: [{ outcomeId: CORRECTED, weight: 0.1234, primary: true }], requestId: REQUEST,
    }), { params: Promise.resolve({ revisionId: ID }) })).status).toBe(400)
  })
  it('passes only canonical publish arguments and hides malformed RPC output', async () => {
    expect((await publish(post(`/api/admin/content-quality/revisions/${ID}/publish`, { requestId: REQUEST }), { params: Promise.resolve({ revisionId: ID }) })).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith(context.admin, 'publish_question_content_revision', { p_user_id: USER, p_revision_id: ID, p_request_id: REQUEST })
    mocks.rpc.mockResolvedValueOnce({ data: { replayed: false, answer: 1, content: { correctOption: 1 }, sources: ['private'], internalNote: 'not for HTTP' }, error: null })
    const projected = await publish(post(`/api/admin/content-quality/revisions/${ID}/publish`, { requestId: REQUEST }), { params: Promise.resolve({ revisionId: ID }) })
    expect(projected.status).toBe(200)
    expect(JSON.stringify(await projected.json())).not.toMatch(/answer|content|sources|internalNote|correctOption/i)
    mocks.rpc.mockResolvedValueOnce({ data: { corrections: [{ sessionDate: '2026-08-09', reason: 'wrong_key', scoreDelta: 1, correctedAt: '2026-08-09T10:00:00.000Z', correctOption: 0 }] }, error: null })
    expect((await corrections(new Request('http://localhost/api/questions/corrections'))).status).toBe(500)
  })
  it('returns redacted owner appeal records with no-store', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { appeals: [{ status: 'submitted', submittedAt: '2026-08-09T10:00:00.000Z', acknowledgmentDueAt: '2026-08-11T10:00:00.000Z', resolutionDueAt: '2026-08-23T10:00:00.000Z', publicMessage: null }] }, error: null })
    const response = await appeals(new Request('http://localhost/api/questions/appeals'))
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(JSON.stringify(await response.json())).not.toMatch(/userId|sessionAnswerId|correctOption|internal/i)
    expect(mocks.rpc).toHaveBeenCalledWith(context.admin, 'get_my_question_appeals', { p_user_id: USER })
  })
  it('submits an owner-bound appeal through the service-only RPC', async () => {
    const response = await submitAppeal(post('/api/questions/appeals', { questionId: ID, sessionAnswerId: null, attemptId: null, reason: 'wrong_key', explanation: '', requestId: REQUEST }))
    expect(response.status).toBe(201)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.rpc).toHaveBeenCalledWith(context.admin, 'submit_question_appeal_v2', {
      p_user_id: USER, p_question_id: ID, p_session_answer_id: null, p_attempt_id: null, p_reason: 'wrong_key', p_description: '', p_request_id: REQUEST,
    })
    expect((await submitAppeal(post('/api/questions/appeals', { questionId: ID, sessionAnswerId: null, attemptId: null, reason: 'wrong_key', explanation: '', requestId: REQUEST, userId: 'forged' }))).status).toBe(400)
  })
  it('does not mask an arbitrary unique violation as an idempotent success', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '23505' } })
    const response = await submitAppeal(post('/api/questions/appeals', {
      questionId: ID, sessionAnswerId: null, attemptId: null,
      reason: 'ambiguous', explanation: '', requestId: REQUEST,
    }))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'İtiraz gönderilemedi' })
  })
  it('returns 200 only when SQL explicitly identifies an already-open appeal', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { appealId: ID, status: 'submitted', alreadyReported: true, replayed: false, evidenceKind: 'current_revision' },
      error: null,
    })
    const response = await submitAppeal(post('/api/questions/appeals', {
      questionId: ID, sessionAnswerId: null, attemptId: null,
      reason: 'ambiguous', explanation: 'Aynı revizyon için açık kayıt var.', requestId: REQUEST,
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expect.objectContaining({ appealId: ID, alreadyReported: true }))
  })
  it('returns a privacy-scoped admin appeal queue and resolves with the server actor', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { items: [{ appealId: ID, questionId: REQUEST, revisionId: null, reasonCode: 'ambiguous', description: 'İki seçenek de doğru.', status: 'submitted', submittedAt: '2026-08-09T10:00:00.000Z', ackDueAt: '2026-08-11T10:00:00.000Z', resolveDueAt: '2026-08-23T10:00:00.000Z', slaBreachedAt: null, hasSessionEvidence: true, latestPublicMessage: 'Alındı.', latestInternalNote: null }], nextCursor: null }, error: null })
    const response = await adminAppeals(new Request('http://localhost/api/admin/content-quality/appeals?status=submitted&limit=25'))
    expect(response.status).toBe(200)
    expect(JSON.stringify(await response.json())).not.toMatch(/userId|sessionAnswerId/)
    expect(mocks.context).toHaveBeenLastCalledWith(expect.any(Request), expect.anything(), 'content.appeals.manage')
    expect(mocks.rpc).toHaveBeenLastCalledWith(context.admin, 'get_question_appeal_queue_v2', {
      p_user_id: USER, p_status: 'submitted', p_limit: 25, p_cursor: '',
    })

    mocks.rpc.mockResolvedValueOnce({ data: { appealId: ID, status: 'acknowledged', replayed: false }, error: null })
    const resolved = await resolveAppeal(post(`/api/admin/content-quality/appeals/${ID}/resolve`, { status: 'acknowledged', publicMessage: 'İnceleme başladı.', internalNote: '', requestId: REQUEST }), { params: Promise.resolve({ appealId: ID }) })
    expect(resolved.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith(context.admin, 'resolve_question_appeal', expect.objectContaining({ p_user_id: USER, p_appeal_id: ID, p_status: 'acknowledged' }))
    expect(mocks.rpc).toHaveBeenLastCalledWith(context.admin, 'finalize_legacy_question_appeal_transition', {
      p_user_id: USER, p_appeal_id: ID, p_coins: expect.any(Number),
    })
  })
  it('pays only a promised legacy reward and keeps transition details private', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { appealId: ID, status: 'resolved', replayed: false }, error: null })
      .mockResolvedValueOnce({ data: { legacy: true, awarded: true, replayed: false, coins: 250, userId: REQUEST }, error: null })
    const response = await resolveAppeal(post(`/api/admin/content-quality/appeals/${ID}/resolve`, {
      status: 'resolved', publicMessage: 'Haklı bildirim.', internalNote: '', requestId: REQUEST,
    }), { params: Promise.resolve({ appealId: ID }) })
    expect(response.status).toBe(200)
    expect(JSON.stringify(await response.json())).not.toMatch(/legacy|coins|userId/)
    expect(mocks.notify).toHaveBeenCalledWith(context.admin, expect.objectContaining({
      userId: REQUEST, type: 'error_report_rewarded',
    }))
  })
  it('lists every revision by default and can resolve the published revision by question id', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { items: [], nextCursor: null }, error: null })
    expect((await contentQuality(new Request('http://localhost/api/admin/content-quality?limit=50'))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenLastCalledWith(context.admin, 'get_question_content_governance_queue', {
      p_user_id: USER, p_status: null, p_limit: 50, p_cursor: '',
    })
    mocks.rpc.mockResolvedValueOnce({ data: { revision: REVISION }, error: null })
    expect((await contentQuality(new Request(`http://localhost/api/admin/content-quality?questionId=${ID}`))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenLastCalledWith(context.admin, 'get_published_question_content_revision', { p_user_id: USER, p_question_id: ID })
    mocks.rpc.mockResolvedValueOnce({ data: { revision: { ...REVISION, source: { ...REVISION.source, reviewerId: USER } } }, error: null })
    expect((await contentQuality(new Request(`http://localhost/api/admin/content-quality?revisionId=${ID}`))).status).toBe(500)
  })
  it('does not label a lineage-valid outcome as valid for a mismatched revision scope', async () => {
    const nodes = [
      { id: 'outcome-node', code: 'FEN-O', title: 'Outcome', game: 'fen', category: 'Temel', exam_ref: null, parent_id: 'topic-node', node_type: 'outcome', taxonomy_version: 'v1', is_active: true },
      { id: 'topic-node', code: 'FEN-T', title: 'Topic', game: 'fen', category: 'Temel', exam_ref: null, parent_id: 'unit-node', node_type: 'topic', taxonomy_version: 'v1', is_active: true },
      { id: 'unit-node', code: 'FEN-U', title: 'Unit', game: 'fen', category: null, exam_ref: null, parent_id: 'course-node', node_type: 'unit', taxonomy_version: 'v1', is_active: true },
      { id: 'course-node', code: 'FEN-C', title: 'Course', game: 'fen', category: null, exam_ref: null, parent_id: null, node_type: 'course', taxonomy_version: 'v1', is_active: true },
    ]
    const outcome = { id: CORRECTED, code: 'FEN-O', title: 'Fen outcome', game: 'fen', category: 'Temel', exam_ref: null, node_id: 'outcome-node', taxonomy_version: 'v1', is_active: true }
    const admin = { from: (table: string) => {
      const chain = {
        select: () => chain,
        in: async (_column: string, ids: string[]) => ({
          data: table === 'curriculum_outcomes' ? [outcome] : nodes.filter((node) => ids.includes(node.id)),
          error: null,
        }),
      }
      return chain
    } }
    mocks.context.mockResolvedValueOnce({ ...context, admin })
    mocks.rpc.mockResolvedValueOnce({ data: { revision: {
      ...REVISION,
      outcomes: [{ outcomeId: CORRECTED, weight: 1, primary: true }],
    } }, error: null })

    const response = await contentQuality(new Request(`http://localhost/api/admin/content-quality?revisionId=${ID}`))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.revision.outcomes[0]).toEqual(expect.objectContaining({
      outcomeId: CORRECTED, scopeValid: false,
    }))
  })
  it('refreshes a bounded psychometric window without accepting a forged actor', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { revisionId: ID, sampleN: 30, correctN: 18, pCorrect: 0.6, wilsonLow: 0.43, wilsonHigh: 0.77, discrimination: 0.4, replayed: false }, error: null })
    const response = await refreshPsychometrics(post(`/api/admin/content-quality/revisions/${ID}/psychometrics`, { windowStart: '2026-07-01T00:00:00.000Z', windowEnd: '2026-08-01T00:00:00.000Z', requestId: REQUEST }), { params: Promise.resolve({ revisionId: ID }) })
    expect(response.status).toBe(200)
    expect(mocks.context).toHaveBeenLastCalledWith(expect.any(Request), expect.anything(), 'content.psychometrics.refresh')
    expect(mocks.rpc).toHaveBeenLastCalledWith(context.admin, 'materialize_question_revision_psychometrics', {
      p_user_id: USER, p_revision_id: ID, p_window_start: '2026-07-01T00:00:00.000Z', p_window_end: '2026-08-01T00:00:00.000Z', p_request_id: REQUEST,
    })
    expect((await refreshPsychometrics(post(`/api/admin/content-quality/revisions/${ID}/psychometrics`, { windowStart: '2026-08-01T00:00:00.000Z', windowEnd: '2026-07-01T00:00:00.000Z', requestId: REQUEST, userId: USER }), { params: Promise.resolve({ revisionId: ID }) })).status).toBe(400)
  })
  it('uses the exact erroneous-revision RPC name and projects correction impact', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { incidentId: ID, status: 'open', eligibleCount: 8, manualRequiredCount: 2, replayed: false }, error: null })
    const created = await createIncident(post('/api/admin/content-quality/incidents', { questionId: ID, revisionId: REQUEST, correctedRevisionId: CORRECTED, errorType: 'wrong_key', requestId: USER }))
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ incidentId: ID, status: 'open', eligibleCount: 8, manualRequiredCount: 2, replayed: false })
    expect(mocks.rpc).toHaveBeenLastCalledWith(context.admin, 'create_question_error_incident', {
      p_user_id: USER, p_question_id: ID, p_erroneous_revision_id: REQUEST, p_corrected_revision_id: CORRECTED, p_error_type: 'wrong_key', p_request_id: USER,
    })

    mocks.rpc.mockResolvedValueOnce({ data: { incidentId: ID, eligibleCount: 8, changedCount: 7, manualRequiredCount: 2, replayed: false }, error: null })
    const applied = await applyIncident(post(`/api/admin/content-quality/incidents/${ID}/apply`, { requestId: REQUEST }), { params: Promise.resolve({ incidentId: ID }) })
    expect(applied.status).toBe(200)
    expect(await applied.json()).toEqual({ incidentId: ID, eligibleCount: 8, changedCount: 7, manualRequiredCount: 2, replayed: false })
  })
  it('reads and changes direct-mutation enforcement only through its dedicated permission', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { enforced: false, updatedAt: '2026-08-09T10:00:00.000Z' }, error: null })
    expect((await getEnforcement(new Request('http://localhost/api/admin/content-quality/enforcement'))).status).toBe(200)
    expect(mocks.context).toHaveBeenLastCalledWith(expect.any(Request), expect.anything(), 'content.enforcement.manage')
    expect(mocks.rpc).toHaveBeenLastCalledWith(context.admin, 'get_content_governance_enforcement', { p_user_id: USER })
    mocks.rpc.mockResolvedValueOnce({ data: { enforced: true, replayed: false }, error: null })
    expect((await setEnforcement(post('/api/admin/content-quality/enforcement', { enforced: true, requestId: REQUEST }))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenLastCalledWith(context.admin, 'set_content_governance_enforcement', { p_user_id: USER, p_enforced: true, p_request_id: REQUEST })
    expect((await setEnforcement(post('/api/admin/content-quality/enforcement', { enforced: false, requestId: REQUEST, actorId: USER }))).status).toBe(400)
  })
})
