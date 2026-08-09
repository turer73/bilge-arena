// Disposable real-PostgreSQL proof for 091 + 101. It never connects unless the
// caller explicitly confirms that WLL_TEST_DATABASE_URL is disposable.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.WLL_TEST_DATABASE_URL;
if (databaseUrl && process.env.WLL_TEST_DATABASE_DISPOSABLE !== '1') {
  throw new Error('Refusing WLL PostgreSQL test without WLL_TEST_DATABASE_DISPOSABLE=1');
}
if (databaseUrl && !/^bilge_r31_test_[a-z0-9_]+$/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('Refusing WLL PostgreSQL test against a non-disposable database name');
}
const suite = databaseUrl && process.env.WLL_TEST_DATABASE_DISPOSABLE === '1' ? describe : describe.skip;
const migrations = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const migration = (name) => readFileSync(join(migrations, name), 'utf8');
const { Client } = pg;

const fixture = `
  CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
  DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY, exam_type text, display_name text, username text,
    avatar_url text, deleted_at timestamptz, total_xp integer NOT NULL DEFAULT 0
  );
  CREATE TABLE public.questions (id uuid PRIMARY KEY, game text NOT NULL, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.game_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
    status text NOT NULL, correct_count integer NOT NULL DEFAULT 0, total_questions integer NOT NULL DEFAULT 0,
    completed_at timestamptz, total_xp integer NOT NULL DEFAULT 0
  );
  CREATE TABLE public.friendships (
    user_id uuid NOT NULL REFERENCES public.profiles(id), friend_id uuid NOT NULL REFERENCES public.profiles(id),
    status text NOT NULL, PRIMARY KEY (user_id, friend_id)
  );
`;

async function pgError(fn, code) {
  try { await fn(); throw new Error(`expected ${code}`); } catch (error) { expect(error.code).toBe(code); }
}

