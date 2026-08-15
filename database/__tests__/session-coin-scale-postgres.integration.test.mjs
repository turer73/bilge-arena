// Opt-in, disposable PostgreSQL verification for migration 129 on top of the
// actual 081, 091, 092 and 093 migrations. It refuses any database outside the
// explicit R0.2 test naming convention before resetting schemas.
//
// Migration 129 moves the coin payment out of complete_game_session and into
// apply_verified_session_rewards, next to the ledger row, and scales it:
//   3 per correct + 10 session bonus + 15 first session of the day, capped at 80.
// The static contract test (session-coin-scale-sql.test.mjs) only reads the SQL
// text; these cases execute it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const { Client } = pg;
const databaseUrl = process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_URL;
const disposableConfirmation = process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE;
if (databaseUrl && disposableConfirmation !== '1') {
  throw new Error('Refusing coin scale integration test without VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE=1');
}
if (databaseUrl && !/^bilge_r02_test_[a-z0-9_]+$/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('Refusing coin scale integration test against a non-disposable database name');
}

const runIntegration = Boolean(databaseUrl && disposableConfirmation === '1');
const describePostgres = runIntegration ? describe : describe.skip;
const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'migrations');
const migrationSql = (filename) => readFileSync(join(migrationsDir, filename), 'utf8');

// The agreed scale, mirrored from the migration constants.
const COIN_PER_CORRECT = 3;
const SESSION_BONUS = 10;
const FIRST_SESSION_BONUS = 15;
const DAILY_CAP = 80;

const fixtureSql = `
  CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
  DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    total_xp integer NOT NULL DEFAULT 0,
    level integer NOT NULL DEFAULT 1,
    level_name text NOT NULL DEFAULT 'Acemi',
    coin_balance integer NOT NULL DEFAULT 0,
    current_streak integer NOT NULL DEFAULT 1,
    longest_streak integer NOT NULL DEFAULT 1,
    total_sessions integer NOT NULL DEFAULT 0,
    correct_answers integer NOT NULL DEFAULT 0,
    rooms_completed integer NOT NULL DEFAULT 0,
    multiplayer_firsts integer NOT NULL DEFAULT 0
  );
  CREATE TABLE public.questions (id uuid PRIMARY KEY, game text NOT NULL, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.game_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
    game text NOT NULL, mode text NOT NULL, status text NOT NULL, total_questions integer NOT NULL,
    correct_count smallint NOT NULL, wrong_count smallint NOT NULL, skipped_count smallint NOT NULL,
    base_xp integer NOT NULL, bonus_xp integer NOT NULL, total_xp integer NOT NULL,
    time_spent_sec integer NOT NULL, avg_time_sec numeric NOT NULL, streak_at_start integer NOT NULL,
    filter_category text, filter_difficulty smallint, completed_at timestamptz
  );
  CREATE TABLE public.session_answers (
    session_id uuid NOT NULL REFERENCES public.game_sessions(id), question_id uuid NOT NULL,
    user_id uuid NOT NULL, selected_option smallint, is_correct boolean, is_skipped boolean,
    time_taken_sec numeric, is_fast boolean, xp_earned smallint, question_order smallint
  );
  CREATE TABLE public.user_topic_progress (
    user_id uuid NOT NULL, game text NOT NULL, category text NOT NULL, questions_seen integer NOT NULL,
    correct integer NOT NULL, last_seen_at timestamptz NOT NULL, PRIMARY KEY (user_id, game, category)
  );
  CREATE TABLE public.xp_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
    amount integer NOT NULL, reason text NOT NULL, reference_id uuid, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
  CREATE TABLE public.daily_quests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, quest_type text NOT NULL,
    target_value integer NOT NULL, target_game text, xp_reward integer NOT NULL, is_active boolean NOT NULL DEFAULT true
  );
  CREATE TABLE public.user_daily_quests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
    quest_id uuid NOT NULL REFERENCES public.daily_quests(id), date date NOT NULL, current_value integer NOT NULL DEFAULT 0,
    is_completed boolean NOT NULL DEFAULT false, completed_at timestamptz, xp_claimed boolean NOT NULL DEFAULT false
  );
  CREATE TABLE public.user_achievements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
    achievement_id text NOT NULL, earned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (user_id, achievement_id)
  );

  CREATE FUNCTION public.batch_increment_question_stats(uuid[], boolean[]) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END; $$;
  -- Mirrors migration 055: a non-positive amount raises, which is why the
  -- capped-out session must not call it at all.
  CREATE FUNCTION public.increment_coins(p_user_id uuid, p_amount integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
  BEGIN
    IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
    UPDATE public.profiles SET coin_balance = coin_balance + p_amount WHERE id = p_user_id;
  END; $$;
  CREATE FUNCTION public.increment_xp(p_user_id uuid, p_amount integer, p_reason text, p_reference uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
  BEGIN
    IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
    UPDATE public.profiles SET total_xp = total_xp + p_amount WHERE id = p_user_id;
    INSERT INTO public.xp_log (user_id, amount, reason, reference_id) VALUES (p_user_id, p_amount, p_reason, p_reference);
  END; $$;
  CREATE FUNCTION public.fixture_session_complete() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF OLD.status = 'active' AND NEW.status = 'completed' THEN
      UPDATE public.profiles
      SET total_sessions = total_sessions + 1,
          correct_answers = correct_answers + NEW.correct_count,
          longest_streak = GREATEST(longest_streak, current_streak)
      WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
  END; $$;
  CREATE TRIGGER fixture_session_complete AFTER UPDATE ON public.game_sessions
    FOR EACH ROW EXECUTE FUNCTION public.fixture_session_complete();
`;

