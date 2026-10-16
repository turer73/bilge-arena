// @vitest-environment node
//
// /api/review/wrong-answers gerçek PostgREST'te: GET'teki
// session_answers -> questions!inner ve review_logs -> review_error_annotations
// gömmeleri, kalıcı FSRS kart okuması (review_cards) ve POST'un 094
// set_review_error_reason RPC'si. route.test.ts ve route.fsrs.test.ts
// servis-role istemcisini mock'ladığı için bu gömmelerin çözüldüğünü ve
// `.returns<…>()` ile varsayılan şekli göremez.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import {
  assertFixtureMirrorsGeneratedSchema,
  describePostgrest,
  readMigrationFunction,
  startPostgrestContract,
  type PostgrestContract,
} from '@/test/postgrest-contract/harness'

const session = vi.hoisted(() => ({ user: null as { id: string } | null }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: session.user } }) } }),
}))

const content = (question: string) => JSON.stringify({ question, options: ['A', 'B', 'C', 'D'], answer: 1, solution: 'çözüm' })
const ids = {
  ali: randomUUID(),
  ayse: randomUUID(),
  fixed: randomUUID(),
  open: randomUUID(),
  skipped: randomUUID(),
  retired: randomUUID(),
  aliSession: randomUUID(),
  ayseSession: randomUUID(),
  openFirstWrong: randomUUID(),
  openLastWrong: randomUUID(),
  retiredWrong: randomUUID(),
  openLastLog: randomUUID(),
  openFirstLog: randomUUID(),
  retiredLog: randomUUID(),
}
const cardDueAt = new Date(Date.now() - 6 * 3600_000).toISOString()

