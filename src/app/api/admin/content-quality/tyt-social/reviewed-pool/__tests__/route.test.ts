import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }))
vi.mock('../../exam-role/context', () => ({ requireTytSocialExamRoleContext: mocks.context, tytSocialExamRoleRpc: mocks.rpc }))
import { POST } from '../route'
import { reviewedPoolResultSchema } from '../contracts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const pin = { questionId: id(1), revisionId: id(2), contentSha256: 'a'.repeat(64), examRole: 'common_history' }
const body = { policyVersion: 'tyt-social-2026-v1', items: [pin] }
const roleCounts = { common_history: 0, common_geography: 0, common_philosophy: 0, standard_religion: 0, alternate_philosophy: 0 }
const result = {
  version: 'tyt-social-reviewed-pool-preflight@1', policyVersion: body.policyVersion,
  manifestSha256: 'b'.repeat(64), candidateEvidenceOnly: true, publicationAuthorized: false,
  activationSupported: false, globalGateUnchanged: true, databaseWrites: 0,
  selectedCount: 1, eligibleCount: 0, poolEvidenceReady: false, roleCounts,
  roleDeficits: Object.fromEntries(Object.keys(roleCounts).map(key => [key, 5])),
  items: [{ ...pin, eligible: false, issues: ['SOURCE_ACCEPTANCE_MISSING'] }],
}
const request = (input: unknown = body) => new Request('http://localhost/preflight', { method: 'POST', body: JSON.stringify(input) })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.mockResolvedValue({ ok: true, userId: id(99), client: {} })
  mocks.rpc.mockResolvedValue({ data: result, error: null })
})
describe('reviewed pool read-only preflight route', () => {
  it('uses the server actor, exact pins and no-store, without a writer RPC', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(await response.json()).toEqual(result)
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith({}, 'get_tyt_social_reviewed_pool_preflight', {
      p_actor_user_id: id(99), p_policy_version: body.policyVersion, p_items: body.items,
    })
  })
  it.each([401, 403, 429, 503])('preserves auth/AAL2/rate-limit/flag failure %i', async status => {
    mocks.context.mockResolvedValue({ ok: false, response: new Response(null, { status }) })
    expect((await POST(request())).status).toBe(status)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each([
    null, { ...body, actor: id(99) }, { ...body, policyVersion: 'tyt-social-2027-v1' },
    { ...body, items: [] }, { ...body, items: [pin, pin] },
    { ...body, items: [{ ...pin, examRole: 'sosyoloji' }] },
    { ...body, items: [{ ...pin, sourcePolicyReady: true }] },
    { ...body, items: Array.from({ length: 101 }, (_, n) => ({ ...pin, questionId: id(n + 1), revisionId: id(n + 201) })) },
    { ...body, items: [{ ...pin, contentSha256: 'wrong' }] },
    { ...body, items: [pin, { ...pin, questionId: id(3) }] },
  ])('rejects malformed, duplicate or forged gate input %#', async input => {
    expect((await POST(request(input))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each(['questionId', 'revisionId', 'contentSha256', 'examRole'])('rejects an RPC pin mismatch: %s', async field => {
    const replacement = field === 'contentSha256' ? 'c'.repeat(64) : field === 'examRole' ? 'common_geography' : id(80)
    mocks.rpc.mockResolvedValue({ data: { ...result, items: [{ ...result.items[0], [field]: replacement }] }, error: null })
    expect((await POST(request())).status).toBe(500)
  })
  it.each([
    { publicationAuthorized: true }, { databaseWrites: 1 }, { selectedCount: 25 },
    { eligibleCount: 1 }, { poolEvidenceReady: true }, { activationSupported: true },
    { roleDeficits: roleCounts }, { items: [{ ...result.items[0], eligible: true }] },
  ])('rejects inconsistent or authority-bearing result %#', async patch => {
    mocks.rpc.mockResolvedValue({ data: { ...result, ...patch }, error: null })
    expect((await POST(request())).status).toBe(500)
  })
  it('does not leak raw database errors', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'private SQL details' } })
    const response = await POST(request())
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain('private SQL')
  })
  it('handles transport failure', async () => {
    mocks.rpc.mockRejectedValue(new Error('private transport'))
    expect((await POST(request())).status).toBe(500)
  })
  it('supports a ready evidence pool while keeping publication/activation false', () => {
    const items = Object.keys(roleCounts).flatMap((examRole, index) => Array.from({ length: 5 }, (_, n) => ({
      ...pin, questionId: id(index * 5 + n + 1), revisionId: id(index * 5 + n + 101), examRole, eligible: true, issues: [],
    })))
    expect(reviewedPoolResultSchema.safeParse({ ...result, items, selectedCount: 25, eligibleCount: 25,
      poolEvidenceReady: true, roleCounts: result.roleDeficits, roleDeficits: roleCounts }).success).toBe(true)
  })
})
