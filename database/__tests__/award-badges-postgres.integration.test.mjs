// Opt-in, disposable PostgreSQL verification for award_badges (migrations 087/088)
// on top of the actual increment_xp and xp_log reason contract of migration 071.
// It refuses any database outside the explicit R0.2 test naming convention.
//
// award-badges-atomic.test.mjs only reads the SQL text. Before this file the only
// executed check was an opt-in smoke script against production. These cases run
// the function: XP must follow the rows that were really inserted, including when
// two callers race for the same badge.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SUPABASE_DEFAULT_PRIVILEGES_SQL } from './supabase-default-privileges.mjs';

const { Client } = pg;
const databaseUrl = process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_URL;
const disposableConfirmation = process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE;
if (databaseUrl && disposableConfirmation !== '1') {
  throw new Error('Refusing award_badges integration test without VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE=1');
}
if (databaseUrl && !/^bilge_r02_test_[a-z0-9_]+$/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('Refusing award_badges integration test against a non-disposable database name');
}

const runIntegration = Boolean(databaseUrl && disposableConfirmation === '1');
const describePostgres = runIntegration ? describe : describe.skip;
const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationSql = (filename) => readFileSync(join(__dirname, '..', 'migrations', filename), 'utf8');

// Badge XP as declared in migration 088.
const XP = { first_game: 50, ten_games: 100, fifty_games: 250, streak_5: 75, xp_50000: 2000 };

// profiles, xp_log and user_achievements as the earlier migrations leave them.
const fixtureSql = `
  CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
  DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE money_rpc_probe NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role, money_rpc_probe;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    total_xp integer NOT NULL DEFAULT 0,
    level integer NOT NULL DEFAULT 1,
    level_name varchar(32) NOT NULL DEFAULT 'Acemi'
  );
  CREATE TABLE public.xp_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    amount integer NOT NULL,
    reason text NOT NULL,
    reference_id uuid,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
  CREATE TABLE public.user_achievements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    achievement_id text NOT NULL,
    earned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (user_id, achievement_id)
  );
`;

async function award(client, userId, codes) {
  await client.query('SET ROLE service_role');
  try {
    const result = await client.query(
      'SELECT awarded_codes, total_xp_earned FROM public.award_badges($1::uuid, $2::text[])', [userId, codes],
    );
    return { codes: result.rows[0].awarded_codes, xp: Number(result.rows[0].total_xp_earned) };
  } finally {
    await client.query('RESET ROLE');
  }
}

async function state(client, userId) {
  const result = await client.query(`
    SELECT p.total_xp, p.level, p.level_name,
      (SELECT coalesce(array_agg(achievement_id ORDER BY achievement_id), '{}') FROM public.user_achievements WHERE user_id = p.id) AS badges,
      (SELECT coalesce(array_agg(amount ORDER BY created_at), '{}') FROM public.xp_log WHERE user_id = p.id AND reason = 'badge_earned') AS xp_rows
    FROM public.profiles p WHERE p.id = $1
  `, [userId]);
  return result.rows[0];
}

async function newUser(client) {
  const id = randomUUID();
  await client.query('INSERT INTO public.profiles (id) VALUES ($1)', [id]);
  return id;
}

// Wait until the given backend is blocked on a lock, so the race below is the
// one the migration has to survive, not a lucky serial order.
async function waitUntilBlocked(client, pid) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await client.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1', [pid]);
    if (result.rows[0]?.wait_event_type === 'Lock') return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('second caller never blocked on the first caller');
}

async function race(codesFirst, codesSecond, userId) {
  const first = new Client({ connectionString: databaseUrl });
  const second = new Client({ connectionString: databaseUrl });
  const observer = new Client({ connectionString: databaseUrl });
  await Promise.all([first.connect(), second.connect(), observer.connect()]);
  try {
    const secondPid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await first.query('BEGIN');
    const firstResult = await award(first, userId, codesFirst);
    const secondPromise = award(second, userId, codesSecond);
    await waitUntilBlocked(observer, secondPid);
    await first.query('COMMIT');
    return [firstResult, await secondPromise];
  } finally {
    await Promise.all([first.end(), second.end(), observer.end()]);
  }
}

