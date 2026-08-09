// Opt-in disposable PostgreSQL smoke/parity harness for migration 094.
// Requires VERIFIED_ATTEMPTS_TEST_DATABASE_URL=.../bilge_r02_test_* and
// VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE=1. It is intentionally not run
// by normal CI until the embedded-PG runner allowlist includes this target.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fsrs, createEmptyCard, generatorParameters, Rating } from 'ts-fsrs'

const url = process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_URL
const enabled = Boolean(url && process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE === '1')
if (url && !/^bilge_r02_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error('non-disposable database refused')
const describePg = enabled ? describe : describe.skip
const migration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '094_persistent_fsrs.sql'), 'utf8')
const { Client } = pg
const scheduler = fsrs(generatorParameters({ enable_fuzz: false }))

function tsFsrsCard(events) {
  let card = createEmptyCard(new Date(events[0].at))
  for (const event of events) {
    card = scheduler.next(card, new Date(event.at), event.correct ? Rating.Good : Rating.Again).card
  }
  return card
}

function expectParity(actual, expected) {
  expect(new Date(actual.due_at).getTime()).toBe(expected.due.getTime())
  expect(Number(actual.stability)).toBeCloseTo(expected.stability, 6)
  expect(Number(actual.difficulty)).toBeCloseTo(expected.difficulty, 6)
  expect(Number(actual.state)).toBe(expected.state)
  expect(Number(actual.reps)).toBe(expected.reps)
  expect(Number(actual.lapses)).toBe(expected.lapses)
}

