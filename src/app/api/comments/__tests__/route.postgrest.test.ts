// @vitest-environment node
//
// /api/comments sözleşmesini gerçek PostgreSQL + PostgREST üzerinde sınar.
// route.test.ts servis-role istemcisini mock'lar; o yüzden 17 Mayıs'ta (#149)
// gelen `profiles!inner` gömmesinin canlıda PGRST200 verdiğini göremedi.
// Burada route kodu değiştirilmeden çalışır: servis-role istemcisi gerçek
// supabase-js'tir, istekler PostgREST'e gider; comments tabloları gerçek
// migration'dan, profiles/questions ortak fikstürden gelir (harness.ts).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import {
  assertFixtureMirrorsGeneratedSchema,
  describePostgrest,
  readGeneratedTables,
  readRepoFile,
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
  noProfile: randomUUID(),
  question: randomUUID(),
  otherQuestion: randomUUID(),
  aliOld: randomUUID(),
  ayseNew: randomUUID(),
  aliDeleted: randomUUID(),
  aliOtherQuestion: randomUUID(),
  orphan: randomUUID(),
}

function getRequest(questionId: string) {
  return new Request(`http://localhost/api/comments?questionId=${questionId}`, {
    headers: { 'x-forwarded-for': '10.0.0.1' },
  })
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/comments', {
    method: 'POST',
    headers: { 'x-forwarded-for': '10.0.0.1', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describePostgrest('/api/comments on real PostgreSQL + PostgREST', () => {
  let contract: PostgrestContract
  let route: typeof import('../route')

  beforeAll(async () => {
    // comments, comment_likes ve beğeni sayacı tetikleyicisi: üretim migration'ı.
    contract = await startPostgrestContract([readRepoFile('database/migrations/002_add_comments.sql')])
    const { db } = contract

    await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2), ($3)', [ids.ali, ids.ayse, ids.noProfile])
    await db.query(
      `INSERT INTO public.profiles(id, username, display_name, avatar_url, level_name) VALUES
        ($1, 'ali', 'Ali Yılmaz', 'https://cdn.example/ali.png', 'Uzman'),
        ($2, 'ayse', NULL, NULL, 'Acemi')`,
      [ids.ali, ids.ayse],
    )
    await db.query(
      `INSERT INTO public.questions(id, game, category, content) VALUES
        ($1, 'matematik', 'denklem', '{}'), ($2, 'matematik', 'denklem', '{}')`,
      [ids.question, ids.otherQuestion],
    )
    await db.query(
      `INSERT INTO public.comments(id, user_id, question_id, content, is_deleted, created_at) VALUES
        ($1, $6, $8, 'eski yorum', false, now() - interval '2 hours'),
        ($2, $7, $8, 'yeni yorum', false, now() - interval '1 hour'),
        ($3, $6, $8, 'silinmiş', true, now() - interval '30 minutes'),
        ($4, $6, $9, 'başka soru', false, now() - interval '10 minutes'),
        ($5, $10, $8, 'profilsiz yazar', false, now() - interval '5 minutes')`,
      [ids.aliOld, ids.ayseNew, ids.aliDeleted, ids.aliOtherQuestion, ids.orphan,
        ids.ali, ids.ayse, ids.question, ids.otherQuestion, ids.noProfile],
    )
    await db.query('INSERT INTO public.comment_likes(user_id, comment_id) VALUES ($1, $2)', [ids.ali, ids.ayseNew])

    route = await import('../route')
  }, 60_000)

  afterAll(async () => {
    await contract?.close()
  })

  it('mirrors the live comments relationships from the generated schema types', async () => {
    // comments -> profiles: canlıda doğrudan FK de junction da yok (PGRST200'ün kaynağı).
    await assertFixtureMirrorsGeneratedSchema(contract.db, [['comments', 'profiles']])
    const liveRelations = readGeneratedTables().get('comments')!.relationships.map((rel) => rel.referencedRelation)
    expect(liveRelations).not.toContain('profiles')
  })

  it('reproduces the production PGRST200 for the old profiles!inner embed', async () => {
    const { error } = await contract.serviceClient()
      .from('comments')
      .select('id, profiles!inner(username, display_name, avatar_url, level_name)')
      .limit(1)
    expect(error?.code).toBe('PGRST200')
  })

  it('lists visible comments of the question with their author profiles', async () => {
    session.user = null
    const res = await route.GET(getRequest(ids.question) as never)
    expect(res.status).toBe(200)
    const { comments } = await res.json()

    // Silinmiş ve başka soruya ait yorumlar yok; yeni olan önce. Profili olmayan
    // yazarın yorumu boş profille döner (arayüz "Anonim" gösterir).
    expect(comments.map((c: { id: string }) => c.id)).toEqual([ids.orphan, ids.ayseNew, ids.aliOld])
    expect(comments[0].profile).toEqual({ username: null, display_name: null, avatar_url: null, level_name: null })
    expect(comments[1]).toMatchObject({
      content: 'yeni yorum',
      likes_count: 1,
      user_id: ids.ayse,
      is_own: false,
      is_liked: false,
      profile: { username: 'ayse', display_name: null, avatar_url: null, level_name: 'Acemi' },
    })
    expect(comments[2].profile).toEqual({
      username: 'ali',
      display_name: 'Ali Yılmaz',
      avatar_url: 'https://cdn.example/ali.png',
      level_name: 'Uzman',
    })
  })

  it('marks own and liked comments for the signed-in author', async () => {
    session.user = { id: ids.ali }
    const res = await route.GET(getRequest(ids.question) as never)
    const { comments } = await res.json()
    const byId = new Map(comments.map((c: { id: string }) => [c.id, c]))
    expect(byId.get(ids.ayseNew)).toMatchObject({ is_own: false, is_liked: true })
    expect(byId.get(ids.aliOld)).toMatchObject({ is_own: true, is_liked: false })
  })

  it('creates a comment through PostgREST, rejects the duplicate and lists it first', async () => {
    session.user = { id: ids.ayse }
    const created = await route.POST(postRequest({ questionId: ids.question, content: 'PostgREST üzerinden yazıldı' }) as never)
    expect(created.status).toBe(201)
    const { id } = await created.json()

    const duplicate = await route.POST(postRequest({ questionId: ids.question, content: 'PostgREST üzerinden yazıldı' }) as never)
    expect(duplicate.status).toBe(409)

    session.user = null
    const { comments } = await (await route.GET(getRequest(ids.question) as never)).json()
    expect(comments[0]).toMatchObject({ id, content: 'PostgREST üzerinden yazıldı', profile: { username: 'ayse' } })
  })
})