function getRequest(query = '') {
  return new Request(`http://localhost/api/review/wrong-answers${query}`, { headers: { 'x-forwarded-for': '10.0.0.4' } })
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/review/wrong-answers', {
    method: 'POST',
    headers: { 'x-forwarded-for': '10.0.0.4', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describePostgrest('/api/review/wrong-answers on real PostgreSQL + PostgREST', () => {
  let contract: PostgrestContract
  let route: typeof import('../route')

  beforeAll(async () => {
    Object.assign(process.env, {
      FSRS_REVIEW_ENABLED: 'true',
      FSRS_REVIEW_ROLLOUT_PERCENT: '100',
      FSRS_PERSISTENT_READ_ENABLED: 'true',
      FSRS_PERSISTENT_READ_PERCENT: '100',
    })
    contract = await startPostgrestContract([
      readMigrationFunction('database/migrations/094_persistent_fsrs.sql', 'public.set_review_error_reason'),
    ])
    const { db } = contract
    await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2)', [ids.ali, ids.ayse])
    await db.query(`INSERT INTO public.profiles(id, username) VALUES ($1, 'ali'), ($2, 'ayse')`, [ids.ali, ids.ayse])
    await db.query(
      `INSERT INTO public.questions(id, game, category, subcategory, difficulty, content, is_active) VALUES
        ($1, 'matematik', 'denklem', NULL, 2, $5, true),
        ($2, 'matematik', 'geometri', 'açılar', 4, $6, true),
        ($3, 'turkce', 'paragraf', NULL, 3, $7, true),
        ($4, 'matematik', 'oran', NULL, 1, $8, false)`,
      [ids.fixed, ids.open, ids.skipped, ids.retired, content('düzeldi'), content('açık'), content('atlandı'), content('emekli')],
    )
    await db.query(
      `INSERT INTO public.game_sessions(id, user_id, game) VALUES ($1, $3, 'matematik'), ($2, $4, 'matematik')`,
      [ids.aliSession, ids.ayseSession, ids.ali, ids.ayse],
    )
    await db.query(
      `INSERT INTO public.session_answers(id, session_id, question_id, user_id, selected_option, is_correct, is_skipped, answered_at) VALUES
        (gen_random_uuid(), $1, $3, $7, 2, false, false, now() - interval '3 days'),
        (gen_random_uuid(), $1, $3, $7, 1, true, false, now() - interval '1 day'),
        ($9, $1, $4, $7, 0, false, false, now() - interval '2 days'),
        ($10, $1, $4, $7, 3, false, false, now() - interval '1 hour'),
        (gen_random_uuid(), $1, $5, $7, NULL, false, true, now() - interval '30 minutes'),
        ($11, $1, $6, $7, 2, false, false, now() - interval '5 hours'),
        (gen_random_uuid(), $2, $3, $8, 0, false, false, now())`,
      [ids.aliSession, ids.ayseSession, ids.fixed, ids.open, ids.skipped, ids.retired, ids.ali, ids.ayse,
        ids.openFirstWrong, ids.openLastWrong, ids.retiredWrong],
    )
    await db.query(
      `INSERT INTO public.review_logs(id, user_id, question_id, session_id, answer_id, rating, reviewed_at) VALUES
        ($1, $4, $5, $6, $7, 1, now() - interval '2 days'),
        ($2, $4, $5, $6, $8, 1, now() - interval '1 hour'),
        ($3, $4, $9, $6, $10, 1, now() - interval '5 hours')`,
      [ids.openFirstLog, ids.openLastLog, ids.retiredLog, ids.ali, ids.open, ids.aliSession,
        ids.openFirstWrong, ids.openLastWrong, ids.retired, ids.retiredWrong],
    )
    // Eski log'un nedeni yanıtta görünmemeli: route en son Again log'unu seçer.
    await db.query(
      `INSERT INTO public.review_error_annotations(review_log_id, user_id, reason_code) VALUES
        ($1, $3, 'guess'), ($2, $3, 'calculation')`,
      [ids.openFirstLog, ids.openLastLog, ids.ali],
    )
    await db.query(
      `INSERT INTO public.review_cards(user_id, question_id, due_at, stability, difficulty, reps, lapses, state, last_review_at, last_answer_id)
       VALUES ($1, $2, $3, 2.5, 6.25, 3, 1, 3, now() - interval '1 hour', $4)`,
      [ids.ali, ids.open, cardDueAt, ids.openLastWrong],
    )
    route = await import('../route')
  }, 60_000)

  afterAll(async () => {
    await contract?.close()
  })

  it('mirrors the live relationships of both embeds', async () => {
    await assertFixtureMirrorsGeneratedSchema(contract.db, [
      ['session_answers', 'questions'],
      ['review_logs', 'review_error_annotations'],
    ])
  })

  it('embeds review_error_annotations as an array (composite FK is not one-to-one)', async () => {
    const { data, error } = await contract.serviceClient()
      .from('review_logs')
      .select('question_id, review_error_annotations(reason_code)')
      .eq('id', ids.openLastLog)
    expect(error).toBeNull()
    expect(data).toEqual([{ question_id: ids.open, review_error_annotations: [{ reason_code: 'calculation' }] }])
  })

  it('lists wrong answers with embedded question, latest reason and persistent FSRS card', async () => {
    session.user = { id: ids.ali }
    const res = await route.GET(getRequest('?game=matematik') as never)
    expect(res.status).toBe(200)
    const body = await res.json()

    // Atlanan ve başka kullanıcıya ait cevap yok; pasif soru geçmiş olarak kalır.
    expect(body.items.map((item: { questionId: string }) => item.questionId)).toEqual([ids.open, ids.retired, ids.fixed])
    expect(body.items[0]).toMatchObject({
      game: 'matematik',
      category: 'geometri',
      subcategory: 'açılar',
      difficulty: 4,
      content: { question: 'açık', options: ['A', 'B', 'C', 'D'] },
      userSelectedOption: 3,
      wrongCount: 2,
      status: 'acik',
      errorReason: { code: 'calculation', label: 'Hesaplama hatası' },
      isDue: true,
      dueAt: cardDueAt,
      stability: 2.5,
      fsrsDifficulty: 6.25,
      reviewState: 'relearning',
    })
    expect(body.items[1]).toMatchObject({ category: 'oran', status: 'acik', wrongCount: 1, errorReason: null, isDue: expect.any(Boolean) })
    expect(body.items[2]).toMatchObject({ category: 'denklem', status: 'duzeltildi', userSelectedOption: 2, errorReason: null })
  })

  it('filters by the corrected status', async () => {
    session.user = { id: ids.ali }
    const body = await (await route.GET(getRequest('?status=duzeltildi') as never)).json()
    expect(body.items.map((item: { questionId: string }) => item.questionId)).toEqual([ids.fixed])
  })

  it('stores a reason through the 094 RPC and returns it on the next list', async () => {
    session.user = { id: ids.ali }
    const saved = await route.POST(postRequest({ questionId: ids.retired, reasonCode: 'misread' }) as never)
    expect(saved.status).toBe(200)
    expect(await saved.json()).toEqual({ errorReason: { code: 'misread', label: 'Soruyu yanlış okuma' } })

    const body = await (await route.GET(getRequest('?game=matematik') as never)).json()
    const retired = body.items.find((item: { questionId: string }) => item.questionId === ids.retired)
    expect(retired.errorReason).toEqual({ code: 'misread', label: 'Soruyu yanlış okuma' })
  })

  it('answers 404 when the question has no Again review log', async () => {
    session.user = { id: ids.ali }
    const res = await route.POST(postRequest({ questionId: ids.fixed, reasonCode: 'guess' }) as never)
    expect(res.status).toBe(404)
  })
})
