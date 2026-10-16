// Opt-in, disposable PostgreSQL verification for award_error_report_reward
// (migration 128) on the actual error_reports (003), increment_coins (055/064)
// and has_permission (157) definitions. It refuses any database outside the
// explicit R0.2 test naming convention.
//
// error-report-rewards-sql.test.mjs only reads the SQL text. These cases execute
// the coin payment: resolved-only, once per report even across status changes and
// a racing second admin, bounded amount, permission and self-reward checks.
//
// Not covered on purpose: the "reporter is NULL" branch. error_reports.user_id is
// NOT NULL since 003, so that branch is unreachable with the current schema.
// Known gap, pinned in the report but not asserted as desired behaviour: the
// payment is recorded on the report row only, not in reward_ledger.
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
  throw new Error('Refusing error report reward integration test without VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE=1');
}
if (databaseUrl && !/^bilge_r02_test_[a-z0-9_]+$/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('Refusing error report reward integration test against a non-disposable database name');
}

const runIntegration = Boolean(databaseUrl && disposableConfirmation === '1');
const describePostgres = runIntegration ? describe : describe.skip;
const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationSql = (filename) => readFileSync(join(__dirname, '..', 'migrations', filename), 'utf8');

// The live permission check, taken from its latest definition instead of a mock.
const hasPermissionSql = migrationSql('157_question_answer_key_lockdown.sql')
  .match(/CREATE OR REPLACE FUNCTION public\.has_permission\(p_user_id uuid, p_permission text\)[\s\S]*?\$fn\$;/)?.[0];

const fixtureSql = `
  CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
  DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE money_rpc_probe NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role, money_rpc_probe;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id), role text NOT NULL DEFAULT 'user');
  CREATE TABLE public.questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
  CREATE TABLE public.user_roles (user_id uuid NOT NULL, role_id uuid NOT NULL, PRIMARY KEY (user_id, role_id));
  CREATE TABLE public.role_permissions (role_id uuid NOT NULL, permission text NOT NULL, PRIMARY KEY (role_id, permission));
`;

const REPORTS_MANAGE = 'admin.reports.manage';

