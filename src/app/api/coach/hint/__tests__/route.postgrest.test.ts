// @vitest-environment node
//
// POST /api/coach/hint gerçek PostgREST'te: aktif deneme (verified_attempts)
// okuması ve iç içe gömme questions -> question_outcomes(...,
// curriculum_outcomes(title, is_active)). primaryOutcomeTitle bu şekli okur ve
// tam bir aktif birincil kazanım yoksa 422 döner. route.test.ts istemciyi
// mock'ladığı için gömmenin çözüldüğünü ve şeklini göremez.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { fallbackHint } from '@/lib/coach/hints'
import {
  assertFixtureMirrorsGeneratedSchema,
  describePostgrest,
  startPostgrestContract,
  type PostgrestContract,
} from '@/test/postgrest-contract/harness'

const session = vi.hoisted(() => ({ user: null as { id: string } | null }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: session.user } }) } }),
}))

// Koç oturumu RPC'leri (start/advance) bu kontratın konusu değil: tablo
// sorguları gerçek PostgREST'e gider, yalnız bu iki RPC sabit sonuç döner.
const rpcCalls = vi.hoisted(() => [] as Array<{ name: string; args: Record<string, unknown> }>)
vi.mock('@/lib/supabase/service-role', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase/service-role')>()
  return {
    ...actual,
    createServiceRoleClient: () => {
      const client = actual.createServiceRoleClient()
      Object.assign(client, {
        rpc: async (name: string, args: Record<string, unknown>) => {
          rpcCalls.push({ name, args })
          if (name === 'start_verified_coach_session') {
            return {
              data: { sessionId: randomUUID(), expiresAt: new Date(Date.now() + 600_000).toISOString(), stage: 0, replayed: false },
              error: null,
            }
          }
          if (name === 'advance_verified_coach_stage') {
            return {
              data: {
                replayed: false,
                responseText: args.p_response_text,
                source: args.p_source,
                evaluationPassed: true,
                policyVersion: args.p_policy_version,
                contentSha256: args.p_content_sha256,
                transferQuestionId: null,
              },
              error: null,
            }
          }
          return { data: null, error: { code: 'PGRST202', message: `unexpected rpc ${name}` } }
        },
      })
      return client
    },
  }
})

const content = JSON.stringify({ question: '2x + 3 = 7 ise x kaçtır?', options: ['1', '2', '3', '4'], answer: 1, solution: '2x = 4, x = 2' })
const ids = {
  ali: randomUUID(),
  attempt: randomUUID(),
  ready: randomUUID(),
  inactiveOutcome: randomUUID(),
  twoPrimaries: randomUUID(),
  noOutcome: randomUUID(),
  equations: randomUUID(),
  ratios: randomUUID(),
  retired: randomUUID(),
}

function hintRequest(questionId: string) {
  return new Request('http://localhost/api/coach/hint', {
    method: 'POST',
    headers: { 'x-forwarded-for': '10.0.0.7', 'content-type': 'application/json' },
    body: JSON.stringify({ attemptId: ids.attempt, questionId, requestId: randomUUID(), stage: 'hint1', selectedOption: 0 }),
  })
}

