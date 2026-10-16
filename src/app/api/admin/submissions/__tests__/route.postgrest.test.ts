// @vitest-environment node
//
// GET /api/admin/submissions gerçek PostgREST'te: question_submissions'ın
// profiles'a iki FK'si var (user_id, reviewed_by); route gönderen profili
// `profiles!question_submissions_user_id_fkey` ipucuyla seçer. Kısıt adı
// değişirse PGRST200, ipucu düşerse PGRST201 olur; get.test.ts istemciyi
// mock'ladığı için ikisini de göremez.
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

const ids = {
  moderator: randomUUID(),
  ali: randomUUID(),
  ayse: randomUUID(),
  reviewer: randomUUID(),
  moderatorRole: randomUUID(),
  pending: randomUUID(),
  approved: randomUUID(),
}
const content = JSON.stringify({ question: 'Soru?', options: ['A', 'B', 'C', 'D'], answer: 1 })

function listRequest(status: string) {
  return new Request(`http://localhost/api/admin/submissions?status=${status}`)
}

describePostgrest('/api/admin/submissions on real PostgreSQL + PostgREST', () => {
  let contract: PostgrestContract
  let route: typeof import('../route')

  beforeAll(async () => {
    contract = await startPostgrestContract()
    session.client = contract.cookieClient(() => session.user)
    const { db } = contract
    await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2), ($3), ($4)', [ids.moderator, ids.ali, ids.ayse, ids.reviewer])
    await db.query(
      `INSERT INTO public.profiles(id, username, display_name) VALUES
        ($1, 'moderator', 'Moderatör'), ($2, 'ali', 'Ali Yılmaz'), ($3, 'ayse', NULL), ($4, 'veli', 'Veli Hoca')`,
      [ids.moderator, ids.ali, ids.ayse, ids.reviewer],
    )
    await db.query(`INSERT INTO public.roles(id, slug, name) VALUES ($1, 'moderator', 'Moderatör')`, [ids.moderatorRole])
    await db.query(`INSERT INTO public.role_permissions(role_id, permission) VALUES ($1, 'admin.questions.view')`, [ids.moderatorRole])
    await db.query('INSERT INTO public.user_roles(user_id, role_id) VALUES ($1, $2)', [ids.moderator, ids.moderatorRole])
    await db.query(
      `INSERT INTO public.question_submissions
        (id, user_id, game, category, difficulty, content, status, review_note, reviewed_by, reviewed_at, created_at) VALUES
        ($1, $3, 'matematik', 'denklemler', 2, $6, 'pending', NULL, NULL, NULL, now() - interval '1 hour'),
        ($2, $4, 'fen', 'fizik', 3, $6, 'approved', 'Uygun', $5, now(), now() - interval '2 hours')`,
      [ids.pending, ids.approved, ids.ali, ids.ayse, ids.reviewer, content],
    )
    route = await import('../route')
  }, 60_000)

  afterAll(async () => {
    await contract?.close()
  })

  it('mirrors the live question_submissions -> profiles relationships', async () => {
    await assertFixtureMirrorsGeneratedSchema(contract.db, [['question_submissions', 'profiles']])
  })

  it('needs the constraint hint: profiles is ambiguous without it', async () => {
    const { error } = await contract.serviceClient()
      .from('question_submissions')
      .select('id, profiles(username)')
      .limit(1)
    expect(error?.code).toBe('PGRST201')
  })

  it('lists submissions with the submitter, not the reviewer, as profiles', async () => {
    session.user = { id: ids.moderator }
    const pending = await route.GET(listRequest('pending') as never)
    expect(pending.status).toBe(200)
    expect((await pending.json()).submissions).toEqual([
      expect.objectContaining({
        id: ids.pending,
        user_id: ids.ali,
        status: 'pending',
        profiles: { username: 'ali', display_name: 'Ali Yılmaz' },
      }),
    ])

    const approved = await (await route.GET(listRequest('approved') as never)).json()
    expect(approved.submissions).toEqual([
      expect.objectContaining({ id: ids.approved, review_note: 'Uygun', profiles: { username: 'ayse', display_name: null } }),
    ])
  })

  it('refuses a user without the moderation permission', async () => {
    session.user = { id: ids.ali }
    const res = await route.GET(listRequest('pending') as never)
    expect(res.status).toBe(403)
  })
})