async function withServiceRole(client, callback) {
  await client.query('SET ROLE service_role');
  try { return await callback(); } finally { await client.query('RESET ROLE'); }
}

async function freshQuestions(client, count) {
  const ids = Array.from({ length: count }, () => randomUUID());
  await client.query(
    'INSERT INTO public.questions (id, game) SELECT unnest($1::uuid[]), $2', [ids, 'wordquest'],
  );
  return ids;
}

// One answer row per issued question; the first `correct` of them are correct.
function answersFor(questionIds, correct) {
  return questionIds.map((questionId, index) => ({
    question_id: questionId,
    selected_option: 1,
    is_correct: index < correct,
    is_skipped: false,
    time_taken_sec: 3,
    is_fast: true,
    xp_earned: index < correct ? 10 : 0,
    question_order: index + 1,
  }));
}

async function issueAttempt(client, userId, questionIds) {
  const result = await client.query(
    'SELECT public.issue_verified_attempt($1, $2, $3, $4::uuid[], $5) AS result',
    [userId, 'wordquest', 'classic', questionIds, 600],
  );
  return result.rows[0].result;
}

async function completeAttempt(client, { attemptId, userId, requestId, questionIds, correct }) {
  const answers = answersFor(questionIds, correct);
  const wrong = questionIds.length - correct;
  const totalXp = correct * 10;
  const result = await client.query(
    `SELECT public.complete_verified_game_session(
      $1::uuid, $2::uuid, $3::uuid, 'wordquest'::text, 'classic'::text, 'fixture'::text,
      1::smallint, $4::jsonb, $5::integer, $5::integer, 0::integer,
      $6::smallint, $7::smallint, 30::integer, 3::numeric
    ) AS result`,
    [attemptId, userId, requestId, JSON.stringify(answers), totalXp, correct, wrong],
  );
  return result.rows[0].result;
}

// Issue + complete one full verified session for a user.
async function playSession(client, userId, { questionCount, correct }) {
  const questionIds = await freshQuestions(client, questionCount);
  const attempt = await withServiceRole(client, () => issueAttempt(client, userId, questionIds));
  const result = await withServiceRole(client, () => completeAttempt(client, {
    attemptId: attempt.attemptId, userId, requestId: randomUUID(), questionIds, correct,
  }));
  return { attemptId: attempt.attemptId, questionIds, ...result };
}

async function profileState(client, userId) {
  const result = await client.query(
    'SELECT total_xp, coin_balance FROM public.profiles WHERE id = $1', [userId],
  );
  return Object.fromEntries(Object.entries(result.rows[0]).map(([key, value]) => [key, Number(value)]));
}