suite('101 relative weekly leagues real PostgreSQL', () => {
  let client; let week; let question; let activeUsers; let scorer; let viewer; let deletedRival;

  const rpc = (fn, args) => client.query(`SELECT ${fn} AS result`, args).then(({ rows }) => rows[0].result);
  async function withService(call) {
    await client.query('SET ROLE service_role');
    try { return await call(); } finally { await client.query('RESET ROLE'); }
  }
  async function eligible(userId, at) {
    const sessionId = randomUUID();
    await client.query(`INSERT INTO public.game_sessions (id,user_id,status,correct_count,total_questions,completed_at)
      VALUES ($1,$2,'completed',1,1,$3)`, [sessionId, userId, at]);
    await client.query(`INSERT INTO public.verified_attempts
      (user_id,game,mode,question_ids,duration_sec,started_at,expires_at,completed_at,session_id)
      VALUES ($1,'wordquest','classic',ARRAY[$2]::uuid[],60,$3::timestamptz - interval '1 minute',$3::timestamptz + interval '1 minute',$3::timestamptz,$4)`, [userId, question, at, sessionId]);
  }
  async function completeForLeague(userId, correct) {
    const sessionId = randomUUID(); const now = new Date();
    await client.query(`INSERT INTO public.game_sessions (id,user_id,status,correct_count,total_questions,completed_at)
      VALUES ($1,$2,'completed',$3,$3,$4)`, [sessionId, userId, correct, now]);
    const attempt = await client.query(`INSERT INTO public.verified_attempts
      (user_id,game,mode,question_ids,duration_sec,started_at,expires_at)
      VALUES ($1,'wordquest','classic',ARRAY[$2]::uuid[],60,$3::timestamptz - interval '1 minute',$3::timestamptz + interval '1 minute') RETURNING id`, [userId, question, now]);
    await client.query('UPDATE public.verified_attempts SET session_id=$1, completed_at=$2 WHERE id=$3', [sessionId, now, attempt.rows[0].id]);
    return attempt.rows[0].id;
  }

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl }); await client.connect();
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;');
    await client.query(fixture);
    await client.query(migration('091_verified_attempts.sql'));
    await client.query(migration('101_relative_weekly_learning_leagues.sql'));
    question = randomUUID(); await client.query("INSERT INTO public.questions (id,game) VALUES ($1,'wordquest')", [question]);
    const result = await client.query('SELECT public.weekly_learning_league_week_start(clock_timestamp())::text AS week');
    week = String(result.rows[0].week);
    const prior = new Date(new Date(`${week}T00:00:00Z`).getTime() - 86_400_000);
    const groups = [['e19', 19], ['e20', 20], ['e31', 31], ['e40', 40]];
    activeUsers = []; let n = 0;
    for (const [exam, count] of groups) for (let i = 0; i < count; i += 1) {
      const id = randomUUID(); activeUsers.push({ id, exam });
      await client.query(`INSERT INTO public.profiles (id,exam_type,display_name,username,avatar_url)
        VALUES ($1,$2,$3,$4,$5)`, [id, exam, ` Player ${n} `, `u${n}`, i === 1 ? 'javascript:bad' : '/avatars/a.png']);
      await client.query(`INSERT INTO public.weekly_learning_league_preferences (user_id,opted_in,effective_week_start)
        VALUES ($1,true,$2)`, [id, week]);
      await eligible(id, prior); n += 1;
    }
    const e20 = activeUsers.filter((user) => user.exam === 'e20');
    scorer = e20[0].id; deletedRival = e20[1].id; viewer = e20[19].id;
  });
  afterAll(async () => { await client?.end(); });

  it('applies prerequisites + 101 and proves ACL/RLS, preference canonical replay and mismatch rejection', async () => {
    const user = activeUsers[0].id; const request = randomUUID();
    const first = await withService(() => rpc('public.set_weekly_learning_league_preference($1,$2,$3)', [user, false, request]));
    const replay = await withService(() => rpc('public.set_weekly_learning_league_preference($1,$2,$3)', [user, false, request]));
    expect(first).toMatchObject({ optedIn: false, replayed: false });
    expect(replay).toMatchObject({ optedIn: false, replayed: true, effectiveWeekStart: first.effectiveWeekStart });
    await pgError(() => withService(() => rpc('public.set_weekly_learning_league_preference($1,$2,$3)', [user, true, request])), '22023');
    await pgError(() => withService(() => client.query('INSERT INTO public.weekly_learning_league_memberships (week_start,user_id,status) VALUES ($1,$2,$3)', [week, user, 'waiting'])), '42501');
    const catalog = await client.query(`SELECT
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.weekly_learning_league_preferences'::regclass) AS rls,
      has_table_privilege('service_role','public.weekly_learning_league_memberships','INSERT') AS direct_insert,
      has_function_privilege('service_role','public.form_weekly_learning_leagues(date,uuid)','EXECUTE') AS rpc_exec,
      has_function_privilege('anon','public.get_my_weekly_learning_league(uuid)','EXECUTE') AS anon_exec`);
    expect(catalog.rows[0]).toMatchObject({ rls: true, direct_insert: false, rpc_exec: true, anon_exec: false });
  });

  it('packs 19/20/31/40 deterministically, replays formation, caps contributions, finalizes tier, and redacts GET', async () => {
    // Restore the one preference changed by the preceding preference behavior test.
    await client.query('UPDATE public.weekly_learning_league_preferences SET opted_in=true,effective_week_start=$1 WHERE user_id=$2', [week, activeUsers[0].id]);
    const formed = await withService(() => rpc('public.form_weekly_learning_leagues($1,$2)', [week, randomUUID()]));
    expect(formed).toMatchObject({ formedCohortCount: 4, assignedMemberCount: 90, waitingMemberCount: 20, replayed: false });
    const replay = await withService(() => rpc('public.form_weekly_learning_leagues($1,$2)', [week, randomUUID()]));
    expect(replay).toMatchObject({ ...formed, replayed: true });
    const sizes = await client.query(`SELECT c.exam_type,count(*)::int AS count FROM public.weekly_learning_league_cohorts c
      JOIN public.weekly_learning_league_memberships m ON m.cohort_id=c.id WHERE c.week_start=$1 GROUP BY c.exam_type,c.id ORDER BY c.exam_type,c.id`, [week]);
    expect(sizes.rows.map((row) => [row.exam_type, Number(row.count)])).toEqual([
      ['e20', 20], ['e31', 30], ['e40', 20], ['e40', 20],
    ]);
    const waiting = await client.query("SELECT count(*)::int AS count FROM public.weekly_learning_league_memberships WHERE week_start=$1 AND status='waiting'", [week]);
    expect(Number(waiting.rows[0].count)).toBe(20);

    const attempts = [await completeForLeague(scorer, 20), await completeForLeague(scorer, 20), await completeForLeague(scorer, 20)];
    await client.query('UPDATE public.verified_attempts SET completed_at=completed_at WHERE id=$1', [attempts[0]]); // same session retry
    const contribution = await client.query('SELECT points FROM public.weekly_learning_league_contributions WHERE user_id=$1 ORDER BY created_at', [scorer]);
    expect(contribution.rows.map((row) => row.points)).toEqual([15, 15, 0]);
    const noXpWrite = await client.query('SELECT total_xp FROM public.profiles WHERE id=$1', [scorer]); expect(noXpWrite.rows[0].total_xp).toBe(0);

    await client.query("INSERT INTO public.friendships (user_id,friend_id,status) VALUES ($1,$2,'blocked')", [viewer, scorer]);
    await client.query('UPDATE public.weekly_learning_league_memberships SET points=20 WHERE user_id=$1 AND week_start=$2', [deletedRival, week]);
    await client.query("UPDATE public.profiles SET display_name='Deleted Visible Rival', avatar_url='//evil.example/avatar.png', deleted_at=clock_timestamp() WHERE id=$1", [deletedRival]);
    const view = await withService(() => rpc('public.get_my_weekly_learning_league($1)', [viewer]));
    expect(JSON.stringify(view)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(view.privacy).toEqual({ bottomHidden: true, sessionCap: 15, dailyCap: 30 });
    expect(view.entries.some((entry) => entry.name === 'Gizli Arenacı' && entry.avatarUrl === null)).toBe(true);
    expect(view.entries.filter((entry) => entry.name === 'Gizli Arenacı' && entry.avatarUrl === null)).toHaveLength(2);
    expect(JSON.stringify(view)).not.toContain('Deleted Visible Rival');
    expect(view.entries.every((entry) => entry.rank <= 3 || entry.rank <= view.week.memberCount - 3)).toBe(true);

    await withService(() => rpc('public.form_weekly_learning_leagues($1,$2)', [new Date(new Date(`${week}T00:00:00Z`).getTime() + 7 * 86_400_000).toISOString().slice(0, 10), randomUUID()]));
    const tier = await client.query('SELECT tier FROM public.weekly_learning_league_tiers WHERE user_id=$1', [scorer]);
    expect(tier.rows[0].tier).toBe('gumus');
  });
});
