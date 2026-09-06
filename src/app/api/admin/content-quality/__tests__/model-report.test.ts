import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ context: vi.fn() }))
vi.mock('@/lib/content-governance/route-context', () => ({ requireContentGovernanceContext: mocks.context }))
import { GET } from '../model-report/route'
import { PROMPT_VERSION } from '@/lib/question-audit/prompts'
import { QUESTION_QUALITY_POLICY_VERSION } from '@/lib/question-audit/orchestrator'

const QID = '11111111-1111-4111-8111-111111111111'
const RID = '22222222-2222-4222-8222-222222222222'
const HASH = 'a'.repeat(64)
const revision = { id: RID, question_id: QID, content_sha256: HASH, status: 'published', content: { question: '2 + 2?', options: ['1', '2', '3', '4'], answer: 3 } }
function run(over: Record<string, unknown> = {}) { return { question_id: QID, revision_id: RID, content_sha256: HASH, agent: 'blind_solver', sample_index: 0, provider_id: 'deepseek:deepseek-chat', model_id: 'deepseek-chat', prompt_version: PROMPT_VERSION.blindSolver, policy_version: QUESTION_QUALITY_POLICY_VERSION, generation_config: { blindSamples: 1 }, generation_config_sha256: 'b'.repeat(64), run_id: '33333333-3333-4333-8333-333333333333', status: 'ok', parsed_output: { reasoning: 'Dört.', predictedAnswerIndex: 3, computedValue: null }, input_snapshot: { questionId: QID, revisionId: RID, contentSha256: HASH, questionText: '2 + 2?', options: ['1', '2', '3', '4'], markedAnswerIndex: 3 }, executed_at: '2026-09-06T10:00:00.000Z', ...over } }
type Result = { data: unknown; error: unknown }
function fakeAdmin(over: Partial<Record<'questions' | 'question_content_revisions' | 'question_validation_runs', Result>> = {}) {
  const results = { questions: { data: { id: QID, published_revision_id: RID }, error: null }, question_content_revisions: { data: revision, error: null }, question_validation_runs: { data: [run()], error: null }, ...over }
  const calls: Record<string, unknown[][]> = { select: [], eq: [], limit: [], order: [] }
  const admin = { from(name: keyof typeof results) {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'limit', 'order']) builder[method] = (...args: unknown[]) => { calls[method]!.push([name, ...args]); return builder }
    builder.maybeSingle = () => Promise.resolve(results[name])
    builder.then = (resolve: (value: unknown) => unknown) => resolve(results[name])
    return builder
  } }
  return { admin, calls }
}
const req = (query: string) => new Request(`http://localhost/api/admin/content-quality/model-report?${query}`)
beforeEach(() => vi.clearAllMocks())

describe('model report route security and read contract', () => {
  for (const status of [401, 403, 429, 503]) it(`context ${status} yanitinda DB sorgulamaz`, async () => {
    const denied = new Response('denied', { status })
    mocks.context.mockResolvedValue({ ok: false, response: denied })
    expect(await GET(req(`revisionId=${RID}`))).toBe(denied)
  })
  it('UUID, tam tek hedef ve bilinmeyen parametreyi reddeder', async () => {
    const { admin } = fakeAdmin(); mocks.context.mockResolvedValue({ ok: true, admin })
    for (const query of ['revisionId=x', '', `revisionId=${RID}&questionId=${QID}`, `revisionId=${RID}&extra=1`]) expect((await GET(req(query))).status).toBe(400)
  })
  it('questionId güncel published pointerı çözer; pointer yoksa 404, uyuşmazsa 500', async () => {
    let f = fakeAdmin({ questions: { data: { id: QID, published_revision_id: null }, error: null } }); mocks.context.mockResolvedValue({ ok: true, admin: f.admin })
    expect((await GET(req(`questionId=${QID}`))).status).toBe(404)
    f = fakeAdmin({ questions: { data: { id: QID, published_revision_id: RID }, error: null }, question_content_revisions: { data: { ...revision, question_id: '44444444-4444-4444-8444-444444444444' }, error: null } }); mocks.context.mockResolvedValue({ ok: true, admin: f.admin })
    expect((await GET(req(`questionId=${QID}`))).status).toBe(500)
  })
  it('revision yoksa 404, DB hatası veya bozuk veri varsa 500 döner', async () => {
    let f = fakeAdmin({ question_content_revisions: { data: null, error: null } }); mocks.context.mockResolvedValue({ ok: true, admin: f.admin }); expect((await GET(req(`revisionId=${RID}`))).status).toBe(404)
    f = fakeAdmin({ question_validation_runs: { data: null, error: { message: 'db' } } }); mocks.context.mockResolvedValue({ ok: true, admin: f.admin }); expect((await GET(req(`revisionId=${RID}`))).status).toBe(500)
    f = fakeAdmin({ question_content_revisions: { data: { ...revision, content_sha256: 'broken' }, error: null } }); mocks.context.mockResolvedValue({ ok: true, admin: f.admin }); expect((await GET(req(`revisionId=${RID}`))).status).toBe(500)
  })
  it('tam revision/hash/policy/rol filtresi, 201 sınırı ve güvenli proje kullanır', async () => {
    const f = fakeAdmin({ question_validation_runs: { data: [run({ raw_output: 'SIZMA', error_message: 'SIZMA' })], error: null } }); mocks.context.mockResolvedValue({ ok: true, admin: f.admin })
    const response = await GET(req(`revisionId=${RID}`)); const text = await response.text()
    expect(response.headers.get('Cache-Control')).toContain('no-store'); expect(text).not.toContain('SIZMA')
    expect(f.calls.eq).toEqual(expect.arrayContaining([['question_validation_runs', 'question_id', QID], ['question_validation_runs', 'revision_id', RID], ['question_validation_runs', 'content_sha256', HASH], ['question_validation_runs', 'policy_version', QUESTION_QUALITY_POLICY_VERSION], ['question_validation_runs', 'agent', 'blind_solver']]))
    expect(f.calls.limit).toContainEqual(['question_validation_runs', 201])
    expect((f.calls.select.find((v) => v[0] === 'question_validation_runs')![1] as string)).not.toContain('raw_output')
  })
  it('201 kayıt raporu cap eder ve tamamlanmış uzlaşma iddia etmez', async () => {
    const rows = Array.from({ length: 201 }, () => run())
    const f = fakeAdmin({ question_validation_runs: { data: rows, error: null } }); mocks.context.mockResolvedValue({ ok: true, admin: f.admin })
    const body = await (await GET(req(`revisionId=${RID}`))).json()
    expect(body.report).toMatchObject({ capped: true, agreement: 'incomplete', matchesKey: null })
  })
})
