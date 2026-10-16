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
  CREATE TABLE public.badges (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.client_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message text);
  CREATE TABLE public.consent_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, consent_type text, consent_value jsonb);
  CREATE TABLE public.leaderboard_weekly (
    user_id uuid NOT NULL REFERENCES public.profiles(id), week_start date NOT NULL,
    xp_earned integer NOT NULL DEFAULT 0, PRIMARY KEY (user_id, week_start)
  );
  CREATE TABLE public.premium_waitlist (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
  CREATE TABLE public.user_badges (
    user_id uuid NOT NULL REFERENCES public.profiles(id), badge_id uuid NOT NULL,
    PRIMARY KEY (user_id, badge_id)
  );
  CREATE TABLE public.user_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id uuid NOT NULL,
    reported_user_id uuid NOT NULL, status text NOT NULL DEFAULT 'pending'
  );

  ALTER TABLE public.user_daily_quests ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.leaderboard_weekly ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
  CREATE POLICY daily_own ON public.user_daily_quests FOR ALL USING (auth.uid() = user_id);
  CREATE POLICY lb_own ON public.leaderboard_weekly FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY lb_own_update ON public.leaderboard_weekly FOR UPDATE USING (auth.uid() = user_id);
  CREATE POLICY badges_own ON public.user_badges FOR ALL USING (auth.uid() = user_id);
  GRANT ALL ON TABLE public.badges, public.client_logs, public.consent_logs,
    public.daily_quests, public.leaderboard_weekly, public.premium_waitlist,
    public.user_achievements, public.user_badges, public.user_daily_quests,
    public.user_reports TO PUBLIC, anon, authenticated, service_role;

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
    for (const migration of ['081_atomic_complete_game_session.sql', '091_verified_attempts.sql', '092_complete_verified_game_session.sql', '093_reward_integrity.sql', '172_trusted_state_and_consent_dml_lockdown.sql']) {
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

  it('applies reward and 172 trusted-state ACL, definer and trigger contracts', async () => {
    const catalog = await client.query(`
      SELECT
        (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.reward_ledger'::regclass) AS ledger_rls,
        has_table_privilege('authenticated', 'public.reward_ledger', 'INSERT') AS ledger_insert,
        has_table_privilege('authenticated', 'public.reward_ledger', 'SELECT') AS ledger_select,
        has_table_privilege('authenticated', 'public.xp_log', 'UPDATE') AS xp_update,
        has_table_privilege('authenticated', 'public.xp_log', 'SELECT') AS xp_select,
        has_table_privilege('authenticated', 'public.user_daily_quests', 'INSERT') AS quest_insert,
        has_any_column_privilege('authenticated', 'public.user_daily_quests', 'UPDATE') AS quest_column_update,
        has_table_privilege('authenticated', 'public.leaderboard_weekly', 'UPDATE') AS leaderboard_update,
        has_table_privilege('authenticated', 'public.consent_logs', 'INSERT') AS consent_insert,
        has_table_privilege('service_role', 'public.consent_logs', 'SELECT') AS consent_service_select,
        has_table_privilege('service_role', 'public.consent_logs', 'INSERT') AS consent_service_insert,
        has_table_privilege('service_role', 'public.user_daily_quests', 'INSERT') AS quest_service_insert,
        has_function_privilege('service_role', 'public.claim_daily_quest_reward(uuid,uuid)', 'EXECUTE') AS claim_service,
        has_function_privilege('authenticated', 'public.claim_daily_quest_reward(uuid,uuid)', 'EXECUTE') AS claim_auth,
        has_function_privilege('service_role', 'public.apply_verified_session_rewards(uuid,uuid)', 'EXECUTE') AS helper_service,
        (SELECT prosecdef FROM pg_proc WHERE oid = 'public.apply_verified_session_rewards(uuid,uuid)'::regprocedure) AS helper_definer,
        (SELECT proconfig::text FROM pg_proc WHERE oid = 'public.apply_verified_session_rewards(uuid,uuid)'::regprocedure) AS helper_config,
        (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.verified_attempts'::regclass AND tgname = 'trg_verified_attempt_reward_integrity' AND NOT tgisinternal) AS trigger_count
    `);
    expect(catalog.rows[0]).toMatchObject({
      ledger_rls: true, ledger_insert: false, ledger_select: true, xp_update: false, xp_select: true,
      quest_insert: false, quest_column_update: false, leaderboard_update: false,
      consent_insert: false, consent_service_select: true, consent_service_insert: true,
      quest_service_insert: true,
      claim_service: true, claim_auth: false, helper_service: false, helper_definer: true, trigger_count: '1',
    });
    expect(catalog.rows[0].helper_config).toContain('search_path=pg_catalog');
    const foreignKey = await client.query(`
      SELECT confrelid::regclass::text AS target FROM pg_constraint
      WHERE conrelid = 'public.user_achievements'::regclass AND conname = 'user_achievements_source_session_id_fkey'
    `);
    expect(foreignKey.rows[0].target).toBe('game_sessions');
  });

  it('keeps consent evidence service-readable and rejects browser writes and intent replay', async () => {
    const intentId = randomUUID();
    await client.query('SET ROLE authenticated');
    try {
      await expect(client.query(
        `INSERT INTO public.consent_logs (user_id, consent_type, consent_value)
         VALUES ($1, 'terms', jsonb_build_object('intentId', $2::text))`,
        [userOne, intentId],
      )).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.query('RESET ROLE');
    }

    await withServiceRole(client, () => client.query(
      `INSERT INTO public.consent_logs (user_id, consent_type, consent_value)
       VALUES
         ($1, 'terms', jsonb_build_object('intentId', $2::text)),
         ($1, 'kvkk', jsonb_build_object('intentId', $2::text))`,
      [userOne, intentId],
    ));
    const evidence = await withServiceRole(client, () => client.query(
      `SELECT user_id, consent_type FROM public.consent_logs
       WHERE consent_value ->> 'intentId' = $1 ORDER BY consent_type`,
      [intentId],
    ));
    expect(evidence.rows).toEqual([
      { user_id: userOne, consent_type: 'kvkk' },
      { user_id: userOne, consent_type: 'terms' },
    ]);

    await expect(withServiceRole(client, () => client.query(
      `INSERT INTO public.consent_logs (user_id, consent_type, consent_value)
       VALUES ($1, 'terms', jsonb_build_object('intentId', $2::text))`,
      [userTwo, intentId],
    ))).rejects.toMatchObject({ code: '23505' });
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

  it('denies direct trusted-state writes and rejects a forged completed quest without evidence', async () => {
    const quest = await client.query(`
      INSERT INTO public.daily_quests (slug, quest_type, target_value, xp_reward)
      VALUES ($1, 'play_sessions', 1, 40) RETURNING id
    `, [`r172-forged-${randomUUID()}`]);
    const userQuest = await client.query(`
      INSERT INTO public.user_daily_quests (
        user_id, quest_id, date, current_value, is_completed, completed_at
      ) VALUES (
        $1, $2, (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date,
        1, true, clock_timestamp()
      ) RETURNING id
    `, [userOne, quest.rows[0].id]);

    await client.query('SET ROLE authenticated');
    try {
      await expect(client.query(
        'UPDATE public.user_daily_quests SET xp_claimed=false WHERE id=$1',
        [userQuest.rows[0].id],
      )).rejects.toMatchObject({ code: '42501' });
      await expect(client.query(
        `INSERT INTO public.leaderboard_weekly(user_id,week_start,xp_earned)
         VALUES($1,current_date,999999)`,
        [userOne],
      )).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.query('RESET ROLE');
    }

    const before = await profileState(client, userOne);
    await expect(withServiceRole(client, () => client.query(
      'SELECT public.claim_daily_quest_reward($1,$2)',
      [userOne, userQuest.rows[0].id],
    ))).rejects.toMatchObject({ code: '22023' });
    expect(await profileState(client, userOne)).toEqual(before);
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
    await client.query(`
      INSERT INTO public.reward_ledger (
        user_id, source_type, source_id, reward_type, reward_key, amount, metadata
      ) VALUES ($1, 'daily_quest_completion', $2, 'progress', 'completed', 0, '{}'::jsonb)
    `, [userOne, claimUserQuestId]);
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

// Duello gonderim butunlugu (disc #2530): 077 + 20261016190000 gercek PostgreSQL'de.
const challengeFixtureSql = `
  CREATE TABLE public.challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    challenger_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    opponent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    game varchar(20) NOT NULL DEFAULT 'matematik',
    category varchar(30),
    status varchar(20) NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending','accepted','completed','expired','declined')),
    question_ids uuid[] NOT NULL,
    challenger_score jsonb,
    opponent_score jsonb,
    winner_id uuid REFERENCES public.profiles(id),
    xp_reward int NOT NULL DEFAULT 50,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
    CONSTRAINT chk_not_self CHECK (challenger_id != opponent_id)
  );
  ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
`;

describePostgres('challenge submit integrity on actual PostgreSQL migrations', () => {
  let client;
  const users = {};

  async function createChallenge(challengerId, opponentId, overrides = {}) {
    const result = await client.query(
      `INSERT INTO public.challenges (challenger_id, opponent_id, status, question_ids, expires_at)
       VALUES ($1, $2, $3, $4::uuid[], COALESCE($5::timestamptz, now() + interval '24 hours')) RETURNING id`,
      [challengerId, opponentId, overrides.status ?? 'accepted', [randomUUID(), randomUUID()], overrides.expiresAt ?? null],
    );
    return result.rows[0].id;
  }

  async function submit(connection, challengeId, userId, score) {
    const result = await connection.query(
      'SELECT public.submit_challenge_answer($1, $2, $3::jsonb) AS result',
      [challengeId, userId, JSON.stringify(score)],
    );
    return result.rows[0].result;
  }

  async function challengeRow(challengeId) {
    const result = await client.query('SELECT * FROM public.challenges WHERE id = $1', [challengeId]);
    return result.rows[0];
  }

  async function xpOf(userId) {
    const result = await client.query('SELECT total_xp FROM public.profiles WHERE id = $1', [userId]);
    return Number(result.rows[0].total_xp);
  }

  // Rakip once gonderir; kazanacak oyuncunun gonderimi duelloyu sonuclandirir.
  async function playToWin(winnerId, loserId) {
    const challengeId = await createChallenge(winnerId, loserId);
    expect(await submit(client, challengeId, loserId, { correct: 0, total: 2 })).toMatchObject({ ok: true, result: 'waiting_opponent' });
    return submit(client, challengeId, winnerId, { correct: 2, total: 2 });
  }

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;');
    await client.query(fixtureSql);
    await client.query(challengeFixtureSql);
    for (const migration of ['077_challenge_submit_atomic.sql', '20261016190000_challenge_submit_integrity.sql']) {
      await client.query(migrationSql(migration));
    }
    // Tekrar uygulanabilirlik: ayni migration ikinci kez hatasiz gecmeli.
    await client.query(migrationSql('20261016190000_challenge_submit_integrity.sql'));
    for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'p', 'q']) {
      users[name] = randomUUID();
      await client.query('INSERT INTO public.profiles (id) VALUES ($1)', [users[name]]);
    }
  });

  afterAll(async () => { await client?.end(); });

  it('keeps challenge RPCs service-role only with a fixed pg_catalog search path', async () => {
    const acl = await client.query(`
      SELECT
        has_function_privilege('authenticated', 'public.submit_challenge_answer(uuid,uuid,jsonb)', 'EXECUTE') AS auth_submit,
        has_function_privilege('anon', 'public.start_challenge_attempt(uuid,uuid)', 'EXECUTE') AS anon_start,
        has_function_privilege('authenticated', 'public.start_challenge_attempt(uuid,uuid)', 'EXECUTE') AS auth_start,
        has_function_privilege('service_role', 'public.submit_challenge_answer(uuid,uuid,jsonb)', 'EXECUTE') AS svc_submit,
        has_function_privilege('service_role', 'public.start_challenge_attempt(uuid,uuid)', 'EXECUTE') AS svc_start,
        (SELECT proconfig FROM pg_proc WHERE oid = 'public.submit_challenge_answer(uuid,uuid,jsonb)'::regprocedure) AS submit_config
    `);
    expect(acl.rows[0]).toMatchObject({ auth_submit: false, anon_start: false, auth_start: false, svc_submit: true, svc_start: true });
    expect(acl.rows[0].submit_config).toEqual(['search_path=pg_catalog']);
  });

  it('records the first start time once and ignores reloads', async () => {
    const challengeId = await createChallenge(users.a, users.b);
    const first = await withServiceRole(client, () => client.query('SELECT public.start_challenge_attempt($1, $2) AS r', [challengeId, users.a]));
    expect(first.rows[0].r).toMatchObject({ ok: true, started: true });
    const before = (await challengeRow(challengeId)).challenger_started_at;
    const second = await client.query('SELECT public.start_challenge_attempt($1, $2) AS r', [challengeId, users.a]);
    expect(second.rows[0].r).toMatchObject({ ok: true, started: false });
    expect((await challengeRow(challengeId)).challenger_started_at).toEqual(before);
    const outsider = await client.query('SELECT public.start_challenge_attempt($1, $2) AS r', [challengeId, users.c]);
    expect(outsider.rows[0].r).toMatchObject({ ok: false, error: 'not_participant' });
  });

  it('rejects score shapes outside the challenge question count', async () => {
    const challengeId = await createChallenge(users.a, users.b);
    for (const score of [{ correct: 50, total: 50 }, { correct: 3, total: 3 }, { correct: 0, total: 0 }, { correct: 3, total: 2 }, { correct: -1, total: 2 }, { total: 2 }, { correct: '2', total: 2 }]) {
      expect(await submit(client, challengeId, users.a, score)).toMatchObject({ ok: false, error: 'invalid_score' });
    }
    expect((await challengeRow(challengeId)).challenger_score).toBeNull();
    // Route GET ile ayni oynanabilir kumeyi notlar; silinmis soru kumeden duserse toplam kuculur.
    expect(await submit(client, challengeId, users.a, { correct: 1, total: 1 })).toMatchObject({ ok: true, result: 'waiting_opponent' });
  });

  it('marks an expired challenge before questions are served, but keeps the finish grace for an early start', async () => {
    const expired = await createChallenge(users.a, users.b, { expiresAt: new Date(Date.now() - 60_000).toISOString() });
    const late = await client.query('SELECT public.start_challenge_attempt($1, $2) AS r', [expired, users.b]);
    expect(late.rows[0].r).toMatchObject({ ok: false, error: 'expired' });
    expect((await challengeRow(expired)).status).toBe('expired');
    expect((await challengeRow(expired)).opponent_started_at).toBeNull();

    const graced = await createChallenge(users.a, users.b, { expiresAt: new Date(Date.now() - 10 * 60_000).toISOString() });
    await client.query("UPDATE public.challenges SET challenger_started_at = clock_timestamp() - interval '20 minutes' WHERE id = $1", [graced]);
    const reload = await client.query('SELECT public.start_challenge_attempt($1, $2) AS r', [graced, users.a]);
    expect(reload.rows[0].r).toMatchObject({ ok: true, started: false });
    expect((await challengeRow(graced)).status).toBe('accepted');
  });

  it('measures time on the server and ignores client time', async () => {
    const challengeId = await createChallenge(users.a, users.b);
    await client.query("UPDATE public.challenges SET challenger_started_at = clock_timestamp() - interval '30 seconds' WHERE id = $1", [challengeId]);
    const result = await submit(client, challengeId, users.a, { correct: 1, total: 2, time_sec: 1 });
    expect(result).toMatchObject({ ok: true, result: 'waiting_opponent' });
    expect(result.score.time_sec).toBeGreaterThanOrEqual(29);
    expect(result.score.time_sec).toBeLessThanOrEqual(35);
    expect((await challengeRow(challengeId)).challenger_score.time_sec).toBe(result.score.time_sec);
  });

  it('rejects an expired challenge and marks it expired, but lets a player who started in time finish', async () => {
    const expired = await createChallenge(users.a, users.b, { expiresAt: new Date(Date.now() - 60_000).toISOString() });
    expect(await submit(client, expired, users.a, { correct: 2, total: 2 })).toMatchObject({ ok: false, error: 'expired' });
    expect((await challengeRow(expired)).status).toBe('expired');

    const graced = await createChallenge(users.a, users.b, { expiresAt: new Date(Date.now() - 10 * 60_000).toISOString() });
    await client.query("UPDATE public.challenges SET challenger_started_at = clock_timestamp() - interval '20 minutes' WHERE id = $1", [graced]);
    expect(await submit(client, graced, users.a, { correct: 2, total: 2 })).toMatchObject({ ok: true, result: 'waiting_opponent' });
  });

  it('breaks ties by server time only when both sides have a server clock', async () => {
    const timed = await createChallenge(users.c, users.d);
    await client.query(`UPDATE public.challenges
      SET challenger_started_at = clock_timestamp() - interval '90 seconds',
          opponent_started_at = clock_timestamp() - interval '20 seconds' WHERE id = $1`, [timed]);
    await submit(client, timed, users.c, { correct: 1, total: 2, time_sec: 0 });
    const timedResult = await submit(client, timed, users.d, { correct: 1, total: 2, time_sec: 999 });
    expect(timedResult).toMatchObject({ ok: true, result: 'completed', winnerId: users.d });

    const legacy = await createChallenge(users.e, users.f);
    await client.query(
      'UPDATE public.challenges SET challenger_score = $2::jsonb, opponent_started_at = clock_timestamp() - interval \'5 seconds\' WHERE id = $1',
      [legacy, JSON.stringify({ correct: 1, total: 2, time_sec: 1 })],
    );
    const legacyResult = await submit(client, legacy, users.f, { correct: 1, total: 2 });
    expect(legacyResult).toMatchObject({ ok: true, result: 'completed', winnerId: null, xpAwarded: 0 });
  });

  it('awards XP once per opponent per day and at most three rewarded wins per day', async () => {
    const start = await xpOf(users.g);
    const firstWin = await playToWin(users.g, users.a);
    expect(firstWin).toMatchObject({ ok: true, result: 'completed', winnerId: users.g, xpAwarded: 50 });
    const sameOpponent = await playToWin(users.g, users.a);
    expect(sameOpponent).toMatchObject({ winnerId: users.g, xpAwarded: 0 });
    expect(await playToWin(users.g, users.b)).toMatchObject({ xpAwarded: 50 });
    expect(await playToWin(users.g, users.c)).toMatchObject({ xpAwarded: 50 });
    expect(await playToWin(users.g, users.d)).toMatchObject({ winnerId: users.g, xpAwarded: 0 });
    expect(await xpOf(users.g) - start).toBe(150);
    const rewarded = await client.query(
      'SELECT count(*)::int AS n FROM public.challenges WHERE winner_id = $1 AND xp_awarded > 0 AND completed_at IS NOT NULL', [users.g],
    );
    expect(rewarded.rows[0].n).toBe(3);
    const log = await client.query("SELECT count(*)::int AS n FROM public.xp_log WHERE user_id = $1 AND reason = 'challenge_win'", [users.g]);
    expect(log.rows[0].n).toBe(3);
  });

  it('serializes concurrent completions for one winner so the daily cap holds', async () => {
    expect(await playToWin(users.h, users.a)).toMatchObject({ xpAwarded: 50 });
    expect(await playToWin(users.h, users.b)).toMatchObject({ xpAwarded: 50 });
    const pending = [];
    for (const loser of [users.p, users.q]) {
      const challengeId = await createChallenge(users.h, loser);
      await submit(client, challengeId, loser, { correct: 0, total: 2 });
      pending.push(challengeId);
    }
    const first = new Client({ connectionString: databaseUrl });
    const second = new Client({ connectionString: databaseUrl });
    await Promise.all([first.connect(), second.connect()]);
    let results;
    try {
      results = await Promise.all([first, second].map((connection, index) => withServiceRole(connection, () =>
        submit(connection, pending[index], users.h, { correct: 2, total: 2 }))));
    } finally { await Promise.all([first.end(), second.end()]); }
    expect(results.map((result) => result.xpAwarded).sort()).toEqual([0, 50]);
    expect(await xpOf(users.h)).toBe(150);
  });

  it('rejects a second submission from the same side under the row lock', async () => {
    const challengeId = await createChallenge(users.a, users.c);
    expect(await submit(client, challengeId, users.a, { correct: 1, total: 2 })).toMatchObject({ ok: true });
    expect(await submit(client, challengeId, users.a, { correct: 2, total: 2 })).toMatchObject({ ok: false, error: 'already_submitted' });
  });
});