describePostgrest('/api/coach/hint on real PostgreSQL + PostgREST', () => {
  let contract: PostgrestContract
  let route: typeof import('../route')

  beforeAll(async () => {
    Object.assign(process.env, { COACH_ENABLED: 'true', COACH_TOKEN_SECRET: 'postgrest-contract-coach-token-secret' })
    delete process.env.COACH_AI_ENABLED
    delete process.env.MEASUREMENT_SCHEMA_READY
    contract = await startPostgrestContract()
    const { db } = contract
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [ids.ali])
    await db.query(`INSERT INTO public.profiles(id, username) VALUES ($1, 'ali')`, [ids.ali])
    await db.query(
      `INSERT INTO public.questions(id, game, category, topic, content) VALUES
        ($1, 'matematik', 'denklemler', 'Birinci dereceden', $5), ($2, 'matematik', 'denklemler', NULL, $5),
        ($3, 'matematik', 'denklemler', NULL, $5), ($4, 'matematik', 'denklemler', NULL, $5)`,
      [ids.ready, ids.inactiveOutcome, ids.twoPrimaries, ids.noOutcome, content],
    )
    await db.query(
      `INSERT INTO public.curriculum_outcomes(id, code, game, category, title, is_active) VALUES
        ($1, 'MAT.D.1', 'matematik', 'denklemler', 'Birinci dereceden denklem çözer', true),
        ($2, 'MAT.O.1', 'matematik', 'problemler', 'Oran-orantı kurar', true),
        ($3, 'MAT.ESKI', 'matematik', 'denklemler', 'Eski kazanım', false)`,
      [ids.equations, ids.ratios, ids.retired],
    )
    await db.query(
      `INSERT INTO public.question_outcomes(question_id, outcome_id, is_primary) VALUES
        ($1, $4, true), ($1, $5, false),
        ($2, $6, true),
        ($3, $4, true), ($3, $5, true)`,
      [ids.ready, ids.inactiveOutcome, ids.twoPrimaries, ids.equations, ids.ratios, ids.retired],
    )
    await db.query(
      `INSERT INTO public.verified_attempts(id, user_id, game, mode, question_ids, duration_sec, expires_at)
       VALUES ($1, $2, 'matematik', 'practice', ARRAY[$3::uuid, $4::uuid, $5::uuid, $6::uuid], 600, now() + interval '1 hour')`,
      [ids.attempt, ids.ali, ids.ready, ids.inactiveOutcome, ids.twoPrimaries, ids.noOutcome],
    )
    route = await import('../route')
  }, 60_000)

  afterAll(async () => {
    await contract?.close()
  })

  it('mirrors the live question_outcomes relationships', async () => {
    await assertFixtureMirrorsGeneratedSchema(contract.db, [
      ['questions', 'question_outcomes'],
      ['question_outcomes', 'curriculum_outcomes'],
    ])
  })

  it('embeds question_outcomes as an array and curriculum_outcomes as a single object', async () => {
    const { data, error } = await contract.serviceClient()
      .from('questions')
      .select('id, question_outcomes(outcome_id, is_primary, curriculum_outcomes(title, is_active))')
      .eq('id', ids.ready)
      .maybeSingle()
    expect(error).toBeNull()
    expect(data!.question_outcomes).toEqual(expect.arrayContaining([
      { outcome_id: ids.equations, is_primary: true, curriculum_outcomes: { title: 'Birinci dereceden denklem çözer', is_active: true } },
      { outcome_id: ids.ratios, is_primary: false, curriculum_outcomes: { title: 'Oran-orantı kurar', is_active: true } },
    ]))
  })

  it('starts the coach for a question with exactly one active primary outcome', async () => {
    session.user = { id: ids.ali }
    rpcCalls.length = 0
    const res = await route.POST(hintRequest(ids.ready))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ stage: 'hint1', source: 'fallback', hint: fallbackHint('hint1') })
    expect(rpcCalls.map((call) => call.name)).toEqual(['start_verified_coach_session', 'advance_verified_coach_stage'])
    expect(rpcCalls[0].args).toMatchObject({ p_attempt_id: ids.attempt, p_question_id: ids.ready, p_user_id: ids.ali })
  })

  it.each([
    ['an inactive primary outcome', 'inactiveOutcome'],
    ['two primary outcomes', 'twoPrimaries'],
    ['no outcome', 'noOutcome'],
  ] as const)('refuses a question with %s before any coach RPC', async (_label, key) => {
    session.user = { id: ids.ali }
    rpcCalls.length = 0
    const res = await route.POST(hintRequest(ids[key]))
    expect(res.status).toBe(422)
    expect(rpcCalls).toEqual([])
  })
})