describePostgres('award_error_report_reward (128) on actual PostgreSQL', () => {
  let client;
  let admin;        // holds admin.reports.manage
  let otherAdmin;   // second admin, for the race
  let viewer;       // admin role without admin.reports.manage
  let questionId;

  async function newUser({ permissions = [] } = {}) {
    const id = randomUUID();
    await client.query('INSERT INTO auth.users (id) VALUES ($1)', [id]);
    await client.query('INSERT INTO public.profiles (id) VALUES ($1)', [id]);
    if (permissions.length) {
      const roleId = randomUUID();
      await client.query('INSERT INTO public.user_roles (user_id, role_id) VALUES ($1, $2)', [id, roleId]);
      await client.query(
        'INSERT INTO public.role_permissions (role_id, permission) SELECT $1, unnest($2::text[])', [roleId, permissions],
      );
    }
    return id;
  }

  async function newReport(reporter, status = 'resolved') {
    const result = await client.query(
      `INSERT INTO public.error_reports (user_id, question_id, report_type, status)
       VALUES ($1, $2, 'wrong_answer', $3) RETURNING id`, [reporter, questionId, status],
    );
    return result.rows[0].id;
  }

  async function reward(connection, adminId, reportId, coins) {
    await connection.query('SET ROLE service_role');
    try {
      const result = await connection.query(
        'SELECT public.award_error_report_reward($1::uuid, $2::uuid, $3::integer) AS result', [adminId, reportId, coins],
      );
      return result.rows[0].result;
    } finally {
      await connection.query('RESET ROLE');
    }
  }

  async function coins(userId) {
    const result = await client.query('SELECT coin_balance FROM public.profiles WHERE id = $1', [userId]);
    return Number(result.rows[0].coin_balance);
  }

  async function reportState(reportId) {
    const result = await client.query(
      'SELECT rewarded_at IS NOT NULL AS rewarded, rewarded_coins FROM public.error_reports WHERE id = $1', [reportId],
    );
    return result.rows[0];
  }

  beforeAll(async () => {
    expect(hasPermissionSql, 'has_permission must come from migration 157').toBeTruthy();
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;');
    await client.query(fixtureSql);
    await client.query(SUPABASE_DEFAULT_PRIVILEGES_SQL);
    for (const migration of ['003_add_error_reports.sql', '055_coin_balance.sql', '064_coin_rpc_lockdown.sql']) {
      await client.query(migrationSql(migration));
    }
    await client.query(hasPermissionSql);
    await client.query(migrationSql('128_error_report_rewards.sql'));

    questionId = (await client.query('INSERT INTO public.questions DEFAULT VALUES RETURNING id')).rows[0].id;
    admin = await newUser({ permissions: [REPORTS_MANAGE] });
    otherAdmin = await newUser({ permissions: [REPORTS_MANAGE] });
    viewer = await newUser({ permissions: ['admin.dashboard.view'] });
  });

  afterAll(async () => { await client?.end(); });

  it('is a definer RPC only service_role can execute, and increment_coins is closed to clients', async () => {
    const result = await client.query(`
      SELECT
        (SELECT prosecdef FROM pg_proc WHERE oid = 'public.award_error_report_reward(uuid,uuid,integer)'::regprocedure) AS definer,
        has_function_privilege('service_role', 'public.award_error_report_reward(uuid,uuid,integer)', 'EXECUTE') AS service_role,
        has_function_privilege('authenticated', 'public.award_error_report_reward(uuid,uuid,integer)', 'EXECUTE') AS authenticated,
        has_function_privilege('anon', 'public.award_error_report_reward(uuid,uuid,integer)', 'EXECUTE') AS anon,
        has_function_privilege('money_rpc_probe', 'public.award_error_report_reward(uuid,uuid,integer)', 'EXECUTE') AS public_default,
        has_function_privilege('authenticated', 'public.increment_coins(uuid,integer)', 'EXECUTE') AS auth_increment_coins
    `);
    expect(result.rows[0]).toEqual({
      definer: true, service_role: true, authenticated: false, anon: false, public_default: false, auth_increment_coins: false,
    });
  });

  it('pays the reporter of a resolved report once and records it on the report', async () => {
    const reporter = await newUser();
    const reportId = await newReport(reporter);
    expect(await reward(client, admin, reportId, 40)).toEqual({ reportId, awarded: true, replayed: false, coins: 40 });
    expect(await coins(reporter)).toBe(40);
    expect(await reportState(reportId)).toEqual({ rewarded: true, rewarded_coins: 40 });
  });

  it('replays with the original amount instead of paying again, even for a different amount', async () => {
    const reporter = await newUser();
    const reportId = await newReport(reporter);
    await reward(client, admin, reportId, 40);
    expect(await reward(client, admin, reportId, 300)).toEqual({ reportId, awarded: false, replayed: true, coins: 40 });
    expect(await coins(reporter)).toBe(40);
  });

  it('does not pay again after the report leaves resolved and comes back', async () => {
    const reporter = await newUser();
    const reportId = await newReport(reporter);
    await reward(client, admin, reportId, 40);
    await client.query("UPDATE public.error_reports SET status = 'reviewed' WHERE id = $1", [reportId]);
    await client.query("UPDATE public.error_reports SET status = 'resolved' WHERE id = $1", [reportId]);
    expect(await reward(client, admin, reportId, 40)).toMatchObject({ awarded: false, replayed: true });
    expect(await coins(reporter)).toBe(40);
  });

  it.each(['pending', 'reviewed', 'rejected'])('refuses a %s report with P0003 and pays nothing', async (status) => {
    const reporter = await newUser();
    const reportId = await newReport(reporter, status);
    await expect(reward(client, admin, reportId, 40)).rejects.toMatchObject({ code: 'P0003' });
    expect(await coins(reporter)).toBe(0);
    expect(await reportState(reportId)).toEqual({ rewarded: false, rewarded_coins: null });
  });

  it.each([0, -1, 301, null])('rejects amount %s with 22023 before reading the report', async (amount) => {
    const reporter = await newUser();
    const reportId = await newReport(reporter);
    await expect(reward(client, admin, reportId, amount)).rejects.toMatchObject({ code: '22023' });
    expect(await coins(reporter)).toBe(0);
  });

  it.each([1, 300])('accepts the boundary amount %i', async (amount) => {
    const reporter = await newUser();
    const reportId = await newReport(reporter);
    expect(await reward(client, admin, reportId, amount)).toMatchObject({ awarded: true, coins: amount });
    expect(await coins(reporter)).toBe(amount);
  });

  it('requires admin.reports.manage of the acting admin', async () => {
    const reporter = await newUser();
    const reportId = await newReport(reporter);
    for (const actor of [viewer, reporter]) {
      await expect(reward(client, actor, reportId, 40)).rejects.toMatchObject({ code: '42501' });
    }
    expect(await coins(reporter)).toBe(0);
    expect(await reportState(reportId)).toEqual({ rewarded: false, rewarded_coins: null });
  });

  it('does not let an admin reward their own report', async () => {
    const reportId = await newReport(admin);
    const before = await coins(admin);
    expect(await reward(client, admin, reportId, 40)).toEqual({ reportId, awarded: false, replayed: false, coins: 0 });
    expect(await coins(admin)).toBe(before);
    expect(await reportState(reportId)).toEqual({ rewarded: false, rewarded_coins: null });
  });

  it('reports a missing report with P0002', async () => {
    await expect(reward(client, admin, randomUUID(), 40)).rejects.toMatchObject({ code: 'P0002' });
  });

  it('pays once when a second admin races the first for the same report', async () => {
    const reporter = await newUser();
    const reportId = await newReport(reporter);
    const first = new Client({ connectionString: databaseUrl });
    const second = new Client({ connectionString: databaseUrl });
    const observer = new Client({ connectionString: databaseUrl });
    await Promise.all([first.connect(), second.connect(), observer.connect()]);
    let results;
    try {
      const secondPid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await first.query('BEGIN');
      const firstResult = await reward(first, admin, reportId, 40);
      const secondPromise = reward(second, otherAdmin, reportId, 60);
      let blocked = false;
      for (let attempt = 0; attempt < 200 && !blocked; attempt += 1) {
        const activity = await observer.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1', [secondPid]);
        blocked = activity.rows[0]?.wait_event_type === 'Lock';
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(blocked, 'second admin must wait on the report row lock').toBe(true);
      await first.query('COMMIT');
      results = [firstResult, await secondPromise];
    } finally {
      await Promise.all([first.end(), second.end(), observer.end()]);
    }
    expect(results).toEqual([
      { reportId, awarded: true, replayed: false, coins: 40 },
      { reportId, awarded: false, replayed: true, coins: 40 },
    ]);
    expect(await coins(reporter)).toBe(40);
  });
});
