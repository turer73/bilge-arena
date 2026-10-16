// Opt-in, disposable PostgreSQL verification for the economy fixes of the
// 2026-10-15 deep review (§4.2, §9 action 9):
//   20261017100000 - daily session XP cap; weekly XP leaderboard pays the
//                    awarded XP and uses the Istanbul week.
//   20261017100100 - one streak writer on the Istanbul day that grows
//                    longest_streak; claim_daily_login as the only login reward.
// The fixture stands in for the base schema as production had it before these
// migrations (007's update_streak and update_weekly_leaderboard, the session
// trigger), then applies the real 071, 081, 091, 092, 093 and 129 chain.
// It refuses any database outside the bilge_r02_test_* naming convention.
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
  throw new Error('Refusing economy integration test without VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE=1');
}
if (databaseUrl && !/^bilge_r02_test_[a-z0-9_]+$/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('Refusing economy integration test against a non-disposable database name');
}

const runIntegration = Boolean(databaseUrl && disposableConfirmation === '1');
const describePostgres = runIntegration ? describe : describe.skip;
const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationSql = (filename) => readFileSync(join(__dirname, '..', 'migrations', filename), 'utf8');

// Mirrored from the migration constant, checked independently here.
const DAILY_SESSION_XP_CAP = 1500;
const HOUR = 3600 * 1000;

const fixtureSql = `
  CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
  DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    username varchar(32) NOT NULL DEFAULT 'oyuncu',
    display_name varchar(64),
    avatar_url text,
    total_xp integer NOT NULL DEFAULT 0,
    level integer NOT NULL DEFAULT 1,
    level_name varchar(32) NOT NULL DEFAULT 'Acemi',
    coin_balance integer NOT NULL DEFAULT 0,
    current_streak smallint NOT NULL DEFAULT 0,
    longest_streak smallint NOT NULL DEFAULT 0,
    last_played_at timestamptz,
    total_sessions integer NOT NULL DEFAULT 0,
    total_questions integer NOT NULL DEFAULT 0,
    correct_answers integer NOT NULL DEFAULT 0,
    rooms_completed integer NOT NULL DEFAULT 0,
    multiplayer_firsts integer NOT NULL DEFAULT 0,
    leaderboard_opt_in boolean NOT NULL DEFAULT false,
    deleted_at timestamptz
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
  -- full-schema.sql: amount SMALLINT, created_at DEFAULT NOW().
  CREATE TABLE public.xp_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
    amount smallint NOT NULL, reason varchar(50) NOT NULL, reference_id uuid, created_at timestamptz DEFAULT now()
  );
  CREATE TABLE public.leaderboard_weekly (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
    week_start date NOT NULL, week_end date NOT NULL, xp_earned integer DEFAULT 0,
    sessions_played smallint DEFAULT 0, correct_answers integer DEFAULT 0, accuracy_pct numeric(5,2),
    rank integer, UNIQUE (user_id, week_start)
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
  -- Mirrors migration 055: a non-positive amount raises.
  CREATE FUNCTION public.increment_coins(p_user_id uuid, p_amount integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
  BEGIN
    IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
    UPDATE public.profiles SET coin_balance = coin_balance + p_amount WHERE id = p_user_id;
  END; $$;

  -- Base schema as production ran it before 20261017100000/100100: 007's
  -- functions (030 only pinned search_path) and the session trigger.
  CREATE FUNCTION public.update_streak(p_user_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  DECLARE
    v_last_played TIMESTAMPTZ;
    v_today       DATE := CURRENT_DATE;
    v_yesterday   DATE := CURRENT_DATE - 1;
  BEGIN
    SELECT last_played_at INTO v_last_played FROM profiles WHERE id = p_user_id;
    IF v_last_played IS NULL OR v_last_played::DATE < v_yesterday THEN
      UPDATE profiles SET current_streak = 1, last_played_at = NOW() WHERE id = p_user_id;
    ELSIF v_last_played::DATE = v_yesterday THEN
      UPDATE profiles SET current_streak = current_streak + 1,
        longest_streak = GREATEST(longest_streak, current_streak + 1), last_played_at = NOW()
      WHERE id = p_user_id;
    ELSIF v_last_played::DATE = v_today THEN
      UPDATE profiles SET last_played_at = NOW() WHERE id = p_user_id;
    END IF;
  END; $$;
  CREATE FUNCTION public.update_weekly_leaderboard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  DECLARE
    v_week_start DATE := date_trunc('week', NOW())::DATE;
    v_week_end   DATE := v_week_start + 6;
  BEGIN
    IF NEW.status = 'completed' AND OLD.status = 'active' THEN
      INSERT INTO leaderboard_weekly (user_id, week_start, week_end, xp_earned, sessions_played, correct_answers)
      VALUES (NEW.user_id, v_week_start, v_week_end, NEW.total_xp, 1, NEW.correct_count)
      ON CONFLICT (user_id, week_start) DO UPDATE SET
        xp_earned = leaderboard_weekly.xp_earned + NEW.total_xp,
        sessions_played = leaderboard_weekly.sessions_played + 1,
        correct_answers = leaderboard_weekly.correct_answers + NEW.correct_count;
      PERFORM update_streak(NEW.user_id);
      UPDATE profiles SET total_sessions = total_sessions + 1,
        total_questions = total_questions + NEW.total_questions,
        correct_answers = correct_answers + NEW.correct_count
      WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
  END; $$;
  CREATE TRIGGER trg_session_complete AFTER UPDATE ON public.game_sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_weekly_leaderboard();

  -- Production: service_role reads public tables (Supabase defaults). The
  -- security_invoker ranking view needs it on both base tables.
  GRANT SELECT ON public.leaderboard_weekly, public.profiles TO service_role;
`;