// Session coin ledger rows in completion order, including the zero-amount rows
// a capped-out session still writes for the audit trail.
async function sessionCoinLedger(client, userId) {
  const result = await client.query(`
    SELECT amount, metadata->>'firstToday' AS first_today, (metadata->>'correct')::int AS correct
    FROM public.reward_ledger
    WHERE user_id = $1 AND source_type = 'session' AND reward_type = 'coin'
    ORDER BY created_at, source_id
  `, [userId]);
  return result.rows.map((row) => ({
    amount: Number(row.amount), firstToday: row.first_today === 'true', correct: row.correct,
  }));
}

describePostgres('migration 129 session coin scale on actual PostgreSQL migrations', () => {
  let client;
  const users = {};

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    // Guards above run before this reset; roles are cluster-wide and recreated idempotently.
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;');
    await client.query(fixtureSql);
    for (const migration of [
      '081_atomic_complete_game_session.sql',
      '091_verified_attempts.sql',
      '092_complete_verified_game_session.sql',
      '093_reward_integrity.sql',
      '129_session_coin_scale.sql',
    ]) {
      await client.query(migrationSql(migration));
    }
    // One user per behaviour: the daily cap is per user, so shared users would
    // leak state between cases.
    for (const key of ['scale', 'cap', 'replay', 'direct']) {
      users[key] = randomUUID();
      await client.query('INSERT INTO public.profiles (id) VALUES ($1)', [users[key]]);
    }
  });

  afterAll(async () => { await client?.end(); });

  it('leaves the coin payment only in the reward helper, and keeps its definer contract', async () => {
    const catalog = await client.query(`
      SELECT
        pg_get_functiondef('public.complete_game_session(uuid,uuid,text,text,text,smallint,jsonb,integer,integer,integer,smallint,smallint,integer,numeric)'::regprocedure) AS legacy_def,
        pg_get_functiondef('public.apply_verified_session_rewards(uuid,uuid)'::regprocedure) AS helper_def,
        (SELECT prosecdef FROM pg_proc WHERE oid = 'public.apply_verified_session_rewards(uuid,uuid)'::regprocedure) AS helper_definer,
        has_function_privilege('service_role', 'public.apply_verified_session_rewards(uuid,uuid)', 'EXECUTE') AS helper_service,
        has_function_privilege('authenticated', 'public.apply_verified_session_rewards(uuid,uuid)', 'EXECUTE') AS helper_auth
    `);
    const row = catalog.rows[0];
    expect(row.legacy_def).not.toContain('increment_coins');
    // Removing the XP payment from the same function would be a regression.
    expect(row.legacy_def).toContain('increment_xp');
    expect(row.helper_def).toContain('increment_coins');
    expect(row).toMatchObject({ helper_definer: true, helper_service: false, helper_auth: false });
  });

  it('pays correct x 3 + session bonus + first-of-day bonus on the first verified session', async () => {
    const before = await profileState(client, users.scale);
    const session = await playSession(client, users.scale, { questionCount: 5, correct: 4 });
    expect(session.alreadyProcessed).toBe(false);

    const expected = 4 * COIN_PER_CORRECT + SESSION_BONUS + FIRST_SESSION_BONUS; // 37
    const after = await profileState(client, users.scale);
    expect(after.coin_balance - before.coin_balance).toBe(expected);
    expect(await sessionCoinLedger(client, users.scale)).toEqual([
      { amount: expected, firstToday: true, correct: 4 },
    ]);
  });

  it('drops the first-of-day bonus on the same user second session', async () => {
    const before = await profileState(client, users.scale);
    await playSession(client, users.scale, { questionCount: 5, correct: 2 });

    const expected = 2 * COIN_PER_CORRECT + SESSION_BONUS; // 16, no first-of-day bonus
    const after = await profileState(client, users.scale);
    expect(after.coin_balance - before.coin_balance).toBe(expected);
    const ledger = await sessionCoinLedger(client, users.scale);
    expect(ledger.at(-1)).toEqual({ amount: expected, firstToday: false, correct: 2 });
  });

  it('pays nothing for a session with no correct answers beyond the flat bonus', async () => {
    // A student who gets everything wrong still completed a session; the flat
    // bonus must be paid and increment_xp must not be called with 0.
    const before = await profileState(client, users.scale);
    await playSession(client, users.scale, { questionCount: 3, correct: 0 });
    const after = await profileState(client, users.scale);
    expect(after.coin_balance - before.coin_balance).toBe(SESSION_BONUS);
    expect(after.total_xp).toBe(before.total_xp); // 0 XP session, no xp row
  });

  it('caps the daily coin total, truncating the session that crosses it', async () => {
    const before = await profileState(client, users.cap);
    // 37, then 22, then 22 truncated to 21 at the cap, then 22 truncated to 0.
    for (let index = 0; index < 4; index += 1) {
      await playSession(client, users.cap, { questionCount: 5, correct: 4 });
    }
    const after = await profileState(client, users.cap);
    expect(after.coin_balance - before.coin_balance).toBe(DAILY_CAP);
    expect(await sessionCoinLedger(client, users.cap)).toEqual([
      { amount: 37, firstToday: true, correct: 4 },
      { amount: 22, firstToday: false, correct: 4 },
      { amount: 21, firstToday: false, correct: 4 }, // truncated at the cap
      { amount: 0, firstToday: false, correct: 4 },  // capped out, still audited
    ]);
  });

  it('completes a capped-out session normally instead of raising through increment_coins', async () => {
    // increment_coins raises on a non-positive amount; a capped-out session must
    // still record XP, answers and the completed binding.
    const before = await profileState(client, users.cap);
    const session = await playSession(client, users.cap, { questionCount: 4, correct: 3 });
    const after = await profileState(client, users.cap);

    expect(after.coin_balance).toBe(before.coin_balance);
    expect(after.total_xp - before.total_xp).toBeGreaterThanOrEqual(30); // session XP still paid
    const state = await client.query(`
      SELECT
        (SELECT count(*) FROM public.session_answers WHERE session_id = $1) AS answers,
        (SELECT status FROM public.game_sessions WHERE id = $1) AS status,
        (SELECT session_id IS NOT NULL AND completed_at IS NOT NULL
           FROM public.verified_attempts WHERE id = $2) AS bound
    `, [session.sessionId, session.attemptId]);
    expect(state.rows[0]).toMatchObject({ answers: '4', status: 'completed', bound: true });
  });

  it('pays one scaled amount when the same attempt is completed twice concurrently', async () => {
    const questionIds = await freshQuestions(client, 5);
    const attempt = await withServiceRole(client, () => issueAttempt(client, users.replay, questionIds));
    const before = await profileState(client, users.replay);
    const first = new Client({ connectionString: databaseUrl });
    const second = new Client({ connectionString: databaseUrl });
    await Promise.all([first.connect(), second.connect()]);
    let results;
    try {
      results = await Promise.all([first, second].map((connection) => withServiceRole(connection, () => completeAttempt(connection, {
        attemptId: attempt.attemptId, userId: users.replay, requestId: randomUUID(), questionIds, correct: 4,
      }))));
    } finally { await Promise.all([first.end(), second.end()]); }

    expect(results.map((result) => result.alreadyProcessed).sort()).toEqual([false, true]);
    expect(results[0].sessionId).toBe(results[1].sessionId);
    const expected = 4 * COIN_PER_CORRECT + SESSION_BONUS + FIRST_SESSION_BONUS;
    const after = await profileState(client, users.replay);
    expect(after.coin_balance - before.coin_balance).toBe(expected);
    expect(await sessionCoinLedger(client, users.replay)).toEqual([
      { amount: expected, firstToday: true, correct: 4 },
    ]);
  });

  it('pays no coins for an unverified session completed through complete_game_session', async () => {
    // Deliberate tightening: coins now belong to the verified path only.
    const questionIds = await freshQuestions(client, 5);
    const before = await profileState(client, users.direct);
    const result = await client.query(
      `SELECT public.complete_game_session(
        $1::uuid, $2::uuid, 'wordquest'::text, 'classic'::text, 'fixture'::text,
        1::smallint, $3::jsonb, 40::integer, 40::integer, 0::integer,
        4::smallint, 1::smallint, 30::integer, 3::numeric
      ) AS result`,
      [users.direct, randomUUID(), JSON.stringify(answersFor(questionIds, 4))],
    );
    expect(result.rows[0].result.alreadyProcessed).toBe(false);

    const after = await profileState(client, users.direct);
    expect(after.coin_balance).toBe(before.coin_balance);
    expect(after.total_xp - before.total_xp).toBe(40); // XP unchanged by 129
    expect(await sessionCoinLedger(client, users.direct)).toEqual([]);
  });
});
