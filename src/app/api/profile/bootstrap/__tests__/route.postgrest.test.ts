// @vitest-environment node
//
// GET /api/profile/bootstrap: profil, platform-admin izni (user_roles ->
// role_permissions) ve session_answers -> questions!inner gömmesi tek istekte.
// route.test.ts servis-role istemcisini mock'ladığı için gömmenin gerçek
// PostgREST'te çözüldüğünü ve şeklini göremez.
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
  admin: randomUUID(),
  student: randomUUID(),
  adminRole: randomUUID(),
  fen: randomUUID(),
  sosyal: randomUUID(),
  session: randomUUID(),
}

function bootstrapRequest() {
  return new Request('http://localhost/api/profile/bootstrap', { headers: { 'x-forwarded-for': '10.0.0.3' } })
}

describePostgrest('/api/profile/bootstrap on real PostgreSQL + PostgREST', () => {
  let contract: PostgrestContract
  let route: typeof import('../route')

  beforeAll(async () => {
    contract = await startPostgrestContract()
    const { db } = contract
    await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2)', [ids.admin, ids.student])
    await db.query(
      `INSERT INTO public.profiles(id, username, display_name, level_name, total_xp) VALUES
        ($1, 'yonetici', 'Yönetici', 'Uzman', 900), ($2, 'ogrenci', NULL, 'Acemi', 15)`,
      [ids.admin, ids.student],
    )
    await db.query(`INSERT INTO public.roles(id, slug, name) VALUES ($1, 'admin', 'Yönetici')`, [ids.adminRole])
    await db.query(`INSERT INTO public.role_permissions(role_id, permission) VALUES ($1, 'admin.dashboard.view')`, [ids.adminRole])
    await db.query('INSERT INTO public.user_roles(user_id, role_id) VALUES ($1, $2)', [ids.admin, ids.adminRole])
    await db.query(
      `INSERT INTO public.questions(id, game, category, content) VALUES
        ($1, 'fen', 'fizik', '{}'), ($2, 'sosyal', 'tarih', '{}')`,
      [ids.fen, ids.sosyal],
    )
    await db.query(
      `INSERT INTO public.game_sessions(id, user_id, game, status, total_questions, correct_count, total_xp, completed_at)
       VALUES ($1, $2, 'fen', 'completed', 3, 2, 20, now())`,
      [ids.session, ids.student],
    )
    await db.query(
      `INSERT INTO public.session_answers(session_id, question_id, user_id, is_correct) VALUES
        ($1, $2, $4, true), ($1, $2, $4, true), ($1, $3, $4, false)`,
      [ids.session, ids.fen, ids.sosyal, ids.student],
    )
    route = await import('../route')
  }, 60_000)

  afterAll(async () => {
    await contract?.close()
  })

  it('mirrors the live session_answers -> questions relationships', async () => {
    await assertFixtureMirrorsGeneratedSchema(contract.db, [['session_answers', 'questions'], ['user_roles', 'roles']])
  })

  it('returns profile, stats from the embedded questions and recent games for a student', async () => {
    session.user = { id: ids.student }
    const res = await route.GET(bootstrapRequest() as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile).toMatchObject({ id: ids.student, username: 'ogrenci', level_name: 'Acemi', total_xp: 15 })
    expect(body.isAdmin).toBe(false)
    expect(body.gameStats).toEqual([
      { game: 'fen', total: 2, correct: 2, percentage: 100, categories: [{ category: 'fizik', total: 2, correct: 2, percentage: 100 }] },
      { game: 'sosyal', total: 1, correct: 0, percentage: 0, categories: [{ category: 'tarih', total: 1, correct: 0, percentage: 0 }] },
    ])
    expect(body.recentGames).toEqual([expect.objectContaining({ id: ids.session, game: 'fen', correct_count: 2 })])
  })

  it('recognises a platform admin through user_roles and role_permissions', async () => {
    session.user = { id: ids.admin }
    const res = await route.GET(bootstrapRequest() as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ isAdmin: true, gameStats: [], recentGames: [], profile: { username: 'yonetici' } })
  })
})
