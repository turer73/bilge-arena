// Opt-in, disposable PostgreSQL verification for the actual 081, 091, 092
// and 093 migrations. It refuses any database outside the explicit R0.2 test
// naming convention before resetting schemas.
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
  throw new Error('Refusing reward integration test without VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE=1');
}
if (databaseUrl && !/^bilge_r02_test_[a-z0-9_]+$/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('Refusing reward integration test against a non-disposable database name');
}

const runIntegration = Boolean(databaseUrl && disposableConfirmation === '1');
const describePostgres = runIntegration ? describe : describe.skip;
const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'migrations');
const migrationSql = (filename) => readFileSync(join(migrationsDir, filename), 'utf8');

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

async function issueAttempt(client, userId, questionId) {
  const result = await client.query(
    'SELECT public.issue_verified_attempt($1, $2, $3, $4::uuid[], $5) AS result',
    [userId, 'wordquest', 'classic', [questionId], 60],
  );
  return result.rows[0].result;
}

const answerFor = (questionId) => [{
  question_id: questionId, selected_option: 1, is_correct: true, is_skipped: false,
  time_taken_sec: 3, is_fast: true, xp_earned: 10, question_order: 1,
}];

async function completeAttempt(client, { attemptId, userId, requestId, questionId, totalXp = 10 }) {
  const result = await client.query(
    `SELECT public.complete_verified_game_session(
      $1::uuid, $2::uuid, $3::uuid, 'wordquest'::text, 'classic'::text, 'fixture'::text,
      1::smallint, $4::jsonb, $5::integer, $5::integer, 0::integer,
      1::smallint, 0::smallint, 3::integer, 3::numeric
    ) AS result`,
    [attemptId, userId, requestId, JSON.stringify(answerFor(questionId)), totalXp],
  );
  return result.rows[0].result;
}

async function profileState(client, userId) {
  const result = await client.query(
    'SELECT total_xp, coin_balance FROM public.profiles WHERE id = $1', [userId],
  );
  return Object.fromEntries(Object.entries(result.rows[0]).map(([key, value]) => [key, Number(value)]));
}

