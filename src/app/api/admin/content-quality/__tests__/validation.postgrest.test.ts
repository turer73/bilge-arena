// @vitest-environment node
//
// GET /api/admin/content-quality/validation gerçek PostgREST'te:
// question_validation_decisions -> questions!inner gömmesi, gömülü
// is_active filtresinin `count: 'exact'` ile birlikte üst satırları elemesi
// ve requireContentGovernanceContext -> checkPermission yetki zinciri.
// validation.test.ts istemciyi mock'ladığı için bunları göremez.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import {
  assertFixtureMirrorsGeneratedSchema,
  describePostgrest,
  startPostgrestContract,
  type PostgrestContract,
} from '@/test/postgrest-contract/harness'

const session = vi.hoisted(() => ({ user: null as { id: string } | null, client: null as unknown }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => session.client }))

const POLICY = 'question-quality@3'
const ids = {
  reviewer: randomUUID(),
  outsider: randomUUID(),
  reviewerRole: randomUUID(),
  math: randomUUID(),
  retired: randomUUID(),
  approved: randomUUID(),
  mathRevision: randomUUID(),
  retiredRevision: randomUUID(),
  approvedRevision: randomUUID(),
}
const sha = (char: string) => char.repeat(64)

function validationRequest(query: string) {
  return new Request(`http://localhost/api/admin/content-quality/validation?${query}`, {
    headers: { 'x-forwarded-for': '10.0.0.5' },
  })
}

describePostgrest('/api/admin/content-quality/validation on real PostgreSQL + PostgREST', () => {
  let contract: PostgrestContract
  let route: typeof import('../validation/route')

  beforeAll(async () => {
    process.env.CONTENT_GOVERNANCE_ENABLED = 'true'
    contract = await startPostgrestContract()
    session.client = contract.cookieClient(() => session.user)
    const { db } = contract
    await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2)', [ids.reviewer, ids.outsider])
    await db.query(`INSERT INTO public.profiles(id, username) VALUES ($1, 'denetci'), ($2, 'yabanci')`, [ids.reviewer, ids.outsider])
    await db.query(`INSERT INTO public.roles(id, slug, name) VALUES ($1, 'stage1', 'Birinci aşama')`, [ids.reviewerRole])
    await db.query(`INSERT INTO public.role_permissions(role_id, permission) VALUES ($1, 'content.review.stage1')`, [ids.reviewerRole])
    await db.query('INSERT INTO public.user_roles(user_id, role_id) VALUES ($1, $2)', [ids.reviewer, ids.reviewerRole])
    await db.query(`INSERT INTO public.question_validation_runtime(singleton, required_policy_version) VALUES (true, $1)`, [POLICY])
    await db.query(
      `INSERT INTO public.questions(id, game, category, is_active, content) VALUES
        ($1, 'matematik', 'geometri', true, '{}'), ($2, 'fen', 'fizik', false, '{}'), ($3, 'turkce', 'paragraf', true, '{}')`,
      [ids.math, ids.retired, ids.approved],
    )
    await db.query(
      `INSERT INTO public.question_content_revisions(id, question_id, revision_no) VALUES ($1, $4, 1), ($2, $5, 1), ($3, $6, 1)`,
      [ids.mathRevision, ids.retiredRevision, ids.approvedRevision, ids.math, ids.retired, ids.approved],
    )
    await db.query(
      `INSERT INTO public.question_validation_decisions
        (question_id, revision_id, content_sha256, policy_version, verdict, findings, rationale, blind_agreement_ratio, run_id, decided_at) VALUES
        ($1, $4, $7, $10, 'NEEDS_REVIEW', '[{"code":"ambiguous_stem","evidence":"İki şık doğru"}]', 'Belirsiz kök', 0.5, gen_random_uuid(), now() - interval '1 hour'),
        ($2, $5, $8, $10, 'NEEDS_REVIEW', '[]', 'Kaynak eksik', NULL, gen_random_uuid(), now() - interval '2 hours'),
        ($3, $6, $9, $10, 'APPROVED', '[]', 'Temiz', 1, gen_random_uuid(), now() - interval '3 hours'),
        ($1, $4, $7, 'question-quality@2', 'NEEDS_REVIEW', '[{"code":"legacy","evidence":"eski"}]', 'Eski politika', NULL, gen_random_uuid(), now() - interval '4 hours')`,
      [ids.math, ids.retired, ids.approved, ids.mathRevision, ids.retiredRevision, ids.approvedRevision,
        sha('a'), sha('b'), sha('c'), POLICY],
    )
    route = await import('../validation/route')
  }, 60_000)

  afterAll(async () => {
    await contract?.close()
  })

  it('mirrors the live question_validation_decisions -> questions relationships', async () => {
    await assertFixtureMirrorsGeneratedSchema(contract.db, [['question_validation_decisions', 'questions'], ['role_permissions', 'roles']])
  })

  it('lists decisions of the live policy with the embedded question', async () => {
    session.user = { id: ids.reviewer }
    const res = await route.GET(validationRequest('verdict=NEEDS_REVIEW'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ total: 2, policyVersion: POLICY })
    expect(body.items).toEqual([
      expect.objectContaining({
        questionId: ids.math, verdict: 'NEEDS_REVIEW', game: 'matematik', category: 'geometri', isActive: true,
        findingCodes: ['ambiguous_stem'], rationale: 'Belirsiz kök', blindAgreementRatio: 0.5,
      }),
      expect.objectContaining({ questionId: ids.retired, game: 'fen', isActive: false, findingCodes: [], blindAgreementRatio: null }),
    ])
  })

  it('drops parent rows and the exact count through the embedded is_active filter', async () => {
    session.user = { id: ids.reviewer }
    const active = await (await route.GET(validationRequest('verdict=NEEDS_REVIEW&activeOnly=true'))).json()
    expect(active.total).toBe(1)
    expect(active.items.map((item: { questionId: string }) => item.questionId)).toEqual([ids.math])

    const inactive = await (await route.GET(validationRequest('verdict=NEEDS_REVIEW&activeOnly=false'))).json()
    expect(inactive.total).toBe(1)
    expect(inactive.items.map((item: { questionId: string }) => item.questionId)).toEqual([ids.retired])
  })

  it('reads an explicit older policy version', async () => {
    session.user = { id: ids.reviewer }
    const body = await (await route.GET(validationRequest('verdict=NEEDS_REVIEW&policyVersion=question-quality@2'))).json()
    expect(body).toMatchObject({ total: 1, policyVersion: 'question-quality@2' })
    expect(body.items[0]).toMatchObject({ questionId: ids.math, findingCodes: ['legacy'] })
  })

  it('refuses a user without a content permission', async () => {
    session.user = { id: ids.outsider }
    const res = await route.GET(validationRequest('verdict=NEEDS_REVIEW'))
    expect(res.status).toBe(403)
  })
})