describePg('094 persistent FSRS real PostgreSQL', () => {
  let client; let user; let question; let session
  beforeAll(async () => {
    client = new Client({ connectionString: url }); await client.connect()
    await client.query(`DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$; ALTER ROLE service_role BYPASSRLS; REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role; GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY); CREATE TABLE public.questions(id uuid PRIMARY KEY); CREATE TABLE public.game_sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.profiles(id),status text NOT NULL);
      CREATE TABLE public.session_answers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES public.game_sessions(id),question_id uuid NOT NULL REFERENCES public.questions(id),user_id uuid NOT NULL REFERENCES public.profiles(id),is_correct boolean NOT NULL,is_skipped boolean,answered_at timestamptz NOT NULL DEFAULT clock_timestamp());`)
    await client.query(migration)
    user=randomUUID(); question=randomUUID(); session=randomUUID()
    await client.query('INSERT INTO public.profiles VALUES($1)',[user])
    await client.query('INSERT INTO public.questions VALUES($1)',[question])
    await client.query("INSERT INTO public.game_sessions VALUES($1,$2,'completed')",[session,user])
  })
  afterAll(async () => client?.end())
  async function asRole(role, work) {
    await client.query(`SET ROLE ${role}`)
    try {
      return await work()
    } finally {
      await client.query('RESET ROLE')
    }
  }
  it('enforces the intended RLS, table ACL, and operational RPC surface', async () => {
    const relations=await client.query(`
      SELECT c.relname, c.relrowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('review_cards','review_logs','review_error_reasons','review_error_annotations')
      ORDER BY c.relname`)
    expect(relations.rows).toEqual([
      { relname:'review_cards', relrowsecurity:true },
      { relname:'review_error_annotations', relrowsecurity:true },
      { relname:'review_error_reasons', relrowsecurity:true },
      { relname:'review_logs', relrowsecurity:true },
    ])
    const policies=await client.query(`
      SELECT tablename, policyname, cmd, roles::text AS roles
      FROM pg_policies
      WHERE schemaname='public' AND tablename IN ('review_cards','review_logs','review_error_reasons','review_error_annotations')
      ORDER BY tablename, policyname`)
    expect(policies.rows).toEqual([{
      tablename:'review_error_reasons',
      policyname:'review_error_reasons_catalog_select',
      cmd:'SELECT',
      roles:'{authenticated}',
    }])
    const schemaPrivileges=await client.query(`SELECT
      has_schema_privilege('anon','public','USAGE') AS anon_usage,
      has_schema_privilege('authenticated','public','USAGE') AS authenticated_usage,
      has_schema_privilege('service_role','public','USAGE') AS service_usage,
      has_schema_privilege('anon','public','CREATE') AS anon_create,
      has_schema_privilege('authenticated','public','CREATE') AS authenticated_create,
      has_schema_privilege('service_role','public','CREATE') AS service_create`)
    expect(schemaPrivileges.rows[0]).toEqual({
      anon_usage:true, authenticated_usage:true, service_usage:true,
      anon_create:false, authenticated_create:false, service_create:false,
    })
    const tablePrivileges=await client.query(`
      WITH roles(role_name) AS (VALUES ('authenticated'),('service_role')),
      tables(table_name) AS (VALUES
        ('public.review_cards'),('public.review_logs'),
        ('public.review_error_reasons'),('public.review_error_annotations')
      ), privileges(privilege) AS (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'))
      SELECT role_name, table_name, privilege,
        has_table_privilege(role_name::name, table_name, privilege) AS allowed
      FROM roles CROSS JOIN tables CROSS JOIN privileges
      ORDER BY role_name, table_name, privilege`)
    const allowed=Object.fromEntries(tablePrivileges.rows.map((row) => [`${row.role_name}:${row.table_name}:${row.privilege}`,row.allowed]))
    for (const [key,value] of Object.entries(allowed)) {
      const expected = key === 'authenticated:public.review_error_reasons:SELECT'
        || (key.startsWith('service_role:') && key.endsWith(':SELECT'))
      expect(value).toBe(expected)
    }
    const functionPrivileges=await client.query(`SELECT
      has_function_privilege('authenticated','public.backfill_review_cards(timestamptz,uuid,integer)','EXECUTE') AS authenticated_backfill,
      has_function_privilege('authenticated','public.set_review_error_reason(uuid,uuid,text)','EXECUTE') AS authenticated_reason,
      has_function_privilege('service_role','public.backfill_review_cards(timestamptz,uuid,integer)','EXECUTE') AS service_backfill,
      has_function_privilege('service_role','public.set_review_error_reason(uuid,uuid,text)','EXECUTE') AS service_reason,
      has_function_privilege('service_role','public.fsrs_review_transition(smallint,numeric,numeric,timestamptz,integer,integer,integer,timestamptz,smallint)','EXECUTE') AS service_transition,
      has_function_privilege('service_role','public.apply_review_answer(uuid)','EXECUTE') AS service_apply,
      has_function_privilege('service_role','public.rebuild_review_card(uuid,uuid)','EXECUTE') AS service_rebuild`)
    expect(functionPrivileges.rows[0]).toEqual({
      authenticated_backfill:false, authenticated_reason:false,
      service_backfill:true, service_reason:true,
      service_transition:false, service_apply:false, service_rebuild:false,
    })
    await asRole('authenticated', async () => {
      expect((await client.query('SELECT count(*) FROM public.review_error_reasons WHERE is_active')).rows[0].count).toBe('6')
      await expect(client.query('SELECT * FROM public.review_cards')).rejects.toMatchObject({ code:'42501' })
      await expect(client.query('SELECT public.backfill_review_cards(NULL::timestamptz,NULL::uuid,1)')).rejects.toMatchObject({ code:'42501' })
    })
    await asRole('service_role', async () => {
      expect((await client.query('SELECT count(*) FROM public.review_cards')).rows[0].count).toBe('0')
      await expect(client.query('DELETE FROM public.review_cards')).rejects.toMatchObject({ code:'42501' })
      expect((await client.query('SELECT public.backfill_review_cards(NULL::timestamptz,NULL::uuid,1) result')).rows[0].result.processed).toBe(0)
    })
  })
  it('writes Again/Good logs once, skips skips, and rebuilds chronological state', async () => {
    const first=randomUUID(); const skip=randomUUID(); const earlier=randomUUID()
    await client.query('INSERT INTO public.session_answers(id,session_id,question_id,user_id,is_correct,is_skipped,answered_at) VALUES($1,$2,$3,$4,false,false,$5),($6,$2,$3,$4,true,true,$5),($7,$2,$3,$4,true,false,$8)',[first,session,question,user,'2026-01-03T00:00:00Z',skip,earlier,'2026-01-01T00:00:00Z'])
    const counts=await client.query('SELECT (SELECT count(*) FROM public.review_logs) logs,(SELECT reps FROM public.review_cards WHERE user_id=$1 AND question_id=$2) reps',[user,question])
    expect(counts.rows[0]).toMatchObject({ logs:'2', reps:2 })
    const card=await client.query('SELECT state,last_answer_id FROM public.review_cards WHERE user_id=$1 AND question_id=$2',[user,question])
    expect(card.rows[0].last_answer_id).toBe(first)
    await client.query('SELECT public.apply_review_answer($1)',[first])
    const replayed=await client.query('SELECT (SELECT count(*) FROM public.review_logs WHERE question_id=$2) logs,(SELECT reps FROM public.review_cards WHERE user_id=$1 AND question_id=$2) reps',[user,question])
    expect(replayed.rows[0]).toMatchObject({ logs:'2', reps:2 })
  })
  it('matches pinned ts-fsrs@5.4.1 for Again/Good, elapsed Good, and relearning Again', async () => {
    const q=randomUUID(); await client.query('INSERT INTO public.questions VALUES($1)',[q])
    const events=[
      { id: randomUUID(), at: '2026-02-01T00:00:00Z', correct: false }, // New -> Again
      { id: randomUUID(), at: '2026-02-01T00:01:00Z', correct: true },  // learning -> Good
      { id: randomUUID(), at: '2026-02-04T00:00:00Z', correct: true },  // elapsed Good
      { id: randomUUID(), at: '2026-03-01T00:00:00Z', correct: false }, // review -> Again/relearning
    ]
    for (const event of events) await client.query('INSERT INTO public.session_answers(id,session_id,question_id,user_id,is_correct,is_skipped,answered_at) VALUES($1,$2,$3,$4,$5,false,$6)',[event.id,session,q,user,event.correct,event.at])
    const card=await client.query('SELECT * FROM public.review_cards WHERE user_id=$1 AND question_id=$2',[user,q])
    expectParity(card.rows[0],tsFsrsCard(events))
  })
  it('matches pinned ts-fsrs for a same-UTC-day Good after New -> Good', async () => {
    const q=randomUUID(); await client.query('INSERT INTO public.questions VALUES($1)',[q])
    const events=[
      { id: randomUUID(), at: '2026-04-01T00:00:00Z', correct: true },
      { id: randomUUID(), at: '2026-04-01T00:10:00Z', correct: true },
    ]
    for (const event of events) await client.query('INSERT INTO public.session_answers(id,session_id,question_id,user_id,is_correct,is_skipped,answered_at) VALUES($1,$2,$3,$4,$5,false,$6)',[event.id,session,q,user,event.correct,event.at])
    const card=await client.query('SELECT * FROM public.review_cards WHERE user_id=$1 AND question_id=$2',[user,q])
    expectParity(card.rows[0],tsFsrsCard(events))
  })
  it('rebuilds when a lower answer UUID arrives at the same timestamp', async () => {
    const q=randomUUID(); const at='2026-05-01T00:00:00Z'
    const low='00000000-0000-4000-8000-000000000001'; const high='00000000-0000-4000-8000-000000000002'
    const ordered=[{ id:low,at,correct:false },{ id:high,at,correct:true }]
    await client.query('INSERT INTO public.questions VALUES($1)',[q])
    await client.query('INSERT INTO public.session_answers(id,session_id,question_id,user_id,is_correct,is_skipped,answered_at) VALUES($1,$2,$3,$4,true,false,$5)',[high,session,q,user,at])
    await client.query('INSERT INTO public.session_answers(id,session_id,question_id,user_id,is_correct,is_skipped,answered_at) VALUES($1,$2,$3,$4,false,false,$5)',[low,session,q,user,at])
    const card=await client.query('SELECT * FROM public.review_cards WHERE user_id=$1 AND question_id=$2',[user,q])
    expect(card.rows[0].last_answer_id).toBe(high)
    expectParity(card.rows[0],tsFsrsCard(ordered))
  })
  it('serializes concurrent same-card answers and retains chronological FSRS parity', async () => {
    const q=randomUUID(); const low='00000000-0000-4000-8000-000000000003'; const high='00000000-0000-4000-8000-000000000004'
    const events=[
      { id:low,at:'2026-06-01T00:00:00Z',correct:false },
      { id:high,at:'2026-06-02T00:00:00Z',correct:true },
    ]
    await client.query('INSERT INTO public.questions VALUES($1)',[q])
    const left=new Client({ connectionString:url }); const right=new Client({ connectionString:url })
    try {
      await Promise.all([left.connect(),right.connect()])
      await Promise.all(events.map((event, index) => (index === 0 ? left : right).query(
        'INSERT INTO public.session_answers(id,session_id,question_id,user_id,is_correct,is_skipped,answered_at) VALUES($1,$2,$3,$4,$5,false,$6)',
        [event.id,session,q,user,event.correct,event.at],
      )))
    } finally {
      await Promise.allSettled([left.end(),right.end()])
    }
    const counts=await client.query('SELECT (SELECT count(*) FROM public.review_logs WHERE question_id=$1) logs,(SELECT reps FROM public.review_cards WHERE user_id=$2 AND question_id=$1) reps',[q,user])
    expect(counts.rows[0]).toMatchObject({ logs:'2', reps:2 })
    const card=await client.query('SELECT * FROM public.review_cards WHERE user_id=$1 AND question_id=$2',[user,q])
    expectParity(card.rows[0],tsFsrsCard(events))
  })
  it('rejects an error reason for a Good review', async () => {
    const q=randomUUID(); const answer=randomUUID(); await client.query('INSERT INTO public.questions VALUES($1)',[q])
    await client.query('INSERT INTO public.session_answers(id,session_id,question_id,user_id,is_correct,is_skipped) VALUES($1,$2,$3,$4,true,false)',[answer,session,q,user])
    const log=await client.query('SELECT id FROM public.review_logs WHERE answer_id=$1',[answer])
    await expect(client.query("SELECT public.set_review_error_reason($1,$2,'guess')",[user,log.rows[0].id])).rejects.toMatchObject({ code:'22023' })
  })
  it('allows an owner to annotate an Again review and rejects another user', async () => {
    const q=randomUUID(); const answer=randomUUID(); const other=randomUUID()
    await client.query('INSERT INTO public.questions VALUES($1)',[q])
    await client.query('INSERT INTO public.profiles VALUES($1)',[other])
    await client.query('INSERT INTO public.session_answers(id,session_id,question_id,user_id,is_correct,is_skipped) VALUES($1,$2,$3,$4,false,false)',[answer,session,q,user])
    const log=await client.query('SELECT id FROM public.review_logs WHERE answer_id=$1',[answer])
    await client.query("SELECT public.set_review_error_reason($1,$2,'guess')",[user,log.rows[0].id])
    const annotation=await client.query('SELECT user_id,reason_code FROM public.review_error_annotations WHERE review_log_id=$1',[log.rows[0].id])
    expect(annotation.rows[0]).toMatchObject({ user_id:user, reason_code:'guess' })
    await expect(client.query("SELECT public.set_review_error_reason($1,$2,'guess')",[other,log.rows[0].id])).rejects.toMatchObject({ code:'42501' })
  })
  it('keeps backfill bounded and answer-id idempotent', async () => {
    const result=await client.query('SELECT public.backfill_review_cards(NULL,NULL,1) result')
    expect(result.rows[0].result.processed).toBe(0)
    await expect(client.query('SELECT public.backfill_review_cards(NULL,NULL,1001)')).rejects.toMatchObject({ code:'22023' })
  })
  it('rolls session_answers back if the FSRS trigger cannot append its log', async () => {
    await client.query(`CREATE FUNCTION public.fixture_fsrs_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('test.fsrs_fail',true)='on' THEN RAISE EXCEPTION 'forced fsrs failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_fsrs_fail BEFORE INSERT ON public.review_logs FOR EACH ROW EXECUTE FUNCTION public.fixture_fsrs_fail();`)
    const q=randomUUID(); const answer=randomUUID(); await client.query('INSERT INTO public.questions VALUES($1)',[q]); await client.query("SELECT set_config('test.fsrs_fail','on',false)")
    await expect(client.query('INSERT INTO public.session_answers(id,session_id,question_id,user_id,is_correct,is_skipped) VALUES($1,$2,$3,$4,true,false)',[answer,session,q,user])).rejects.toMatchObject({ code:'P0001' })
    await client.query("SELECT set_config('test.fsrs_fail','off',false)")
    expect((await client.query('SELECT count(*) FROM public.session_answers WHERE id=$1',[answer])).rows[0].count).toBe('0')
  })
})
