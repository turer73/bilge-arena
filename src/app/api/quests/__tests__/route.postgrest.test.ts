// @vitest-environment node
//
// GET /api/quests gerçek PostgREST'te: user_daily_quests -> daily_quests
// gömmesi `quest:daily_quests(*)` hem okumada hem de bugünün görevleri
// atanırken insert().select() yanıtında kullanılır. route.test.ts istemciyi
// mock'ladığı için gömmenin ve insert dönüşünün şeklini göremez.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { trDayString } from '@/lib/utils/tr-date'
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
  returning: randomUUID(),
  newcomer: randomUUID(),
  play: randomUUID(),
  correct: randomUUID(),
  streak: randomUUID(),
  accuracy: randomUUID(),
  retired: randomUUID(),
}
const ACTIVE = [ids.play, ids.correct, ids.streak, ids.accuracy]

describePostgrest('/api/quests on real PostgreSQL + PostgREST', () => {
  let contract: PostgrestContract
  let route: typeof import('../route')

  beforeAll(async () => {
    contract = await startPostgrestContract()
    const { db } = contract
    await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2)', [ids.returning, ids.newcomer])
    await db.query(`INSERT INTO public.profiles(id, username) VALUES ($1, 'eski'), ($2, 'yeni')`, [ids.returning, ids.newcomer])
    await db.query(
      `INSERT INTO public.daily_quests(id, slug, title, quest_type, target_value, xp_reward, is_active) VALUES
        ($1, 'play-3', '3 oyun oyna', 'play_sessions', 3, 50, true),
        ($2, 'correct-20', '20 doğru', 'correct_answers', 20, 75, true),
        ($3, 'streak', 'Seriyi koru', 'streak_maintain', 1, 30, true),
        ($4, 'accuracy-80', '%80 doğruluk', 'accuracy', 80, 60, true),
        ($5, 'retired', 'Emekli görev', 'play_sessions', 1, 10, false)`,
      [ids.play, ids.correct, ids.streak, ids.accuracy, ids.retired],
    )
    await db.query(
      `INSERT INTO public.user_daily_quests(user_id, quest_id, date, current_value) VALUES
        ($1, $2, $4, 2), ($1, $3, $4, 0), ($1, $3, $5, 9)`,
      [ids.returning, ids.play, ids.correct, trDayString(new Date()), '2026-01-01'],
    )
    route = await import('../route')
  }, 60_000)

  afterAll(async () => {
    await contract?.close()
  })

  it('mirrors the live user_daily_quests -> daily_quests relationships', async () => {
    await assertFixtureMirrorsGeneratedSchema(contract.db, [['user_daily_quests', 'daily_quests']])
  })

  it('returns today\'s quests with the embedded quest object', async () => {
    session.user = { id: ids.returning }
    const res = await route.GET()
    expect(res.status).toBe(200)
    const { quests } = await res.json()
    expect(quests).toHaveLength(2)
    const play = quests.find((row: { quest_id: string }) => row.quest_id === ids.play)
    expect(play).toMatchObject({
      user_id: ids.returning,
      current_value: 2,
      quest: { id: ids.play, slug: 'play-3', title: '3 oyun oyna', target_value: 3, xp_reward: 50, is_active: true },
    })
  })

  it('assigns three active quests and returns them embedded from the insert', async () => {
    session.user = { id: ids.newcomer }
    const res = await route.GET()
    expect(res.status).toBe(200)
    const { quests } = await res.json()
    expect(quests).toHaveLength(3)
    for (const row of quests) {
      expect(ACTIVE).toContain(row.quest_id)
      expect(row).toMatchObject({ user_id: ids.newcomer, date: trDayString(new Date()), current_value: 0, is_completed: false })
      expect(row.quest).toMatchObject({ id: row.quest_id, is_active: true })
    }
    expect(new Set(quests.map((row: { quest_id: string }) => row.quest_id)).size).toBe(3)

    const { rows } = await contract.db.query('SELECT count(*)::int AS n FROM public.user_daily_quests WHERE user_id = $1', [ids.newcomer])
    expect(rows[0]).toEqual({ n: 3 })
  })
})