describePostgres('reward integrity on actual PostgreSQL migrations', () => {
  let client;
  let userOne;
  let userTwo;
  let questionOne;
  let questionTwo;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    // Guards above run before this reset; roles are cluster-wide and recreated idempotently.
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;');
    await client.query(fixtureSql);
    for (const migration of ['081_atomic_complete_game_session.sql', '091_verified_attempts.sql', '092_complete_verified_game_session.sql', '093_reward_integrity.sql']) {
      await client.query(migrationSql(migration));
    }
    userOne = randomUUID(); userTwo = randomUUID(); questionOne = randomUUID(); questionTwo = randomUUID();
    await client.query('INSERT INTO public.profiles (id) VALUES ($1), ($2)', [userOne, userTwo]);
    await client.query('INSERT INTO public.questions (id, game) VALUES ($1, $3), ($2, $3)', [questionOne, questionTwo, 'wordquest']);
    const quest = await client.query(`
      INSERT INTO public.daily_quests (slug, quest_type, target_value, xp_reward)
      VALUES ('r03-play-one', 'play_sessions', 1, 40) RETURNING id
    `);
    await client.query(`
      INSERT INTO public.user_daily_quests (user_id, quest_id, date)
      VALUES ($1, $2, (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date) RETURNING id
    `, [userOne, quest.rows[0].id]);
  });

  afterAll(async () => { await client?.end(); });

  it('applies 093 catalog, RLS, ACL, definer and trigger contracts', async () => {
    const catalog = await client.query(`
      SELECT
        (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.reward_ledger'::regclass) AS ledger_rls,
        has_table_privilege('authenticated', 'public.reward_ledger', 'INSERT') AS ledger_insert,
        has_table_privilege('authenticated', 'public.reward_ledger', 'SELECT') AS ledger_select,
        has_table_privilege('authenticated', 'public.xp_log', 'UPDATE') AS xp_update,
        has_table_privilege('authenticated', 'public.xp_log', 'SELECT') AS xp_select,
        has_function_privilege('service_role', 'public.claim_daily_quest_reward(uuid,uuid)', 'EXECUTE') AS claim_service,
        has_function_privilege('authenticated', 'public.claim_daily_quest_reward(uuid,uuid)', 'EXECUTE') AS claim_auth,
        has_function_privilege('service_role', 'public.apply_verified_session_rewards(uuid,uuid)', 'EXECUTE') AS helper_service,
        (SELECT prosecdef FROM pg_proc WHERE oid = 'public.apply_verified_session_rewards(uuid,uuid)'::regprocedure) AS helper_definer,
        (SELECT proconfig::text FROM pg_proc WHERE oid = 'public.apply_verified_session_rewards(uuid,uuid)'::regprocedure) AS helper_config,
        (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.verified_attempts'::regclass AND tgname = 'trg_verified_attempt_reward_integrity' AND NOT tgisinternal) AS trigger_count
    `);
    expect(catalog.rows[0]).toMatchObject({
      ledger_rls: true, ledger_insert: false, ledger_select: true, xp_update: false, xp_select: true,
      claim_service: true, claim_auth: false, helper_service: false, helper_definer: true, trigger_count: '1',
    });
    expect(catalog.rows[0].helper_config).toContain('search_path=pg_catalog');
    const foreignKey = await client.query(`
      SELECT confrelid::regclass::text AS target FROM pg_constraint
      WHERE conrelid = 'public.user_achievements'::regclass AND conname = 'user_achievements_source_session_id_fkey'
    `);
    expect(foreignKey.rows[0].target).toBe('game_sessions');
  });

  it('awards one fresh verified session through actual 081/092 and records quests and exact new badges', async () => {
    const attempt = await withServiceRole(client, () => issueAttempt(client, userOne, questionOne));
    const before = await profileState(client, userOne);
    const completed = await withServiceRole(client, () => completeAttempt(client, {
      attemptId: attempt.attemptId, userId: userOne, requestId: randomUUID(), questionId: questionOne,
    }));
    expect(completed.alreadyProcessed).toBe(false);
    const after = await profileState(client, userOne);
    expect(after.total_xp - before.total_xp).toBe(135); // session 10 + first_game 50 + first_correct 25 + daily_first 50
    expect(after.coin_balance - before.coin_balance).toBe(1);
    const ledger = await client.query(`
      SELECT source_type, reward_type, reward_key, amount FROM public.reward_ledger
      WHERE user_id = $1 ORDER BY source_type, reward_key
    `, [userOne]);
    expect(ledger.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ source_type: 'session', reward_type: 'xp', reward_key: 'session_complete', amount: 10 }),
      expect.objectContaining({ source_type: 'session', reward_type: 'coin', reward_key: 'correct_answers', amount: 1 }),
      expect.objectContaining({ source_type: 'daily_quest_completion', reward_key: 'completed', amount: 0 }),
      expect.objectContaining({ source_type: 'badge', reward_key: 'first_game', amount: 50 }),
      expect.objectContaining({ source_type: 'badge', reward_key: 'first_correct', amount: 25 }),
      expect.objectContaining({ source_type: 'badge', reward_key: 'daily_first', amount: 50 }),
    ]));
    const achievement = await client.query(
      "SELECT source_session_id FROM public.user_achievements WHERE user_id = $1 AND achievement_id = 'first_game'", [userOne],
    );
    expect(achievement.rows[0].source_session_id).toBe(completed.sessionId);
    const bound = await client.query('SELECT session_id, completed_at FROM public.verified_attempts WHERE id = $1', [attempt.attemptId]);
    expect(bound.rows[0].session_id).toBe(completed.sessionId);
    expect(bound.rows[0].completed_at).not.toBeNull();
  });

  it('serializes two distinct client request ids for one attempt into one reward set', async () => {
    const attempt = await withServiceRole(client, () => issueAttempt(client, userTwo, questionTwo));
    const before = await profileState(client, userTwo);
    const first = new Client({ connectionString: databaseUrl });
    const second = new Client({ connectionString: databaseUrl });
    await Promise.all([first.connect(), second.connect()]);
    let results;
    try {
      results = await Promise.all([
        withServiceRole(first, () => completeAttempt(first, { attemptId: attempt.attemptId, userId: userTwo, requestId: randomUUID(), questionId: questionTwo, totalXp: 13 })),
        withServiceRole(second, () => completeAttempt(second, { attemptId: attempt.attemptId, userId: userTwo, requestId: randomUUID(), questionId: questionTwo, totalXp: 13 })),
      ]);
    } finally { await Promise.all([first.end(), second.end()]); }
    expect(results.map((result) => result.alreadyProcessed).sort()).toEqual([false, true]);
    expect(results[0].sessionId).toBe(results[1].sessionId);
    const after = await profileState(client, userTwo);
    expect(after.total_xp - before.total_xp).toBe(88); // session 13 + first_game 50 + first_correct 25
    expect(after.coin_balance - before.coin_balance).toBe(1);
    const state = await client.query(`
      SELECT
        (SELECT count(*) FROM public.game_sessions WHERE user_id = $1) AS sessions,
        (SELECT count(*) FROM public.session_answers WHERE user_id = $1) AS answers,
        (SELECT count(*) FROM public.reward_ledger WHERE user_id = $1 AND source_type = 'session') AS session_rewards,
        (SELECT session_id IS NOT NULL AND completed_at IS NOT NULL FROM public.verified_attempts WHERE id = $2) AS bound
    `, [userTwo, attempt.attemptId]);
    expect(state.rows[0]).toMatchObject({ sessions: '1', answers: '1', session_rewards: '2', bound: true });
  });

  it('rolls the entire verified completion back when the reward helper raises', async () => {
    await client.query(`
      CREATE FUNCTION public.fixture_fail_reward_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF current_setting('test.fail_reward_ledger', true) = 'on'
           AND NEW.source_type = 'session' AND NEW.reward_type = 'coin' THEN
          RAISE EXCEPTION 'forced reward helper failure';
        END IF;
        RETURN NEW;
      END; $$;
      CREATE TRIGGER fixture_fail_reward_ledger BEFORE INSERT ON public.reward_ledger
        FOR EACH ROW EXECUTE FUNCTION public.fixture_fail_reward_ledger();
    `);
    const question = randomUUID();
    await client.query('INSERT INTO public.questions (id, game) VALUES ($1, $2)', [question, 'wordquest']);
    const attempt = await withServiceRole(client, () => issueAttempt(client, userOne, question));
    const before = await profileState(client, userOne);
    await client.query("SELECT set_config('test.fail_reward_ledger', 'on', false)");
    try {
      await expect(withServiceRole(client, () => completeAttempt(client, {
        attemptId: attempt.attemptId, userId: userOne, requestId: randomUUID(), questionId: question,
      }))).rejects.toMatchObject({ code: 'P0001' });
    } finally { await client.query("SELECT set_config('test.fail_reward_ledger', 'off', false)"); }
    expect(await profileState(client, userOne)).toEqual(before);
    const state = await client.query(`
      SELECT (SELECT count(*) FROM public.game_sessions WHERE user_id = $1) AS sessions,
        session_id, completed_at FROM public.verified_attempts WHERE id = $2
    `, [userOne, attempt.attemptId]);
    expect(state.rows[0]).toMatchObject({ sessions: '1', session_id: null, completed_at: null });
  });

  it('allows exactly one concurrent service-role quest claim and replays original camelCase amounts', async () => {
    // This claim is deliberately independent of the fresh-completion test.
    const quest = await client.query(`
      INSERT INTO public.daily_quests (slug, quest_type, target_value, xp_reward)
      VALUES ($1, 'play_sessions', 1, 40) RETURNING id
    `, [`r03-claim-${randomUUID()}`]);
    const userQuest = await client.query(`
      INSERT INTO public.user_daily_quests (
        user_id, quest_id, date, current_value, is_completed, completed_at
      ) VALUES (
        $1, $2, (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date,
        1, true, clock_timestamp()
      ) RETURNING id
    `, [userOne, quest.rows[0].id]);
    const claimUserQuestId = userQuest.rows[0].id;
    const before = await profileState(client, userOne);
    const first = new Client({ connectionString: databaseUrl });
    const second = new Client({ connectionString: databaseUrl });
    await Promise.all([first.connect(), second.connect()]);
    let results;
    try {
      results = await Promise.all([first, second].map((connection) => withServiceRole(connection, async () => {
        const query = await connection.query('SELECT public.claim_daily_quest_reward($1, $2) AS result', [userOne, claimUserQuestId]);
        return query.rows[0].result;
      })));
    } finally { await Promise.all([first.end(), second.end()]); }
    expect(results.map((result) => result.alreadyProcessed).sort()).toEqual([false, true]);
    expect(results[0]).toMatchObject({ xpEarned: 40, coinsEarned: 8 });
    expect(results[1]).toMatchObject({ xpEarned: 40, coinsEarned: 8 });
    const after = await profileState(client, userOne);
    expect(after.total_xp - before.total_xp).toBe(40);
    expect(after.coin_balance - before.coin_balance).toBe(8);
    const ledger = await client.query(`
      SELECT reward_type, amount FROM public.reward_ledger
      WHERE source_type = 'daily_quest_claim' AND source_id = $1 ORDER BY reward_type
    `, [claimUserQuestId]);
    expect(ledger.rows).toEqual([{ reward_type: 'coin', amount: 8 }, { reward_type: 'xp', amount: 40 }]);
  });
});
