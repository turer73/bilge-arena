// @vitest-environment node
//
// fetchDueQuestions ve computeTopicStrengths gerçek PostgREST'te:
// session_answers -> questions!inner gömmesi ve gömülü sütunlara uygulanan
// filtreler (questions.game / category / difficulty / exam_ref). !inner
// filtrelenen gömmede üst satırı da eler; mock'lu testler bu davranışı ve
// `.returns<AnswerWithQuestion[]>()` şeklini doğrulayamaz.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import {
  assertFixtureMirrorsGeneratedSchema,
  describePostgrest,
  startPostgrestContract,
  type PostgrestContract,
} from '@/test/postgrest-contract/harness'

const content = JSON.stringify({ question: 'Soru?', options: ['A', 'B', 'C', 'D'], answer: 2 })
const ids = {
  ali: randomUUID(),
  ayse: randomUUID(),
  tytEquation: randomUUID(),
  geometry: randomUUID(),
  solvedEquation: randomUUID(),
  retiredEquation: randomUUID(),
  legacyCategory: randomUUID(),
  turkce: randomUUID(),
  aliSession: randomUUID(),
  ayseSession: randomUUID(),
}

describePostgrest('review helpers with questions!inner on real PostgreSQL + PostgREST', () => {
  let contract: PostgrestContract
  let admin: ReturnType<PostgrestContract['serviceClient']>
  let fetchDueQuestions: typeof import('../due-questions').fetchDueQuestions
  let computeTopicStrengths: typeof import('../topic-strengths').computeTopicStrengths

  beforeAll(async () => {
    // Kalıcı kart okuması kapalı: due adayları cevap geçmişinden katlanır.
    process.env.FSRS_PERSISTENT_READ_ENABLED = 'false'
    contract = await startPostgrestContract()
    const { db } = contract
    await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2)', [ids.ali, ids.ayse])
    await db.query(`INSERT INTO public.profiles(id, username) VALUES ($1, 'ali'), ($2, 'ayse')`, [ids.ali, ids.ayse])
    await db.query(
      `INSERT INTO public.questions(id, game, category, difficulty, exam_ref, is_active, content) VALUES
        ($1, 'matematik', 'denklemler', 2, 'TYT', true, $7),
        ($2, 'matematik', 'geometri', 3, NULL, true, $7),
        ($3, 'matematik', 'denklemler', 2, 'TYT', true, $7),
        ($4, 'matematik', 'denklemler', 2, 'TYT', false, $7),
        ($5, 'matematik', 'eski_kategori', 2, 'TYT', true, $7),
        ($6, 'turkce', 'paragraf', 2, 'TYT', true, $7)`,
      [ids.tytEquation, ids.geometry, ids.solvedEquation, ids.retiredEquation, ids.legacyCategory, ids.turkce, content],
    )
    await db.query(
      `INSERT INTO public.game_sessions(id, user_id, game) VALUES ($1, $3, 'matematik'), ($2, $4, 'matematik')`,
      [ids.aliSession, ids.ayseSession, ids.ali, ids.ayse],
    )
    await db.query(
      `INSERT INTO public.session_answers(session_id, question_id, user_id, is_correct, is_skipped, answered_at) VALUES
        ($1, $3, $10, false, false, now() - interval '10 days'),
        ($1, $4, $10, false, false, now() - interval '9 days'),
        ($1, $5, $10, true, false, now() - interval '2 days'),
        ($1, $5, $10, true, false, now() - interval '1 day'),
        ($1, $6, $10, false, false, now() - interval '8 days'),
        ($1, $7, $10, true, false, now() - interval '3 days'),
        ($1, $8, $10, false, false, now() - interval '7 days'),
        ($1, $3, $10, false, true, now() - interval '1 hour'),
        ($2, $4, $9, false, false, now() - interval '6 days')`,
      [ids.aliSession, ids.ayseSession, ids.tytEquation, ids.geometry, ids.solvedEquation, ids.retiredEquation,
        ids.legacyCategory, ids.turkce, ids.ayse, ids.ali],
    )
    admin = contract.serviceClient()
    ;({ fetchDueQuestions } = await import('../due-questions'))
    ;({ computeTopicStrengths } = await import('../topic-strengths'))
  }, 60_000)

  afterAll(async () => {
    await contract?.close()
  })

  it('mirrors the live session_answers -> questions relationships', async () => {
    await assertFixtureMirrorsGeneratedSchema(contract.db, [['session_answers', 'questions']])
  })

  it('narrows due candidates through filters on the embedded question', async () => {
    const dueIds = async (
      game: string,
      category: string | null = null,
      difficulty: number | null = null,
      examRef: string | null = null,
      examScope: 'any' | 'exact' = 'any',
    ) => (await fetchDueQuestions(admin as never, ids.ali, game, category, difficulty, examRef, examScope))
      .map((question) => question.id)
      .sort()

    // Başka oyunun sorusu, pasif soru ve atlanan cevap matematik adayı değil.
    expect(await dueIds('matematik')).toEqual([ids.tytEquation, ids.geometry].sort())
    expect(await dueIds('matematik', 'geometri')).toEqual([ids.geometry])
    expect(await dueIds('matematik', null, 2)).toEqual([ids.tytEquation])
    expect(await dueIds('matematik', null, null, 'TYT')).toEqual([ids.tytEquation])
    expect(await dueIds('matematik', null, null, null, 'exact')).toEqual([ids.geometry])
    expect(await dueIds('turkce')).toEqual([ids.turkce])
  })

  it('returns due questions as full domain questions', async () => {
    const [question] = await fetchDueQuestions(admin as never, ids.ali, 'matematik', 'geometri')
    expect(question).toMatchObject({ id: ids.geometry, game: 'matematik', category: 'geometri', difficulty: 3, exam_ref: null })
    expect(question.content).toMatchObject({ question: 'Soru?', answer: 2 })
  })

  it('computes topic strengths from the embedded question category', async () => {
    expect(await computeTopicStrengths(admin as never, ids.ali, 'matematik')).toEqual([
      { label: 'Eski kategori', category: 'eski_kategori', total: 1, percentage: 100 },
      { label: 'Denklemler', category: 'denklemler', total: 5, percentage: 40 },
      { label: 'Geometri', category: 'geometri', total: 1, percentage: 0 },
    ])
    // exam_ref gömülü sütunla süzülür; sınavın kategori listesinde olmayan konu düşer.
    expect(await computeTopicStrengths(admin as never, ids.ali, 'matematik', 'TYT')).toEqual([
      { label: 'Denklemler', category: 'denklemler', total: 5, percentage: 40 },
    ])
  })
})
