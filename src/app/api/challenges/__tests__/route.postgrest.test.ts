// @vitest-environment node
//
// GET /api/challenges gerçek PostgREST'te: challenges'ın profiles'a üç FK'si
// var (challenger_id, opponent_id, winner_id); route `challenger:challenger_id`
// ve `opponent:opponent_id` ile FK sütunundan seçer. route.test.ts istemciyi
// mock'ladığı için ilişki seçimini ve şekli göremez.
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
  veli: randomUUID(),
  aliChallenges: randomUUID(),
  aliIsOpponent: randomUUID(),
  unrelated: randomUUID(),
  question: randomUUID(),
}

describePostgrest('/api/challenges on real PostgreSQL + PostgREST', () => {
  let contract: PostgrestContract
  let route: typeof import('../route')

  beforeAll(async () => {
    contract = await startPostgrestContract()
    const { db } = contract
    await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2), ($3)', [ids.ali, ids.ayse, ids.veli])
    await db.query(
      `INSERT INTO public.profiles(id, username, display_name, avatar_url) VALUES
        ($1, 'ali', 'Ali', 'https://cdn.example/ali.png'), ($2, 'ayse', 'Ayşe', NULL), ($3, 'veli', NULL, NULL)`,
      [ids.ali, ids.ayse, ids.veli],
    )
    await db.query(
      `INSERT INTO public.challenges(id, challenger_id, opponent_id, winner_id, game, status, question_ids, created_at) VALUES
        ($1, $4, $5, NULL, 'matematik', 'pending', ARRAY[$7]::uuid[], now() - interval '1 hour'),
        ($2, $6, $4, $6, 'fen', 'completed', ARRAY[$7]::uuid[], now() - interval '2 hours'),
        ($3, $5, $6, NULL, 'turkce', 'pending', ARRAY[$7]::uuid[], now())`,
      [ids.aliChallenges, ids.aliIsOpponent, ids.unrelated, ids.ali, ids.ayse, ids.veli, ids.question],
    )
    route = await import('../route')
  }, 60_000)

  afterAll(async () => {
    await contract?.close()
  })

  it('mirrors the live challenges -> profiles relationships', async () => {
    await assertFixtureMirrorsGeneratedSchema(contract.db, [['challenges', 'profiles']])
  })

  it('lists the user challenges with challenger and opponent resolved by their own columns', async () => {
    session.user = { id: ids.ali }
    const res = await route.GET()
    expect(res.status).toBe(200)
    const { challenges } = await res.json()

    expect(challenges.map((c: { id: string }) => c.id)).toEqual([ids.aliChallenges, ids.aliIsOpponent])
    expect(challenges[0]).toMatchObject({
      status: 'pending',
      question_ids: [ids.question],
      challenger: { id: ids.ali, username: 'ali', display_name: 'Ali', avatar_url: 'https://cdn.example/ali.png' },
      opponent: { id: ids.ayse, username: 'ayse', display_name: 'Ayşe', avatar_url: null },
    })
    // Kazanan (winner_id) aynı profile işaret etse de challenger/opponent kendi sütununu izler.
    expect(challenges[1]).toMatchObject({
      winner_id: ids.veli,
      challenger: { id: ids.veli, username: 'veli' },
      opponent: { id: ids.ali, username: 'ali' },
    })
  })
})