async function withServiceRole(client, callback) {
  await client.query('SET ROLE service_role');
  try { return await callback(); } finally { await client.query('RESET ROLE'); }
}

async function freshQuestions(client, count) {
  const ids = Array.from({ length: count }, () => randomUUID());
  await client.query('INSERT INTO public.questions (id, game) SELECT unnest($1::uuid[]), $2', [ids, 'wordquest']);
  return ids;
}

// One answer row per issued question; the first `correct` of them are correct (10 XP each).
function answersFor(questionIds, correct) {
  return questionIds.map((questionId, index) => ({
    question_id: questionId, selected_option: 1, is_correct: index < correct, is_skipped: false,
    time_taken_sec: 3, is_fast: true, xp_earned: index < correct ? 10 : 0, question_order: index + 1,
  }));
}

async function issueAttempt(client, userId, questionIds) {
  const result = await client.query(
    'SELECT public.issue_verified_attempt($1, $2, $3, $4::uuid[], $5) AS result',
    [userId, 'wordquest', 'classic', questionIds, 600],
  );
  return result.rows[0].result;
}

async function completeAttempt(client, { attemptId, userId, questionIds, correct, requestId = randomUUID() }) {
  const result = await client.query(
    `SELECT public.complete_verified_game_session(
      $1::uuid, $2::uuid, $3::uuid, 'wordquest'::text, 'classic'::text, 'fixture'::text,
      1::smallint, $4::jsonb, $5::integer, $5::integer, 0::integer,
      $6::smallint, $7::smallint, 30::integer, 3::numeric
    ) AS result`,
    [attemptId, userId, requestId, JSON.stringify(answersFor(questionIds, correct)), correct * 10, correct, questionIds.length - correct],
  );
  return result.rows[0].result;
}

async function prepareSession(client, userId, { questionCount, correct }) {
  const questionIds = await freshQuestions(client, questionCount);
  const attempt = await withServiceRole(client, () => issueAttempt(client, userId, questionIds));
  return { attemptId: attempt.attemptId, userId, questionIds, correct };
}

