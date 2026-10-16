// Opt-in, disposable PostgreSQL verification for claim_activation_reward
// (migration 111) on top of the actual increment_xp of migration 071.
// It refuses any database outside the explicit R0.2 test naming convention.
//
// No test of any kind exercised this RPC before: src tests mock it and there is
// no SQL text test. It pays XP, so its one-claim-per-account rule, its amount
// bounds and its race behaviour are pinned here against PostgreSQL.
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
  throw new Error('Refusing activation reward integration test without VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE=1');
}
if (databaseUrl && !/^bilge_r02_test_[a-z0-9_]+$/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('Refusing activation reward integration test against a non-disposable database name');
}

const runIntegration = Boolean(databaseUrl && disposableConfirmation === '1');
const describePostgres = runIntegration ? describe : describe.skip;
const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationSql = (filename) => readFileSync(join(__dirname, '..', 'migrations', filename), 'utf8');

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
`;

async function claim(client, userId, claimId, amount) {
  await client.query('SET ROLE service_role');
  try {
    const result = await client.query(
      'SELECT public.claim_activation_reward($1::uuid, $2::uuid, $3::integer) AS result', [userId, claimId, amount],
    );
    return result.rows[0].result;
  } finally {
    await client.query('RESET ROLE');
  }
}

async function state(client, userId) {
  const result = await client.query(`
    SELECT p.total_xp,
      (SELECT count(*)::int FROM public.activation_reward_claims WHERE user_id = p.id) AS claims,
      (SELECT coalesce(json_agg(json_build_object('amount', amount, 'reference', reference_id) ORDER BY created_at), '[]')
         FROM public.xp_log WHERE user_id = p.id AND reason = 'activation_bonus') AS xp_rows
    FROM public.profiles p WHERE p.id = $1
  `, [userId]);
  return result.rows[0];
}

async function newUser(client) {
  const id = randomUUID();
  await client.query('INSERT INTO public.profiles (id) VALUES ($1)', [id]);
  return id;
}

async function waitUntilBlocked(client, pid) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await client.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1', [pid]);
    if (result.rows[0]?.wait_event_type === 'Lock') return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('second claim never blocked on the first claim');
}

describePostgres('claim_activation_reward (111) on actual PostgreSQL', () => {
  let client;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;');
    await client.query(fixtureSql);
    await client.query(SUPABASE_DEFAULT_PRIVILEGES_SQL);
    for (const migration of ['071_xp_ledger_level_security_fix.sql', '111_activation_reward_claims.sql']) {
      await client.query(migrationSql(migration));
    }
  });

  afterAll(async () => { await client?.end(); });

  it('is a definer RPC only service_role can execute, over a table clients cannot touch', async () => {
    const result = await client.query(`
      SELECT
        (SELECT prosecdef FROM pg_proc WHERE oid = 'public.claim_activation_reward(uuid,uuid,integer)'::regprocedure) AS definer,
        has_function_privilege('service_role', 'public.claim_activation_reward(uuid,uuid,integer)', 'EXECUTE') AS service_role,
        has_function_privilege('authenticated', 'public.claim_activation_reward(uuid,uuid,integer)', 'EXECUTE') AS authenticated,
        has_function_privilege('anon', 'public.claim_activation_reward(uuid,uuid,integer)', 'EXECUTE') AS anon,
        has_function_privilege('money_rpc_probe', 'public.claim_activation_reward(uuid,uuid,integer)', 'EXECUTE') AS public_default,
        has_table_privilege('authenticated', 'public.activation_reward_claims', 'SELECT') AS auth_select,
        has_table_privilege('authenticated', 'public.activation_reward_claims', 'INSERT') AS auth_insert,
        (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.activation_reward_claims'::regclass) AS rls
    `);
    expect(result.rows[0]).toEqual({
      definer: true, service_role: true, authenticated: false, anon: false, public_default: false,
      auth_select: false, auth_insert: false, rls: true,
    });
  });

  it.each([-50, 25, 151, 200])('rejects amount %i before writing anything', async (amount) => {
    const user = await newUser(client);
    await expect(claim(client, user, randomUUID(), amount)).rejects.toMatchObject({ code: '22023' });
    expect(await state(client, user)).toEqual({ total_xp: 0, claims: 0, xp_rows: [] });
  });

  it('pays the claimed XP once, referenced by the claim id', async () => {
    const user = await newUser(client);
    const claimId = randomUUID();
    expect(await claim(client, user, claimId, 150)).toEqual({ xpAwarded: 150, alreadyProcessed: false });
    expect(await state(client, user)).toEqual({ total_xp: 150, claims: 1, xp_rows: [{ amount: 150, reference: claimId }] });
  });

  it('treats a replay of the same claim and a new claim id for the same account as already processed', async () => {
    const user = await newUser(client);
    const claimId = randomUUID();
    await claim(client, user, claimId, 100);
    expect(await claim(client, user, claimId, 100)).toEqual({ xpAwarded: 0, alreadyProcessed: true });
    // One reward per account, not per request: a second claim id cannot pay again.
    expect(await claim(client, user, randomUUID(), 150)).toEqual({ xpAwarded: 0, alreadyProcessed: true });
    expect(await state(client, user)).toMatchObject({ total_xp: 100, claims: 1 });
  });

  it('records a zero claim without calling increment_xp, and it still uses up the account claim', async () => {
    // increment_xp raises on a non-positive amount; a 0 XP claim must not reach it.
    const user = await newUser(client);
    expect(await claim(client, user, randomUUID(), 0)).toEqual({ xpAwarded: 0, alreadyProcessed: false });
    expect(await claim(client, user, randomUUID(), 150)).toEqual({ xpAwarded: 0, alreadyProcessed: true });
    expect(await state(client, user)).toEqual({ total_xp: 0, claims: 1, xp_rows: [] });
  });

  it('does not let another account reuse a claim id to collect a second reward', async () => {
    const owner = await newUser(client);
    const other = await newUser(client);
    const claimId = randomUUID();
    await claim(client, owner, claimId, 50);
    expect(await claim(client, other, claimId, 150)).toEqual({ xpAwarded: 0, alreadyProcessed: true });
    expect(await state(client, other)).toEqual({ total_xp: 0, claims: 0, xp_rows: [] });
  });

  it('pays once when two claims for the same account race', async () => {
    const user = await newUser(client);
    const first = new Client({ connectionString: databaseUrl });
    const second = new Client({ connectionString: databaseUrl });
    const observer = new Client({ connectionString: databaseUrl });
    await Promise.all([first.connect(), second.connect(), observer.connect()]);
    let results;
    try {
      const secondPid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await first.query('BEGIN');
      const firstResult = await claim(first, user, randomUUID(), 150);
      const secondPromise = claim(second, user, randomUUID(), 150);
      await waitUntilBlocked(observer, secondPid);
      await first.query('COMMIT');
      results = [firstResult, await secondPromise];
    } finally {
      await Promise.all([first.end(), second.end(), observer.end()]);
    }
    expect(results).toEqual([
      { xpAwarded: 150, alreadyProcessed: false },
      { xpAwarded: 0, alreadyProcessed: true },
    ]);
    expect(await state(client, user)).toMatchObject({ total_xp: 150, claims: 1 });
  });
});
