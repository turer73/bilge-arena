// @vitest-environment node
//
// GET /api/study/personalized-mock gerçek PostgREST'te: geçmiş sorgusu
// session_answers -> questions!inner(*) gömmesini, gömülü game/exam_ref
// filtrelerini ve `.returns<HistoryRow[]>()` şeklini (questions tekil nesne,
// kategori zayıf konu seçimine girer) kullanır. route.test.ts servis-role
// istemcisini mock'ladığı için bunları göremez.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
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

// Doğrulanmış deneme bileti (RPC + soru anlık görüntüsü) bu kontratın konusu
// değil: seçimin sonucu yakalanır, bilet aynı kimliklerle döner.
const issued = vi.hoisted(() => ({ questionIds: [] as string[], examRef: null as string | null }))
vi.mock('@/lib/verified-attempts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/verified-attempts')>()),
  issueVerifiedAttempt: async (_admin: unknown, input: { questionIds: string[]; examRef: string | null }) => {
    issued.questionIds = input.questionIds
    issued.examRef = input.examRef
    return {
      attemptId: '00000000-0000-4000-8000-000000000001',
      expiresAt: '2026-10-16T12:00:00.000Z',
      questionSnapshots: input.questionIds.map((questionId) => ({ questionId })),
    }
  },
  toPublicVerifiedQuestions: (snapshots: Array<{ questionId: string }>) =>
    snapshots.map(({ questionId }) => ({ id: questionId })),
}))

const content = JSON.stringify({ question: 'Soru?', options: ['A', 'B', 'C', 'D', 'E'], answer: 0 })
// DENEME_CONFIGS.matematik dağılımını (8/14/10/4/2/2) karşılayan TYT havuzu.
const POOL = { sayilar: 10, problemler: 16, geometri: 12, denklemler: 6, fonksiyonlar: 3, olasilik: 3 }
const ids = { ali: randomUUID(), session: randomUUID(), aytQuestion: randomUUID(), turkceQuestion: randomUUID() }

function mockRequest() {
  return new Request('http://localhost/api/study/personalized-mock?game=matematik&exam_ref=TYT', {
    headers: { 'x-forwarded-for': '10.0.0.6' },
  })
}

describePostgrest('/api/study/personalized-mock on real PostgreSQL + PostgREST', () => {
  let contract: PostgrestContract
  let route: typeof import('../route')
  const byCategory: Record<string, string[]> = {}

  beforeAll(async () => {
    contract = await startPostgrestContract()
    const { db } = contract
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [ids.ali])
    await db.query(`INSERT INTO public.profiles(id, username, exam_type) VALUES ($1, 'ali', 'yks')`, [ids.ali])
    for (const [category, count] of Object.entries(POOL)) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO public.questions(game, category, difficulty, exam_ref, content)
         SELECT 'matematik', $1, 1 + (n % 5), 'TYT', $2::jsonb FROM generate_series(1, $3) AS n RETURNING id`,
        [category, content, count],
      )
      byCategory[category] = rows.map((row) => row.id)
    }
    // Gömülü filtrelerin elemesi gereken geçmiş: başka sınavın ve başka oyunun soruları.
    await db.query(
      `INSERT INTO public.questions(id, game, category, exam_ref, content) VALUES
        ($1, 'matematik', 'olasilik', 'AYT-SAY', $3), ($2, 'turkce', 'paragraf', 'TYT', $3)`,
      [ids.aytQuestion, ids.turkceQuestion, content],
    )
    await db.query(`INSERT INTO public.game_sessions(id, user_id, game) VALUES ($1, $2, 'matematik')`, [ids.session, ids.ali])

    const history: Array<[string, boolean, boolean]> = [
      // geometri 1/6 doğru, problemler 3/6, sayılar 5/5: zayıf sıra geometri, problemler, sayılar.
      ...byCategory.geometri.slice(0, 6).map((id, index): [string, boolean, boolean] => [id, index === 0, false]),
      ...byCategory.problemler.slice(0, 6).map((id, index): [string, boolean, boolean] => [id, index % 2 === 0, false]),
      ...byCategory.sayilar.slice(0, 5).map((id): [string, boolean, boolean] => [id, true, false]),
      ...Array.from({ length: 6 }, (): [string, boolean, boolean] => [ids.aytQuestion, false, false]),
      ...Array.from({ length: 6 }, (): [string, boolean, boolean] => [ids.turkceQuestion, false, false]),
      // Atlanan cevap geçmişe girmez; girseydi bu soru açık yanlış sayılırdı.
      [byCategory.denklemler[0], false, true],
    ]
    for (const [index, [questionId, isCorrect, isSkipped]] of history.entries()) {
      await db.query(
        `INSERT INTO public.session_answers(session_id, question_id, user_id, is_correct, is_skipped, answered_at)
         VALUES ($1, $2, $3, $4, $5, now() - make_interval(mins => $6))`,
        [ids.session, questionId, ids.ali, isCorrect, isSkipped, 1000 - index],
      )
    }
    route = await import('../route')
  }, 60_000)

  afterAll(async () => {
    await contract?.close()
  })

  it('mirrors the live session_answers -> questions relationships', async () => {
    await assertFixtureMirrorsGeneratedSchema(contract.db, [['session_answers', 'questions']])
  })

  it('embeds questions!inner(*) as the full question row', async () => {
    const { data, error } = await contract.serviceClient()
      .from('session_answers')
      .select('question_id, is_correct, is_skipped, answered_at, questions!inner(*)')
      .eq('user_id', ids.ali)
      .eq('questions.game', 'matematik')
      .eq('questions.exam_ref', 'TYT')
      .or('is_skipped.eq.false,is_skipped.is.null')
    expect(error).toBeNull()
    expect(data).toHaveLength(17)
    expect(data![0].questions).toMatchObject({ id: data![0].question_id, game: 'matematik', exam_ref: 'TYT', is_active: true })
  })

  it('builds the mock from the filtered history: open wrongs first, weak categories from the embed', async () => {
    session.user = { id: ids.ali }
    const res = await route.GET(mockRequest() as never)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body).toMatchObject({ game: 'matematik', examRef: 'TYT', strategyEligible: false })
    expect(body.breakdown).toMatchObject({ wrong: 8, weakCategories: ['geometri', 'problemler', 'sayilar'] })
    expect(body.questions).toHaveLength(40)
    expect(issued.examRef).toBe('TYT')

    const openWrongs = [...byCategory.geometri.slice(1, 6), ...byCategory.problemler.slice(0, 6).filter((_, i) => i % 2 === 1)]
    expect(issued.questionIds).toEqual(expect.arrayContaining(openWrongs))
    expect(issued.questionIds).not.toContain(ids.aytQuestion)
    expect(issued.questionIds).not.toContain(ids.turkceQuestion)
  })
})
