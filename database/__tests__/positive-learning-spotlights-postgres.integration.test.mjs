import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.SPOTLIGHTS_TEST_DATABASE_URL;
if (databaseUrl && process.env.SPOTLIGHTS_TEST_DATABASE_DISPOSABLE !== '1') throw new Error('Set SPOTLIGHTS_TEST_DATABASE_DISPOSABLE=1 for the disposable spotlight DB');
if (databaseUrl && !/^bilge_r32_test_[a-z0-9_]+$/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Refusing non-disposable spotlight database');
const suite = databaseUrl && process.env.SPOTLIGHTS_TEST_DATABASE_DISPOSABLE === '1' ? describe : describe.skip;
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const migration = (name) => readFileSync(join(dir, name), 'utf8');
const { Client } = pg;

suite('102 positive learning spotlights real PostgreSQL', () => {
  let client; let week; let question; let users; let owner;
  const rpc = (id) => client.query('SELECT public.get_my_weekly_learning_spotlights($1) AS result', [id]).then(({ rows }) => rows[0].result);
  async function service(call) { await client.query('SET ROLE service_role'); try { return await call(); } finally { await client.query('RESET ROLE'); } }
  async function session(userId, dayOffset, correct = 5, answered = 5) {
    const at = new Date(new Date(`${week}T12:00:00Z`).getTime() + dayOffset * 86_400_000);
    const sid = randomUUID();
    await client.query(`INSERT INTO public.game_sessions(id,user_id,status,correct_count,total_questions,completed_at)
      VALUES($1,$2,'completed',$3,$4,$5::timestamptz)`, [sid,userId,correct,answered,at]);
    await client.query(`INSERT INTO public.verified_attempts(user_id,game,mode,question_ids,duration_sec,started_at,expires_at,completed_at,session_id)
      VALUES($1,'wordquest','classic',ARRAY[$2]::uuid[],60,$3::timestamptz-interval '1 minute',$3::timestamptz+interval '1 minute',$3::timestamptz,$4)`, [userId,question,at,sid]);
  }
  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl }); await client.connect();
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth; CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    await client.query(`DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.uid',true),'')::uuid $$;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY,exam_type text,display_name text,username text,avatar_url text,deleted_at timestamptz);
      CREATE TABLE public.questions(id uuid PRIMARY KEY,game text NOT NULL,is_active boolean NOT NULL DEFAULT true);
      CREATE TABLE public.game_sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.profiles(id),status text NOT NULL,correct_count integer NOT NULL,total_questions integer NOT NULL,completed_at timestamptz);
      CREATE TABLE public.friendships(user_id uuid NOT NULL,friend_id uuid NOT NULL,status text NOT NULL,PRIMARY KEY(user_id,friend_id));`);
    for (const name of ['091_verified_attempts.sql','101_relative_weekly_learning_leagues.sql','102_positive_learning_spotlights.sql']) {
      try {
        await client.query(migration(name));
      } catch (error) {
        const details = [error.position && `position=${error.position}`, error.where && `where=${error.where}`]
          .filter(Boolean)
          .join('; ');
        error.message = `${name}: ${error.message}${details ? `; ${details}` : ''}`;
        throw error;
      }
    }
    question=randomUUID(); await client.query("INSERT INTO public.questions(id,game) VALUES($1,'wordquest')",[question]);
    week=String((await client.query('SELECT public.weekly_learning_league_week_start(clock_timestamp())::text AS week')).rows[0].week);
    const cohort=(await client.query("INSERT INTO public.weekly_learning_league_cohorts(week_start,exam_type,tier,cohort_number) VALUES($1,'yks','bronz',1) RETURNING id",[week])).rows[0].id;
    users=Array.from({length:5},()=>randomUUID()); owner=users[4];
    for (const [i,id] of users.entries()) {
      await client.query('INSERT INTO public.profiles(id,display_name,username,avatar_url) VALUES($1,$2,$3,$4)',[id,`Rival ${i}`,`r${i}`,i===3?'//evil.test/a.png':'/safe.png']);
      await client.query('INSERT INTO public.weekly_learning_league_preferences(user_id,opted_in,effective_week_start) VALUES($1,true,$2)',[id,week]);
      await client.query("INSERT INTO public.weekly_learning_league_memberships(week_start,cohort_id,user_id,status) VALUES($1,$2,$3,'active')",[week,cohort,id]);
    }
    // u0 improves (20 baseline answers then 10/10 over two days); u1 is most consistent;
    // u2 is a true comeback; owner has two active days but no baseline/comeback history.
    await session(users[0],-28,10,20); await session(users[0],0,5,5); await session(users[0],1,5,5);
    for (const d of [0,1,2]) await session(users[1],d,5,5);
    await session(users[2],-8,2,5); await session(users[2],0,5,5); await session(users[2],1,5,5);
    await session(users[3],0,5,5); await session(users[3],1,5,5);
    await session(owner,0,5,5); await session(owner,1,5,5);
    // A forged owner attempt that points at another user's completed session
    // must not create comeback history for the owner.
    const foreignSession = randomUUID();
    const foreignAt = new Date(new Date(`${week}T12:00:00Z`).getTime() - 8 * 86_400_000);
    await client.query(`INSERT INTO public.game_sessions(id,user_id,status,correct_count,total_questions,completed_at)
      VALUES($1,$2,'completed',5,5,$3::timestamptz)`, [foreignSession,users[0],foreignAt]);
    await client.query(`INSERT INTO public.verified_attempts(user_id,game,mode,question_ids,duration_sec,started_at,expires_at,completed_at,session_id)
      VALUES($1,'wordquest','classic',ARRAY[$2]::uuid[],60,$3::timestamptz-interval '1 minute',$3::timestamptz+interval '1 minute',$3::timestamptz,$4)`, [owner,question,foreignAt,foreignSession]);
  });
  afterAll(async()=>{await client?.end();});

  it('proves thresholds, dense consistency, top3+owner, comeback and fail-closed privacy', async () => {
    await client.query("INSERT INTO public.friendships(user_id,friend_id,status) VALUES($1,$2,'blocked')",[owner,users[1]]);
    await client.query('UPDATE public.profiles SET deleted_at=clock_timestamp() WHERE id=$1',[users[0]]);
    await client.query("SELECT set_config('app.uid',$1,false)",[owner]);
    const result=await service(()=>rpc(owner));
    expect(result).toMatchObject({status:'active',weekStart:week,privacy:{cohortOnly:true,positiveOnly:true,verifiedOnly:true,fullTableHidden:true}});
    for (const board of Object.values(result.boards)) {
      expect(board.entries.length).toBeLessThanOrEqual(4);
      const ownerRows = board.entries.filter((entry) => entry.isMe);
      if (board.me.eligible) {
        expect(ownerRows).toHaveLength(1);
        expect(ownerRows[0]).toMatchObject({rank:board.me.rank,value:board.me.value});
      } else {
        expect(ownerRows).toHaveLength(0);
      }
    }
    expect(result.boards.improved.entries[0]).toMatchObject({rank:1,value:expect.any(Number),name:'Gizli Arenacı',avatarUrl:null});
    expect(result.boards.consistent.entries[0]).toMatchObject({rank:1,value:3,name:'Gizli Arenacı',avatarUrl:null});
    expect(result.boards.consistent.me).toMatchObject({eligible:true,rank:2,value:2});
    expect(result.boards.comeback.entries.some((entry)=>entry.value===2)).toBe(true);
    expect(result.boards.comeback.me).toEqual({eligible:false,rank:null,value:null});
    expect(JSON.stringify(result)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(JSON.stringify(result)).not.toContain('//evil.test');
  });

  it('enforces owner scope and service-role-only ACL/RLS', async () => {
    await client.query("SELECT set_config('app.uid',$1,false)",[owner]);
    await expect(service(()=>rpc(users[0]))).rejects.toMatchObject({code:'42501'});
    const catalog=await client.query(`SELECT has_function_privilege('service_role','public.get_my_weekly_learning_spotlights(uuid)','EXECUTE') AS service_exec,has_function_privilege('anon','public.get_my_weekly_learning_spotlights(uuid)','EXECUTE') AS anon_exec,has_table_privilege('service_role','public.weekly_learning_league_memberships','INSERT') AS direct_insert,(SELECT relrowsecurity FROM pg_class WHERE oid='public.weekly_learning_league_memberships'::regclass) AS rls`);
    expect(catalog.rows[0]).toMatchObject({service_exec:true,anon_exec:false,direct_insert:false,rls:true});
  });
});
