// @vitest-environment node
//
// GET /api/profile/stats: session_answers -> questions!inner gömmesi gerçek
// PostgREST'te çözülüyor ve route'un `.returns<AnswerWithQuestion[]>()`
// varsaydığı şekilde (questions tekil nesne) dönüyor mu? route.test.ts
// servis-role istemcisini mock'ladığı için bunu göremez.
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

const ids = {
  ali: randomUUID(),
  ayse: randomUUID(),
  denklem: randomUUID(),
  geometri: randomUUID(),
  paragraf: randomUUID(),
  mathDone: randomUUID(),
  mathActive: randomUUID(),
  turkceDone: randomUUID(),
  ayseSession: randomUUID(),
}

function statsRequest() {
  return new Request('http://localhost/api/profile/stats', { headers: { 'x-forwarded-for': '10.0.0.2' } })
}

describePostgrest('/api/profile/stats on real PostgreSQL + PostgREST', () => {
  let contract: PostgrestContract
  let route: typeof import('../route')

  beforeAll(async () => {
    contract = await startPostgrestContract()
    const { db } = contract
    await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2)', [ids.ali, ids.ayse])
    await db.query(`INSERT INTO public.profiles(id, username) VALUES ($1, 'ali'), ($2, 'ayse')`, [ids.ali, ids.ayse])
    await db.query(
      `INSERT INTO public.questions(id, game, category, content) VALUES
        ($1, 'matematik', 'denklem', '{}'), ($2, 'matematik', 'geometri', '{}'), ($3, 'turkce', 'paragraf', '{}')`,
      [ids.denklem, ids.geometri, ids.paragraf],
    )
    await db.query(
      `INSERT INTO public.game_sessions(id, user_id, game, mode, status, total_questions, correct_count, total_xp, completed_at) VALUES
        ($1, $5, 'matematik', 'classic', 'completed', 3, 2, 40, now() - interval '2 days'),
        ($2, $5, 'matematik', 'blitz', 'active', 0, 0, 0, NULL),
        ($3, $5, 'turkce', 'marathon', 'completed', 1, 0, 0, now() - interval '1 day'),
        ($4, $6, 'matematik', 'classic', 'completed', 1, 1, 10, now())`,
      [ids.mathDone, ids.mathActive, ids.turkceDone, ids.ayseSession, ids.ali, ids.ayse],
    )
    await db.query(
      `INSERT INTO public.session_answers(session_id, question_id, user_id, is_correct) VALUES
        ($1, $3, $6, true), ($1, $3, $6, false), ($1, $4, $6, true),
        ($2, $5, $6, false),
        ($7, $4, $8, false)`,
      [ids.mathDone, ids.turkceDone, ids.denklem, ids.geometri, ids.paragraf, ids.ali, ids.ayseSession, ids.ayse],
    )
    route = await import('../route')
  }, 60_000)

  afterAll(async () => {
    await contract?.close()
  })

  it('mirrors the live session_answers -> questions relationships', async () => {
    await assertFixtureMirrorsGeneratedSchema(contract.db, [['session_answers', 'questions']])
  })

  it('embeds questions!inner as a single object per answer', async () => {
    const { data, error } = await contract.serviceClient()
      .from('session_answers')
      .select('is_correct, questions!inner(game, category)')
      .eq('user_id', ids.ali)
    expect(error).toBeNull()
    expect(data).toHaveLength(4)
    for (const row of data!) {
      expect(row.questions).toEqual({ game: expect.any(String), category: expect.any(String) })
    }
  })

  it('aggregates the signed-in user answers by game and category', async () => {
    session.user = { id: ids.ali }
    const res = await route.GET(statsRequest() as never)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.gameStats).toEqual([
      {
        game: 'matematik', total: 3, correct: 2, percentage: 67,
        categories: [
          { category: 'geometri', total: 1, correct: 1, percentage: 100 },
          { category: 'denklem', total: 2, correct: 1, percentage: 50 },
        ],
      },
      {
        game: 'turkce', total: 1, correct: 0, percentage: 0,
        categories: [{ category: 'paragraf', total: 1, correct: 0, percentage: 0 }],
      },
    ])
    // Yalnız tamamlanmış oyunlar, en yeni önce; başka kullanıcının oyunu yok.
    expect(body.recentGames.map((g: { id: string }) => g.id)).toEqual([ids.turkceDone, ids.mathDone])
    expect(body.recentGames[1]).toMatchObject({ game: 'matematik', mode: 'classic', correct_count: 2, total_questions: 3, total_xp: 40 })
  })
})
