// Disposable real-PostgreSQL proof for migration 177. It never connects unless
// the caller explicitly marks the narrowly named database as disposable.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const databaseUrl = process.env.LEADERBOARD_PRIVACY_TEST_DATABASE_URL
if (databaseUrl && process.env.LEADERBOARD_PRIVACY_TEST_DATABASE_DISPOSABLE !== '1') {
  throw new Error('Refusing leaderboard privacy PostgreSQL test without disposable confirmation')
}
if (databaseUrl && !/^bilge_inst_test_[a-z0-9_]+$/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('Refusing leaderboard privacy test against a non-disposable database name')
}

const suite = databaseUrl && process.env.LEADERBOARD_PRIVACY_TEST_DATABASE_DISPOSABLE === '1'
  ? describe
  : describe.skip
const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
  '177_private_leaderboard_opt_in.sql',
)
const migration = readFileSync(migrationPath, 'utf8')
const { Client } = pg

const fixture = `
  DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  ALTER ROLE service_role BYPASSRLS;

  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    username varchar NOT NULL,
    display_name varchar,
    avatar_url text,
    level_name varchar,
    current_streak smallint NOT NULL DEFAULT 0,
    total_xp integer NOT NULL DEFAULT 0,
    deleted_at timestamptz,
    is_discoverable boolean NOT NULL DEFAULT false
  );
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  CREATE POLICY profiles_select_all ON public.profiles FOR SELECT USING (true);
  GRANT SELECT ON public.profiles TO anon, authenticated, service_role;

  CREATE TABLE public.leaderboard_weekly (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    week_start date NOT NULL,
    week_end date NOT NULL,
    xp_earned integer NOT NULL DEFAULT 0,
    sessions_played integer NOT NULL DEFAULT 0,
    correct_answers integer NOT NULL DEFAULT 0,
    accuracy_pct numeric,
    rank integer
  );
  ALTER TABLE public.leaderboard_weekly ENABLE ROW LEVEL SECURITY;
  CREATE POLICY lb_select_all ON public.leaderboard_weekly FOR SELECT USING (true);
  GRANT SELECT ON public.leaderboard_weekly TO anon, authenticated, service_role;

  CREATE VIEW public.leaderboard_weekly_ranked WITH (security_invoker = true) AS
  SELECT lw.*, p.username, p.display_name, p.avatar_url, p.level_name, p.current_streak,
    rank() OVER (PARTITION BY lw.week_start ORDER BY lw.xp_earned DESC) AS current_rank
  FROM public.leaderboard_weekly lw
  JOIN public.profiles p ON p.id = lw.user_id
  WHERE lw.week_start = date_trunc('week', now())::date;
  GRANT SELECT ON public.leaderboard_weekly_ranked TO anon, authenticated, service_role;

  CREATE FUNCTION public.search_profiles(q text, exclude_id uuid DEFAULT NULL, result_limit integer DEFAULT 10)
  RETURNS TABLE(id uuid, username varchar, display_name varchar, avatar_url text, total_xp integer)
  LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    SELECT p.id, p.username, p.display_name, p.avatar_url, p.total_xp
    FROM public.profiles p
    WHERE p.is_discoverable
      AND (exclude_id IS NULL OR p.id <> exclude_id)
    ORDER BY p.total_xp DESC
    LIMIT LEAST(GREATEST(result_limit, 1), 50)
  $$;
  GRANT EXECUTE ON FUNCTION public.search_profiles(text, uuid, integer) TO authenticated;
`

async function expectPgError(call, code) {
  try {
    await call()
    throw new Error(`expected PostgreSQL error ${code}`)
  } catch (error) {
    expect(error.code).toBe(code)
  }
}

suite('177 private leaderboard real PostgreSQL', () => {
  let client
  let hiddenUser
  let visibleUser
  const weekStart = new Date()
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7))
  const week = weekStart.toISOString().slice(0, 10)

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl })
    await client.connect()
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
    await client.query(fixture)

    hiddenUser = randomUUID()
    visibleUser = randomUUID()
    await client.query(
      `INSERT INTO public.profiles(id, username, total_xp, is_discoverable)
       VALUES ($1, 'hidden_player', 5000, true), ($2, 'visible_player', 3000, true)`,
      [hiddenUser, visibleUser],
    )
    await client.query(
      `INSERT INTO public.leaderboard_weekly(id, user_id, week_start, week_end, xp_earned)
       VALUES ($1, $2, $3, $3::date + 6, 500), ($4, $5, $3, $3::date + 6, 300)`,
      [randomUUID(), hiddenUser, week, randomUUID(), visibleUser],
    )

    await client.query(migration)
  })

  afterAll(async () => {
    await client?.end()
  })

  it('hides every legacy account until an explicit change and records that change atomically', async () => {
    const defaults = await client.query(
      'SELECT id, leaderboard_opt_in FROM public.profiles ORDER BY username',
    )
    expect(defaults.rows.every((row) => row.leaderboard_opt_in === false)).toBe(true)

    await client.query(
      'UPDATE public.profiles SET leaderboard_opt_in = true WHERE id = $1',
      [visibleUser],
    )
    const evidence = await client.query(
      `SELECT user_id, previous_visible, new_visible
       FROM public.leaderboard_visibility_events`,
    )
    expect(evidence.rows).toEqual([{
      user_id: visibleUser,
      previous_visible: false,
      new_visible: true,
    }])
  })

  it('returns only opted-in users through the service view', async () => {
    await client.query('SET ROLE service_role')
    try {
      const ranked = await client.query(
        'SELECT user_id, username, current_rank FROM public.leaderboard_weekly_ranked',
      )
      expect(ranked.rows).toEqual([expect.objectContaining({
        user_id: visibleUser,
        username: 'visible_player',
        current_rank: '1',
      })])
    } finally {
      await client.query('RESET ROLE')
    }
  })

  it('blocks browser roles from profiles, weekly rows, the ranked view and evidence', async () => {
    for (const role of ['anon', 'authenticated']) {
      await client.query(`SET ROLE ${role}`)
      try {
        await expectPgError(() => client.query('SELECT username FROM public.profiles'), '42501')
        await expectPgError(() => client.query('SELECT user_id FROM public.leaderboard_weekly'), '42501')
        await expectPgError(() => client.query('SELECT username FROM public.leaderboard_weekly_ranked'), '42501')
        await expectPgError(() => client.query('SELECT user_id FROM public.leaderboard_visibility_events'), '42501')
      } finally {
        await client.query('RESET ROLE')
      }
    }
  })

  it('moves profile search execution behind the service route and remains idempotent', async () => {
    const grants = await client.query(`SELECT
      has_function_privilege('authenticated', 'public.search_profiles(text,uuid,integer)', 'EXECUTE') AS auth_exec,
      has_function_privilege('service_role', 'public.search_profiles(text,uuid,integer)', 'EXECUTE') AS service_exec`)
    expect(grants.rows[0]).toEqual({ auth_exec: false, service_exec: true })

    await client.query(migration)
    const eventCount = await client.query(
      'SELECT count(*)::int AS count FROM public.leaderboard_visibility_events',
    )
    expect(eventCount.rows[0].count).toBe(1)
  })
})
