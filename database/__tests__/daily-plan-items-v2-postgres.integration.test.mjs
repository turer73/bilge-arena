// Opt-in disposable PostgreSQL coverage for migration 095.
// Requires VERIFIED_ATTEMPTS_TEST_DATABASE_URL=.../bilge_r02_test_* and
// VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE=1. Normal CI does not run it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const url = process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_URL
const enabled = Boolean(url && process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE === '1')
if (url && !/^bilge_r02_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error('non-disposable database refused')
const describePg = enabled ? describe : describe.skip
const migration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '095_daily_plan_items_v2.sql'), 'utf8')
const { Client } = pg

function item(position, questionId, slotType = 'due', sourceType = slotType, sourceRef = null) {
  return { position, question_id: questionId, slot_type: slotType, source_type: sourceType, source_ref: sourceRef }
}

describePg('095 daily-plan items V2 real PostgreSQL', () => {
  let client; let user; let other
  beforeAll(async () => {
    client = new Client({ connectionString: url }); await client.connect()
    await client.query(`DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth; CREATE EXTENSION IF NOT EXISTS pgcrypto;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$; ALTER ROLE service_role BYPASSRLS; REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role; GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY); CREATE TABLE public.questions(id uuid PRIMARY KEY, game text NOT NULL, exam_ref text); CREATE TABLE public.daily_plan(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,game varchar(20) NOT NULL,plan_date date NOT NULL,question_ids uuid[] NOT NULL,completed_ids uuid[] NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),exam_ref varchar(10));
      CREATE UNIQUE INDEX idx_daily_plan_user_game_date_exam ON public.daily_plan(user_id,game,plan_date,exam_ref) NULLS NOT DISTINCT;`)
    await client.query(migration)
    user=randomUUID(); other=randomUUID()
    await client.query('INSERT INTO public.profiles(id) VALUES($1),($2)',[user,other])
  })
  afterAll(async () => client?.end())
  async function asRole(role, work) {
    await client.query(`SET ROLE ${role}`)
    try { return await work() } finally { await client.query('RESET ROLE') }
  }
  async function create(userId, date, items, game = 'matematik', examRef = 'TYT', connection = client) {
    return connection.query('SELECT public.create_daily_plan_v2($1::uuid,$2::text,$3::date,$4::text,$5::jsonb) result', [userId,game,date,examRef,JSON.stringify(items)])
  }

  it('enforces private item ACL/RLS and exact RPC execution roles', async () => {
    const catalog=await client.query(`SELECT c.relrowsecurity,
      (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='daily_plan_items') policies,
      has_table_privilege('authenticated','public.daily_plan_items','SELECT') authenticated_select,
      has_table_privilege('service_role','public.daily_plan_items','SELECT') service_select,
      has_table_privilege('service_role','public.daily_plan_items','INSERT') service_insert,
      has_table_privilege('service_role','public.daily_plan_items','UPDATE') service_update,
      has_table_privilege('service_role','public.daily_plan_items','DELETE') service_delete,
      has_table_privilege('service_role','public.daily_plan_items','TRUNCATE') service_truncate,
      has_function_privilege('authenticated','public.create_daily_plan_v2(uuid,text,date,text,jsonb)','EXECUTE') authenticated_create,
      has_function_privilege('authenticated','public.complete_daily_plan_items(uuid,uuid,uuid[])','EXECUTE') authenticated_complete,
      has_function_privilege('service_role','public.create_daily_plan_v2(uuid,text,date,text,jsonb)','EXECUTE') service_create,
      has_function_privilege('service_role','public.complete_daily_plan_items(uuid,uuid,uuid[])','EXECUTE') service_complete
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='daily_plan_items'`)
    expect(catalog.rows[0]).toEqual({
      relrowsecurity:true, policies:'0', authenticated_select:false,
      service_select:true, service_insert:false, service_update:false, service_delete:false, service_truncate:false,
      authenticated_create:false, authenticated_complete:false, service_create:true, service_complete:true,
    })
    await asRole('authenticated', async () => {
      await expect(client.query('SELECT * FROM public.daily_plan_items')).rejects.toMatchObject({ code:'42501' })
      await expect(client.query("SELECT public.create_daily_plan_v2(NULL::uuid,'matematik',CURRENT_DATE,'TYT','[]'::jsonb)")).rejects.toMatchObject({ code:'42501' })
    })
    const q=randomUUID(); await client.query("INSERT INTO public.questions(id,game,exam_ref) VALUES($1,'matematik','TYT')",[q])
    await asRole('service_role', async () => {
      expect((await client.query('SELECT count(*) FROM public.daily_plan_items')).rows[0].count).toBe('0')
      await expect(client.query('DELETE FROM public.daily_plan_items')).rejects.toMatchObject({ code:'42501' })
      const created=await create(user,'2026-08-08',[item(1,q)],'matematik','TYT',client)
      expect(created.rows[0].result.questionIds).toEqual([q])
    })
  })

  it('creates exact metadata and returns an immutable replay winner', async () => {
    const q1=randomUUID(); const q2=randomUUID(); const q3=randomUUID(); const date='2026-08-09'
    await client.query("INSERT INTO public.questions(id,game,exam_ref) VALUES($1,'matematik','TYT'),($2,'matematik','TYT'),($3,'matematik','TYT')",[q1,q2,q3])
    const first=(await create(user,date,[item(1,q1),item(2,q2,'weak_outcome','weak_outcome','outcome:algebra')])).rows[0].result
    expect(first.questionIds).toEqual([q1,q2])
    expect(first.items).toEqual([
      { questionId:q1, position:1, slotType:'due', sourceType:'due', completed:false },
      { questionId:q2, position:2, slotType:'weak_outcome', sourceType:'weak_outcome', completed:false },
    ])
    const replay=(await create(user,date,[item(1,q3,'challenge','challenge')])).rows[0].result
    expect(replay).toEqual(first)
    const rows=await client.query('SELECT position,question_id,slot_type,source_type,source_ref FROM public.daily_plan_items WHERE plan_id=$1 ORDER BY position',[first.planId])
    expect(rows.rows).toEqual([
      { position:1, question_id:q1, slot_type:'due', source_type:'due', source_ref:null },
      { position:2, question_id:q2, slot_type:'weak_outcome', source_type:'weak_outcome', source_ref:'outcome:algebra' },
    ])
  })

  it('returns one canonical plan to concurrent creators', async () => {
    const q1=randomUUID(); const q2=randomUUID(); const date='2026-08-10'
    await client.query("INSERT INTO public.questions(id,game,exam_ref) VALUES($1,'matematik','TYT'),($2,'matematik','TYT')",[q1,q2])
    const left=new Client({ connectionString:url }); const right=new Client({ connectionString:url })
    let results
    try {
      await Promise.all([left.connect(),right.connect()])
      results=await Promise.all([
        create(user,date,[item(1,q1)],'matematik','TYT',left),
        create(user,date,[item(1,q2)],'matematik','TYT',right),
      ])
    } finally {
      await Promise.allSettled([left.end(),right.end()])
    }
    const first=results[0].rows[0].result; const second=results[1].rows[0].result
    expect(second.planId).toBe(first.planId)
    expect(new Set([first.questionIds[0],second.questionIds[0]])).toHaveLength(1)
    expect((await client.query('SELECT count(*) FROM public.daily_plan WHERE user_id=$1 AND plan_date=$2',[user,date])).rows[0].count).toBe('1')
    expect((await client.query('SELECT count(*) FROM public.daily_plan_items WHERE plan_id=$1',[first.planId])).rows[0].count).toBe('1')
  })

  it('rolls back a rejected payload without leaving a half plan', async () => {
    const good=randomUUID(); const wrongGame=randomUUID(); const date='2026-08-11'
    await client.query("INSERT INTO public.questions(id,game,exam_ref) VALUES($1,'matematik','TYT'),($2,'fen','TYT')",[good,wrongGame])
    await expect(create(user,date,[item(1,good),item(2,wrongGame)])).rejects.toMatchObject({ code:'22023' })
    expect((await client.query('SELECT count(*) FROM public.daily_plan WHERE user_id=$1 AND plan_date=$2',[user,date])).rows[0].count).toBe('0')
  })

  it('unions V2 completions in item order, ignores nonmembers, and is idempotent', async () => {
    const q1=randomUUID(); const q2=randomUUID(); const outside=randomUUID(); const date='2026-08-12'
    await client.query("INSERT INTO public.questions(id,game,exam_ref) VALUES($1,'matematik','TYT'),($2,'matematik','TYT'),($3,'matematik','TYT')",[q1,q2,outside])
    const plan=(await create(user,date,[item(1,q1),item(2,q2)])).rows[0].result
    const first=await client.query('SELECT public.complete_daily_plan_items($1::uuid,$2::uuid,$3::uuid[]) result',[user,plan.planId,[outside,q1]])
    expect(first.rows[0].result.completedIds).toEqual([q1])
    const before=(await client.query('SELECT completed_at FROM public.daily_plan_items WHERE plan_id=$1 AND question_id=$2',[plan.planId,q1])).rows[0].completed_at
    const second=await client.query('SELECT public.complete_daily_plan_items($1::uuid,$2::uuid,$3::uuid[]) result',[user,plan.planId,[q1,q2]])
    expect(second.rows[0].result.completedIds).toEqual([q1,q2])
    await client.query('SELECT public.complete_daily_plan_items($1::uuid,$2::uuid,$3::uuid[])',[user,plan.planId,[q1]])
    const after=(await client.query('SELECT completed_at FROM public.daily_plan_items WHERE plan_id=$1 AND question_id=$2',[plan.planId,q1])).rows[0].completed_at
    expect(new Date(after).getTime()).toBe(new Date(before).getTime())
    await expect(client.query('SELECT public.complete_daily_plan_items($1::uuid,$2::uuid,$3::uuid[])',[other,plan.planId,[q1]])).rejects.toMatchObject({ code:'42501' })
  })

  it('atomically unions concurrent legacy completions in question order without synthesizing items', async () => {
    const q1=randomUUID(); const q2=randomUUID(); const outside=randomUUID(); const date='2026-08-13'; const legacyPlan=randomUUID()
    await client.query("INSERT INTO public.questions(id,game,exam_ref) VALUES($1,'matematik','TYT'),($2,'matematik','TYT'),($3,'matematik','TYT')",[q1,q2,outside])
    await client.query("INSERT INTO public.daily_plan(id,user_id,game,plan_date,exam_ref,question_ids,completed_ids) VALUES($1,$2,'matematik',$3,'TYT',$4::uuid[],'{}'::uuid[])",[legacyPlan,user,date,[q1,q2]])
    const replay=(await create(user,date,[item(1,q1)])).rows[0].result
    expect(replay.planId).toBe(legacyPlan)
    expect(replay.items).toEqual([])
    const left=new Client({ connectionString:url }); const right=new Client({ connectionString:url })
    let completions
    try {
      await Promise.all([left.connect(),right.connect()])
      completions=await Promise.all([
        left.query('SELECT public.complete_daily_plan_items($1::uuid,$2::uuid,$3::uuid[]) result',[user,legacyPlan,[q2,outside]]),
        right.query('SELECT public.complete_daily_plan_items($1::uuid,$2::uuid,$3::uuid[]) result',[user,legacyPlan,[q1]]),
      ])
    } finally {
      await Promise.allSettled([left.end(),right.end()])
    }
    expect(completions.flatMap((result) => result.rows[0].result.completedIds)).toEqual(expect.arrayContaining([q1,q2]))
    const persisted=(await client.query('SELECT completed_ids FROM public.daily_plan WHERE id=$1',[legacyPlan])).rows[0].completed_ids
    expect(persisted).toEqual([q1,q2])
    const replayCompletion=(await client.query('SELECT public.complete_daily_plan_items($1::uuid,$2::uuid,$3::uuid[]) result',[user,legacyPlan,[q1]])).rows[0].result
    expect(replayCompletion.completedIds).toEqual([q1,q2])
    expect((await client.query('SELECT count(*) FROM public.daily_plan_items WHERE plan_id=$1',[legacyPlan])).rows[0].count).toBe('0')
  })
})
