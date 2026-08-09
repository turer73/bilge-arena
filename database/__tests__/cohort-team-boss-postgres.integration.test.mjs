import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.TEAM_BOSS_TEST_DATABASE_URL;
if (databaseUrl && process.env.TEAM_BOSS_TEST_DATABASE_DISPOSABLE !== '1') throw new Error('Set TEAM_BOSS_TEST_DATABASE_DISPOSABLE=1 for disposable team-boss DB');
if (databaseUrl && !/^bilge_r33_test_[a-z0-9_]+$/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Refusing non-disposable team-boss DB');
const suite = databaseUrl && process.env.TEAM_BOSS_TEST_DATABASE_DISPOSABLE === '1' ? describe : describe.skip;
const migrations = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const migration = (name) => readFileSync(join(migrations, name), 'utf8');
const { Client } = pg;

suite('103 cohort team boss real PostgreSQL', () => {
  let client; let week; let question; let users; let owner;
  async function service(fn) { await client.query('SET ROLE service_role'); try { return await fn(); } finally { await client.query('RESET ROLE'); } }
  async function boss(id) { return (await client.query('SELECT public.get_my_weekly_team_boss($1) AS result',[id])).rows[0].result; }
  async function verifiedContribution(userId, correct = 15, dayOffset = 0) {
    const at = new Date(Date.now() + dayOffset * 86_400_000); const session = randomUUID();
    await client.query("INSERT INTO public.game_sessions(id,user_id,status,correct_count,total_questions,completed_at) VALUES($1,$2,'completed',$3,$3,$4::timestamptz)",[session,userId,correct,at]);
    const attempt = (await client.query("INSERT INTO public.verified_attempts(user_id,game,mode,question_ids,duration_sec,started_at,expires_at) VALUES($1,'wordquest','classic',ARRAY[$2]::uuid[],60,$3::timestamptz-interval '1 minute',$3::timestamptz+interval '1 minute') RETURNING id",[userId,question,at])).rows[0].id;
    await client.query('UPDATE public.verified_attempts SET session_id=$1,completed_at=$2::timestamptz WHERE id=$3',[session,at,attempt]);
  }
  beforeAll(async () => {
    client=new Client({connectionString:databaseUrl}); await client.connect();
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;');
    await client.query(`DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.uid',true),'')::uuid $$;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY,exam_type text,display_name text,username text,avatar_url text,deleted_at timestamptz);
      CREATE TABLE public.questions(id uuid PRIMARY KEY,game text NOT NULL,is_active boolean NOT NULL DEFAULT true);
      CREATE TABLE public.game_sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.profiles(id),status text NOT NULL,correct_count integer NOT NULL,total_questions integer NOT NULL,completed_at timestamptz);
      CREATE TABLE public.friendships(user_id uuid NOT NULL,friend_id uuid NOT NULL,status text NOT NULL,PRIMARY KEY(user_id,friend_id));`);
    for (const name of ['091_verified_attempts.sql','101_relative_weekly_learning_leagues.sql','103_cohort_team_boss.sql']) await client.query(migration(name));
    question=randomUUID(); await client.query("INSERT INTO public.questions(id,game) VALUES($1,'wordquest')",[question]);
    week=String((await client.query('SELECT public.weekly_learning_league_week_start(clock_timestamp())::text AS week')).rows[0].week);
    const cohort=(await client.query("INSERT INTO public.weekly_learning_league_cohorts(week_start,exam_type,tier,cohort_number) VALUES($1,'yks','bronz',1) RETURNING id",[week])).rows[0].id;
    users=Array.from({length:20},()=>randomUUID()); owner=users[0];
    for (const [i,id] of users.entries()) { await client.query('INSERT INTO public.profiles(id,display_name,username) VALUES($1,$2,$3)',[id,`P${i}`,`p${i}`]); await client.query('INSERT INTO public.weekly_learning_league_preferences(user_id,opted_in,effective_week_start) VALUES($1,true,$2)',[id,week]); await client.query("INSERT INTO public.weekly_learning_league_memberships(week_start,cohort_id,user_id,status) VALUES($1,$2,$3,'active')",[week,cohort,id]); }
  });
  afterAll(async()=>{await client?.end();});

  it('returns strict null surfaces for opted-out and waiting owners', async () => {
    const optedOut=randomUUID(); const waiting=randomUUID();
    await client.query('INSERT INTO public.profiles(id) VALUES($1),($2)',[optedOut,waiting]);
    await client.query('INSERT INTO public.weekly_learning_league_preferences(user_id,opted_in,effective_week_start) VALUES($1,true,$2)',[waiting,week]);
    await client.query("SELECT set_config('app.uid',$1,false)",[optedOut]);
    expect(await service(()=>boss(optedOut))).toMatchObject({status:'opted_out',weekStart:null,boss:null,team:null});
    await client.query("SELECT set_config('app.uid',$1,false)",[waiting]);
    expect(await service(()=>boss(waiting))).toMatchObject({status:'waiting',weekStart:null,boss:null,team:null});
  });

  it('derives pre-target and defeated progress only from the 101 verified trigger chain', async () => {
    await verifiedContribution(owner); await client.query("SELECT set_config('app.uid',$1,false)",[owner]);
    const early=await service(()=>boss(owner));
    expect(early).toMatchObject({status:'active',weekStart:week,boss:{name:'Unutma Ejderi',target:600,progress:15,remaining:585,progressPercent:2,phase:'awakening',defeated:false},team:{memberCount:20,activeMemberCount:1,ownerContribution:15}});
    await verifiedContribution(owner); await verifiedContribution(owner); // third session is capped at zero by 101's daily limit
    for (const user of users.slice(1)) { await verifiedContribution(user); await verifiedContribution(user); }
    const done=await service(()=>boss(owner));
    expect(done).toMatchObject({boss:{target:600,progress:600,remaining:0,progressPercent:100,phase:'defeated',defeated:true},team:{memberCount:20,activeMemberCount:20,ownerContribution:30}});
    const istanbulDow=Number((await client.query("SELECT extract(isodow FROM clock_timestamp() AT TIME ZONE 'Europe/Istanbul') AS dow")).rows[0].dow);
    await verifiedContribution(users[1],15,istanbulDow===7 ? -1 : 1); // another Istanbul day, still this cohort week
    const overkill=await service(()=>boss(owner));
    expect(overkill.boss).toMatchObject({target:600,progress:600,remaining:0,progressPercent:100,phase:'defeated',defeated:true});
    await client.query("UPDATE public.weekly_learning_league_cohorts SET status='finalized' WHERE week_start=$1",[week]);
    expect(await service(()=>boss(owner))).toMatchObject({status:'finalized',boss:{phase:'defeated'}});
    expect(JSON.stringify(done)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
  it('enforces owner scope and service-only ACL/RLS', async () => {
    await client.query("SELECT set_config('app.uid',$1,false)",[owner]);
    await expect(service(()=>boss(users[1]))).rejects.toMatchObject({code:'42501'});
    const state=await client.query(`SELECT has_function_privilege('service_role','public.get_my_weekly_team_boss(uuid)','EXECUTE') AS service_exec,has_function_privilege('anon','public.get_my_weekly_team_boss(uuid)','EXECUTE') AS anon_exec,has_table_privilege('service_role','public.weekly_learning_league_contributions','INSERT') AS direct_insert,(SELECT relrowsecurity FROM pg_class WHERE oid='public.weekly_learning_league_contributions'::regclass) AS rls`);
    expect(state.rows[0]).toMatchObject({service_exec:true,anon_exec:false,direct_insert:false,rls:true});
  });
});