async function playSession(client, userId, shape) {
  const prepared = await prepareSession(client, userId, shape);
  const result = await withServiceRole(client, () => completeAttempt(client, prepared));
  return { ...prepared, ...result };
}

async function newProfile(client, values = {}) {
  const id = randomUUID();
  await client.query(`
    INSERT INTO public.profiles (id, username, current_streak, longest_streak, last_played_at, leaderboard_opt_in)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [id, values.username ?? `oyuncu_${id.slice(0, 6)}`, values.current ?? 0, values.longest ?? 0,
    values.lastPlayedAt ?? null, values.optIn ?? false]);
  return id;
}

async function profile(client, userId) {
  const result = await client.query(`
    SELECT total_xp, coin_balance, current_streak, longest_streak, total_sessions
    FROM public.profiles WHERE id = $1
  `, [userId]);
  return Object.fromEntries(Object.entries(result.rows[0]).map(([key, value]) => [key, Number(value)]));
}

async function sessionXpLog(client, userId) {
  const result = await client.query(
    "SELECT COALESCE(sum(amount), 0)::int AS total, count(*)::int AS rows FROM public.xp_log WHERE user_id = $1 AND reason = 'session_complete'",
    [userId],
  );
  return result.rows[0];
}

// A session XP payout written earlier today, as complete_game_session would have.
async function priorSessionXp(client, userId, amount, createdAt = null) {
  await client.query(`
    INSERT INTO public.xp_log (user_id, amount, reason, reference_id, created_at)
    VALUES ($1, $2, 'session_complete', $3, COALESCE($4, now()))
  `, [userId, amount, randomUUID(), createdAt]);
}

// Istanbul midnight as an instant and the Istanbul calendar day, computed here
// rather than with the migration's SQL so the boundary is checked independently.
// Turkey has stayed on UTC+3 all year since 2016; the guard fails loudly if the
// server's tz database disagrees.
async function istanbulDay(client) {
  const result = await client.query(`
    SELECT now() AS now,
      extract(epoch FROM (now() AT TIME ZONE 'Europe/Istanbul') - (now() AT TIME ZONE 'UTC'))::int AS offset_seconds
  `);
  expect(result.rows[0].offset_seconds).toBe(3 * 3600);
  const local = new Date(result.rows[0].now.getTime() + 3 * HOUR);
  const midnight = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 3 * HOUR);
  const mondayOffset = (local.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - mondayOffset));
  return { midnight, weekStart: monday.toISOString().slice(0, 10) };
}

async function claim(client, userId) {
  return withServiceRole(client, async () => (
    await client.query('SELECT public.claim_daily_login($1) AS result', [userId])
  ).rows[0].result);
}

describePostgres('economy integrity (session XP cap, Istanbul week, single streak writer) on actual PostgreSQL', () => {
  let client;
  let backfillUser;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;');
    await client.query(fixtureSql);
    await client.query(SUPABASE_DEFAULT_PRIVILEGES_SQL);
    for (const migration of [
      '071_xp_ledger_level_security_fix.sql',
      '081_atomic_complete_game_session.sql',
      '091_verified_attempts.sql',
      '092_complete_verified_game_session.sql',
      '093_reward_integrity.sql',
      '129_session_coin_scale.sql',
      '20261017100000_session_xp_daily_cap.sql',
    ]) {
      await client.query(migrationSql(migration));
    }
    // Left behind by the two-writer era: longest below current. 100100 repairs it.
    backfillUser = await newProfile(client, { current: 7, longest: 3 });
    await client.query(migrationSql('20261017100100_single_streak_writer.sql'));
  });

  afterAll(async () => { await client?.end(); });

  describe('daily session XP cap (20261017100000)', () => {
    it('pays a session in full while the day is under the cap, and keeps the nominal score', async () => {
      const user = await newProfile(client);
      const session = await playSession(client, user, { questionCount: 5, correct: 4 });

      expect(session).toMatchObject({ alreadyProcessed: false, totalXP: 40, xpAwarded: 40 });
      // Profile total_xp also carries the first-session badges; session XP is its own xp_log reason.
      expect(await sessionXpLog(client, user)).toEqual({ total: 40, rows: 1 });
    });

    it('truncates the session that crosses the cap and pays nothing after it, without raising', async () => {
      const user = await newProfile(client);
      await priorSessionXp(client, user, DAILY_SESSION_XP_CAP - 20);

      const crossing = await playSession(client, user, { questionCount: 5, correct: 4 });
      expect(crossing).toMatchObject({ alreadyProcessed: false, totalXP: 40, xpAwarded: 20 });
      const capped = await playSession(client, user, { questionCount: 5, correct: 4 });
      expect(capped).toMatchObject({ alreadyProcessed: false, totalXP: 40, xpAwarded: 0 });

      expect(await profile(client, user)).toMatchObject({ total_sessions: 2 });
      // Seeded 1480 + 20 paid; the capped-out session writes no xp_log row.
      expect(await sessionXpLog(client, user)).toEqual({ total: DAILY_SESSION_XP_CAP, rows: 2 });

      // total_xp stays nominal (106's binding check recomputes it from the
      // answers); the paid amount lives in xp_awarded and in the reward ledger.
      const rows = await client.query(`
        SELECT gs.total_xp, gs.xp_awarded, gs.status, rl.amount AS ledger_xp, (rl.metadata->>'nominalXp')::int AS nominal
        FROM public.game_sessions gs
        JOIN public.reward_ledger rl ON rl.source_id = gs.id AND rl.source_type = 'session' AND rl.reward_type = 'xp'
        WHERE gs.id = ANY($1::uuid[]) ORDER BY gs.xp_awarded DESC
      `, [[crossing.sessionId, capped.sessionId]]);
      expect(rows.rows).toEqual([
        { total_xp: 40, xp_awarded: 20, status: 'completed', ledger_xp: 20, nominal: 40 },
        { total_xp: 40, xp_awarded: 0, status: 'completed', ledger_xp: 0, nominal: 40 },
      ]);
    });

    it('counts only Istanbul today: XP paid 30 minutes before Istanbul midnight does not count', async () => {
      const { midnight } = await istanbulDay(client);
      const user = await newProfile(client);
      await priorSessionXp(client, user, DAILY_SESSION_XP_CAP, new Date(midnight.getTime() - 30 * 60 * 1000));

      const session = await playSession(client, user, { questionCount: 5, correct: 4 });
      expect(session.xpAwarded).toBe(40);
    });

    it('counts XP paid 30 minutes after Istanbul midnight as today, though UTC is still on the previous day', async () => {
      const { midnight } = await istanbulDay(client);
      const user = await newProfile(client);
      await priorSessionXp(client, user, DAILY_SESSION_XP_CAP - 10, new Date(midnight.getTime() + 30 * 60 * 1000));

      const session = await playSession(client, user, { questionCount: 5, correct: 4 });
      expect(session.xpAwarded).toBe(10);
    });

    it('serializes two different sessions of one user completed concurrently, so the cap holds', async () => {
      const user = await newProfile(client);
      await priorSessionXp(client, user, DAILY_SESSION_XP_CAP - 20);
      const first = await prepareSession(client, user, { questionCount: 5, correct: 4 });
      const second = await prepareSession(client, user, { questionCount: 5, correct: 4 });

      const connections = [new Client({ connectionString: databaseUrl }), new Client({ connectionString: databaseUrl })];
      await Promise.all(connections.map((connection) => connection.connect()));
      let results;
      try {
        results = await Promise.all([first, second].map((prepared, index) => (
          withServiceRole(connections[index], () => completeAttempt(connections[index], prepared))
        )));
      } finally { await Promise.all(connections.map((connection) => connection.end())); }

      expect(results.map((result) => result.xpAwarded).sort((a, b) => a - b)).toEqual([0, 20]);
      expect(await sessionXpLog(client, user)).toEqual({ total: DAILY_SESSION_XP_CAP, rows: 2 });
    });

    it('stores the paid amount for the replay path, which the route reads back', async () => {
      const user = await newProfile(client);
      await priorSessionXp(client, user, DAILY_SESSION_XP_CAP - 5);
      const session = await playSession(client, user, { questionCount: 3, correct: 3 });
      const replay = await withServiceRole(client, () => completeAttempt(client, session));

      expect(replay).toMatchObject({ alreadyProcessed: true, sessionId: session.sessionId, totalXP: 30 });
      const stored = await client.query('SELECT xp_awarded FROM public.game_sessions WHERE id = $1', [session.sessionId]);
      expect(stored.rows[0]).toEqual({ xp_awarded: 5 });
      expect(await sessionXpLog(client, user)).toEqual({ total: DAILY_SESSION_XP_CAP, rows: 2 });
    });

    it('keeps the internal session functions closed to API roles and pinned to pg_catalog', async () => {
      const catalog = await client.query(`
        SELECT
          has_function_privilege('service_role', 'public.complete_game_session(uuid,uuid,text,text,text,smallint,jsonb,integer,integer,integer,smallint,smallint,integer,numeric)', 'EXECUTE') AS legacy_service,
          has_function_privilege('service_role', 'public.complete_verified_game_session(uuid,uuid,uuid,text,text,text,smallint,jsonb,integer,integer,integer,smallint,smallint,integer,numeric)', 'EXECUTE') AS wrapper_service,
          has_function_privilege('authenticated', 'public.complete_verified_game_session(uuid,uuid,uuid,text,text,text,smallint,jsonb,integer,integer,integer,smallint,smallint,integer,numeric)', 'EXECUTE') AS wrapper_auth,
          has_function_privilege('service_role', 'public.apply_verified_session_rewards(uuid,uuid)', 'EXECUTE') AS helper_service,
          has_function_privilege('authenticated', 'public.update_weekly_leaderboard()', 'EXECUTE') AS trigger_auth,
          (SELECT proconfig FROM pg_proc WHERE oid = 'public.complete_game_session(uuid,uuid,text,text,text,smallint,jsonb,integer,integer,integer,smallint,smallint,integer,numeric)'::regprocedure) AS legacy_config,
          (SELECT proconfig FROM pg_proc WHERE oid = 'public.update_weekly_leaderboard()'::regprocedure) AS trigger_config
      `);
      expect(catalog.rows[0]).toEqual({
        legacy_service: false, wrapper_service: true, wrapper_auth: false, helper_service: false, trigger_auth: false,
        legacy_config: ['search_path=pg_catalog'], trigger_config: ['search_path=pg_catalog'],
      });
    });
  });

  describe('weekly XP leaderboard on the Istanbul week (20261017100000)', () => {
    it('adds the paid XP, not the nominal score, to the Istanbul week row', async () => {
      const { weekStart } = await istanbulDay(client);
      const user = await newProfile(client);
      await priorSessionXp(client, user, DAILY_SESSION_XP_CAP - 15);
      await playSession(client, user, { questionCount: 5, correct: 4 });

      const rows = await client.query(
        'SELECT week_start::text AS week_start, week_end::text AS week_end, xp_earned, sessions_played FROM public.leaderboard_weekly WHERE user_id = $1',
        [user],
      );
      const weekEnd = new Date(Date.parse(`${weekStart}T00:00:00Z`) + 6 * 24 * HOUR).toISOString().slice(0, 10);
      expect(rows.rows).toEqual([{ week_start: weekStart, week_end: weekEnd, xp_earned: 15, sessions_played: 1 }]);
    });

    it('ranks only the current Istanbul week and only opted-in, live accounts', async () => {
      const { weekStart } = await istanbulDay(client);
      const previousWeek = new Date(Date.parse(`${weekStart}T00:00:00Z`) - 7 * 24 * HOUR).toISOString().slice(0, 10);
      const shown = await newProfile(client, { optIn: true, username: 'gorunen' });
      const hidden = await newProfile(client, { optIn: false, username: 'gizli' });
      const lastWeek = await newProfile(client, { optIn: true, username: 'gecen_hafta' });
      await client.query(`
        INSERT INTO public.leaderboard_weekly (user_id, week_start, week_end, xp_earned)
        VALUES ($1, $4::date, $4::date + 6, 900), ($2, $4::date, $4::date + 6, 950), ($3, $5::date, $5::date + 6, 5000)
      `, [shown, hidden, lastWeek, weekStart, previousWeek]);

      const ranked = await withServiceRole(client, async () => (await client.query(
        'SELECT username, xp_earned FROM public.leaderboard_weekly_ranked WHERE user_id = ANY($1::uuid[])',
        [[shown, hidden, lastWeek]],
      )).rows);
      expect(ranked).toEqual([{ username: 'gorunen', xp_earned: 900 }]);

      const view = await client.query(`
        SELECT pg_get_viewdef('public.leaderboard_weekly_ranked'::regclass, true) AS definition,
          has_table_privilege('authenticated', 'public.leaderboard_weekly_ranked', 'SELECT') AS auth_read,
          has_table_privilege('anon', 'public.leaderboard_weekly_ranked', 'SELECT') AS anon_read
      `);
      expect(view.rows[0].definition).toContain('Europe/Istanbul');
      expect(view.rows[0]).toMatchObject({ auth_read: false, anon_read: false });
    });
  });

  describe('single streak writer on the Istanbul day (20261017100100)', () => {
    it('repaired longest_streak rows left below current_streak by the two-writer era', async () => {
      expect(await profile(client, backfillUser)).toMatchObject({ current_streak: 7, longest_streak: 7 });
    });

    it('pays the first login of the day once: streak 1, 10 XP through increment_xp, 2 coins', async () => {
      const user = await newProfile(client);
      expect(await claim(client, user)).toEqual({ status: 'claimed', streak: 1, xpAwarded: 10, coinsAwarded: 2 });
      expect(await claim(client, user)).toEqual({ status: 'already_claimed', streak: 1, xpAwarded: 0, coinsAwarded: 0 });

      expect(await profile(client, user)).toMatchObject({ total_xp: 10, coin_balance: 2, current_streak: 1, longest_streak: 1 });
      const log = await client.query("SELECT amount FROM public.xp_log WHERE user_id = $1 AND reason = 'daily_login'", [user]);
      expect(log.rows).toEqual([{ amount: 10 }]);
    });

    it('continues the streak from the Istanbul yesterday and grows longest_streak with it', async () => {
      const { midnight } = await istanbulDay(client);
      const user = await newProfile(client, { current: 4, longest: 4, lastPlayedAt: new Date(midnight.getTime() - 12 * HOUR) });

      expect(await claim(client, user)).toEqual({ status: 'claimed', streak: 5, xpAwarded: 50, coinsAwarded: 10 });
      expect(await profile(client, user)).toMatchObject({ current_streak: 5, longest_streak: 5 });
    });

    it('resets after a missed Istanbul day, keeps the longest streak, and caps the reward at 70 XP / 20 coins', async () => {
      const { midnight } = await istanbulDay(client);
      const reset = await newProfile(client, { current: 6, longest: 6, lastPlayedAt: new Date(midnight.getTime() - 60 * HOUR) });
      expect(await claim(client, reset)).toEqual({ status: 'streak_reset', streak: 1, xpAwarded: 10, coinsAwarded: 2 });
      expect(await profile(client, reset)).toMatchObject({ current_streak: 1, longest_streak: 6 });

      const veteran = await newProfile(client, { current: 11, longest: 11, lastPlayedAt: new Date(midnight.getTime() - 12 * HOUR) });
      expect(await claim(client, veteran)).toEqual({ status: 'claimed', streak: 12, xpAwarded: 70, coinsAwarded: 20 });
    });

    it('treats 00:30 Istanbul (21:30 UTC of the previous day) as today: a session does not add a second step', async () => {
      // The 007 writer compared UTC dates: after this login it saw "yesterday"
      // and incremented again, so the streak could grow twice in one day.
      const { midnight } = await istanbulDay(client);
      const user = await newProfile(client, { current: 3, longest: 3, lastPlayedAt: new Date(midnight.getTime() + 30 * 60 * 1000) });
      await playSession(client, user, { questionCount: 2, correct: 1 });
      expect(await profile(client, user)).toMatchObject({ current_streak: 3, longest_streak: 3, total_sessions: 1 });
    });

    it('a session played before the login no longer burns the daily login reward', async () => {
      const user = await newProfile(client);
      await playSession(client, user, { questionCount: 2, correct: 0 });
      expect(await profile(client, user)).toMatchObject({ current_streak: 1 });

      expect(await claim(client, user)).toEqual({ status: 'claimed', streak: 1, xpAwarded: 10, coinsAwarded: 2 });
    });

    it('grows longest_streak through a session, so the streak badges become reachable', async () => {
      const { midnight } = await istanbulDay(client);
      const user = await newProfile(client, { current: 9, longest: 9, lastPlayedAt: new Date(midnight.getTime() - 12 * HOUR) });
      await playSession(client, user, { questionCount: 1, correct: 1 });

      expect(await profile(client, user)).toMatchObject({ current_streak: 10, longest_streak: 10 });
      const badges = await client.query(
        "SELECT array_agg(achievement_id ORDER BY achievement_id) AS codes FROM public.user_achievements WHERE user_id = $1 AND achievement_id LIKE 'streak%'",
        [user],
      );
      expect(badges.rows[0].codes).toEqual(['streak_10', 'streak_5']);
    });

    it('pays exactly one login reward when the same user claims concurrently', async () => {
      const user = await newProfile(client);
      const connections = [new Client({ connectionString: databaseUrl }), new Client({ connectionString: databaseUrl })];
      await Promise.all(connections.map((connection) => connection.connect()));
      let results;
      try {
        results = await Promise.all(connections.map((connection) => claim(connection, user)));
      } finally { await Promise.all(connections.map((connection) => connection.end())); }

      expect(results.map((result) => result.status).sort()).toEqual(['already_claimed', 'claimed']);
      expect(await profile(client, user)).toMatchObject({ total_xp: 10, coin_balance: 2 });
    });

    it('opens claim_daily_login to service_role only and keeps update_streak internal', async () => {
      const acl = await client.query(`
        SELECT
          has_function_privilege('service_role', 'public.claim_daily_login(uuid)', 'EXECUTE') AS claim_service,
          has_function_privilege('authenticated', 'public.claim_daily_login(uuid)', 'EXECUTE') AS claim_auth,
          has_function_privilege('anon', 'public.claim_daily_login(uuid)', 'EXECUTE') AS claim_anon,
          has_function_privilege('service_role', 'public.update_streak(uuid)', 'EXECUTE') AS streak_service,
          has_function_privilege('authenticated', 'public.update_streak(uuid)', 'EXECUTE') AS streak_auth,
          (SELECT prosecdef FROM pg_proc WHERE oid = 'public.claim_daily_login(uuid)'::regprocedure) AS claim_definer,
          (SELECT proconfig FROM pg_proc WHERE oid = 'public.claim_daily_login(uuid)'::regprocedure) AS claim_config
      `);
      expect(acl.rows[0]).toEqual({
        claim_service: true, claim_auth: false, claim_anon: false, streak_service: false, streak_auth: false,
        claim_definer: true, claim_config: ['search_path=pg_catalog'],
      });
      await client.query('SET ROLE authenticated');
      try {
        await expect(client.query('SELECT public.claim_daily_login($1)', [randomUUID()])).rejects.toMatchObject({ code: '42501' });
      } finally { await client.query('RESET ROLE'); }
    });
  });
});
