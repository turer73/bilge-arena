import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ user: vi.fn(), check: vi.fn(), rpc: vi.fn(), snapshots: vi.fn(), choice: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.user } }) }))
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: () => ({ rpc: mocks.rpc }) }))
vi.mock('@/lib/utils/rate-limit', () => ({ createRateLimiter: () => ({ check: mocks.check }) }))
vi.mock('@/lib/questions/attempt-store', () => ({ getFirstQuestionAttempt: mocks.choice }))
vi.mock('@/lib/verified-attempts', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/verified-attempts')>(), readVerifiedAttemptQuestionSnapshots: mocks.snapshots,
}))
import { GET, POST } from '../route'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const body = { requestId: id(900), variant: 'questions_16_20', noticeAccepted: true }
const req = (data: unknown = body, key = body.requestId) => new Request('http://localhost/api/study/tyt-social-preparation', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-idempotency-key': key }, body: JSON.stringify(data),
}) as never
function snapshots() { return Array.from({ length: 20 }, (_, i) => ({
  questionId: id(i + 1), revisionId: id(i + 101), contentSha256: 'a'.repeat(64), position: i + 1, correctOption: 1,
  content: { question: `Soru ${i + 1}`, options: ['a','b','c','d','e'], answer: 1, solution: 'PRIVATE SOLUTION', hint: 'PRIVATE HINT' },
  metadata: { game: 'sosyal', category: i < 5 ? 'tarih' : i < 10 ? 'cografya' : i < 15 ? 'felsefe' : 'din_kulturu', difficulty: 2, examRef: 'TYT', basePoints: 20 },
})) }
describe('bounded Social preparation API', () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.user.mockResolvedValue({ data: { user: { id: id(800) } } }); mocks.check.mockResolvedValue({ success: true })
    mocks.choice.mockResolvedValue(null); mocks.snapshots.mockResolvedValue(snapshots())
    mocks.rpc.mockResolvedValue({ data: { attemptId: id(700), expiresAt: '2099-01-01T00:00:00Z', policyVersion: 'tyt-social-2027-v1',
      variant: 'questions_16_20', artifactKind: 'practice', snapshot: { PRIVATE: 'DO NOT SPREAD' }, replayed: false,
      composerVersion: 'tyt-social-preparation-v1', examYear: 2027 }, error: null })
  })
  afterEach(() => vi.unstubAllEnvs())
  it('projects 20 public questions and strips every private answer field', async () => {
    const r = await POST(req()); expect(r.status).toBe(200); const data = await r.json()
    expect(data.questions).toHaveLength(20); expect(data.progress).toEqual([])
    expect(JSON.stringify(data)).not.toMatch(/PRIVATE|correctOption|revisionId|contentSha256|"answer"|"solution"|variant|policyVersion/)
    expect(r.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.rpc).toHaveBeenCalledWith('compose_and_issue_tyt_social_preparation', expect.objectContaining({ p_user_id: id(800) }))
  })
  it('reveals only the learner’s already recorded first choice on resume', async () => {
    mocks.choice.mockImplementation(async (_actor, question) => question === id(1) ? 0 : null)
    const data = await (await POST(req())).json()
    expect(data.progress).toEqual([{ questionId: id(1), selectedOption: 0, correctOption: 1, isCorrect: false, solution: 'PRIVATE SOLUTION' }])
    expect(mocks.choice).toHaveBeenCalledWith(`attempt:${id(700)}:user:${id(800)}`, id(1))
  })
  it('requires authentication before any private RPC', async () => {
    mocks.user.mockResolvedValue({ data: { user: null } }); expect((await POST(req())).status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled()
  })
  for (const bad of [{ ...body, userId: id(2) }, { ...body, noticeAccepted: false }, { ...body, variant: 'other' }])
    it('rejects forged or unacknowledged request '+JSON.stringify(bad), async () => { expect((await POST(req(bad))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled() })
  it('requires matching idempotency header', async () => { expect((await POST(req(body, id(999)))).status).toBe(400) })
  it('stops new and resumed browser requests when kill switch is set', async () => {
    vi.stubEnv('TYT_SOCIAL_PREPARATION_ENABLED', 'false'); expect((await POST(req())).status).toBe(503)
    expect(await (await GET(req())).json()).toEqual({ available: false }); expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('fails closed on absent migration without presenting any fake readiness', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } }); expect(await (await GET(req())).json()).toEqual({ available: false })
  })
  it('never treats an official 2026 ticket as 2027 preparation', async () => {
    const original = await mocks.rpc(); mocks.rpc.mockResolvedValue({ ...original, data: { ...original.data, policyVersion: 'tyt-social-2026-v1' } })
    expect((await POST(req())).status).toBe(503)
  })
  for (const defect of ['count','category','exam','options','owner']) it('rejects invalid canonical snapshot: '+defect, async () => {
    const s = snapshots()
    if (defect === 'count') s.pop()
    if (defect === 'category') s[0].metadata.category = 'sosyoloji'
    if (defect === 'exam') s[0].metadata.examRef = 'LGS'
    if (defect === 'options') s[0].content.options.pop()
    if (defect === 'owner') mocks.snapshots.mockRejectedValue(new Error('verified_attempt_snapshot_denied'))
    else mocks.snapshots.mockResolvedValue(s)
    expect((await POST(req())).status).toBe(503)
  })
  it('does not invent progress when canonical first-choice storage fails', async () => {
    mocks.choice.mockRejectedValue(new Error('redis unavailable')); expect((await POST(req())).status).toBe(503)
  })
  it('returns an unavailable status for invalid or overbroad context data', async () => {
    mocks.rpc.mockResolvedValue({ data: { available: true, approved: true }, error: null }); expect(await (await GET(req())).json()).toEqual({ available: false })
  })
})