describePostgres('award_badges (087/088) on actual PostgreSQL', () => {
  let client;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;');
    await client.query(fixtureSql);
    await client.query(SUPABASE_DEFAULT_PRIVILEGES_SQL);
    for (const migration of [
      '071_xp_ledger_level_security_fix.sql',
      '087_award_badges_atomic.sql',
      '088_repair_award_badges_concurrency.sql',
    ]) {
      await client.query(migrationSql(migration));
    }
  });

  afterAll(async () => { await client?.end(); });

  it('is a definer RPC that only service_role can execute', async () => {
    const result = await client.query(`
      SELECT
        (SELECT prosecdef FROM pg_proc WHERE oid = 'public.award_badges(uuid,text[])'::regprocedure) AS definer,
        has_function_privilege('service_role', 'public.award_badges(uuid,text[])', 'EXECUTE') AS service_role,
        has_function_privilege('authenticated', 'public.award_badges(uuid,text[])', 'EXECUTE') AS authenticated,
        has_function_privilege('anon', 'public.award_badges(uuid,text[])', 'EXECUTE') AS anon,
        has_function_privilege('money_rpc_probe', 'public.award_badges(uuid,text[])', 'EXECUTE') AS public_default,
        has_function_privilege('authenticated', 'public.increment_xp(uuid,integer,text,uuid)', 'EXECUTE') AS auth_increment_xp
    `);
    expect(result.rows[0]).toEqual({
      definer: true, service_role: true, authenticated: false, anon: false, public_default: false, auth_increment_xp: false,
    });
  });

  it('awards each known code once, ignores duplicate, unknown and NULL codes, and pays their XP in one ledger row', async () => {
    const user = await newUser(client);
    const result = await award(client, user, ['ten_games', 'first_game', 'first_game', 'not_a_badge', null]);

    expect(result).toEqual({ codes: ['first_game', 'ten_games'], xp: XP.first_game + XP.ten_games });
    expect(await state(client, user)).toMatchObject({
      total_xp: XP.first_game + XP.ten_games,
      badges: ['first_game', 'ten_games'],
      xp_rows: [XP.first_game + XP.ten_games],
    });
  });

  it('pays only for the codes that are new on a later call', async () => {
    const user = await newUser(client);
    await award(client, user, ['first_game']);
    const result = await award(client, user, ['first_game', 'streak_5']);

    expect(result).toEqual({ codes: ['streak_5'], xp: XP.streak_5 });
    expect(await state(client, user)).toMatchObject({
      total_xp: XP.first_game + XP.streak_5,
      xp_rows: [XP.first_game, XP.streak_5],
    });
  });

  it('writes nothing and does not raise when nothing is new', async () => {
    // increment_xp raises on a non-positive amount; a repeat call must not reach it.
    const user = await newUser(client);
    await award(client, user, ['first_game']);
    for (const codes of [['first_game'], ['bogus'], [], null]) {
      expect(await award(client, user, codes)).toEqual({ codes: [], xp: 0 });
    }
    expect(await state(client, user)).toMatchObject({ total_xp: XP.first_game, xp_rows: [XP.first_game] });
  });

  it('recomputes the level through the real increment_xp', async () => {
    const user = await newUser(client);
    await award(client, user, ['xp_50000']);
    expect(await state(client, user)).toMatchObject({ total_xp: XP.xp_50000, level: 2, level_name: 'Cirak' });
  });

  it('pays the XP once when a second caller races the first for the same badges', async () => {
    const user = await newUser(client);
    const codes = ['fifty_games', 'first_game', 'ten_games'];
    const [first, second] = await race(codes, codes, user);

    expect(first).toEqual({ codes, xp: XP.first_game + XP.ten_games + XP.fifty_games });
    expect(second).toEqual({ codes: [], xp: 0 });
    expect(await state(client, user)).toMatchObject({
      total_xp: XP.first_game + XP.ten_games + XP.fifty_games,
      badges: codes,
      xp_rows: [XP.first_game + XP.ten_games + XP.fifty_games],
    });
  });

  it('pays the racing caller only for the badge it really inserted', async () => {
    const user = await newUser(client);
    const [first, second] = await race(['first_game', 'ten_games'], ['streak_5', 'ten_games'], user);

    expect(first).toEqual({ codes: ['first_game', 'ten_games'], xp: XP.first_game + XP.ten_games });
    expect(second).toEqual({ codes: ['streak_5'], xp: XP.streak_5 });
    expect(await state(client, user)).toMatchObject({
      total_xp: XP.first_game + XP.ten_games + XP.streak_5,
      badges: ['first_game', 'streak_5', 'ten_games'],
    });
  });
});
