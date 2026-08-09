// Opt-in integration test for migrations 081, 091 and 092.
//
// This test will only connect when both variables are set:
//   VERIFIED_ATTEMPTS_TEST_DATABASE_URL=postgres://.../bilge_r02_test_<name>
//   VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE=1
// The database-name guard deliberately prevents this suite from targeting a
// production or shared development database.
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
  throw new Error(
    'Refusing PostgreSQL integration test without VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE=1',
  );
}

if (databaseUrl && !/^bilge_r02_test_[a-z0-9_]+$/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('Refusing PostgreSQL integration test against a non-disposable database name');
}

const runIntegration = Boolean(databaseUrl && disposableConfirmation === '1');
const describePostgres = runIntegration ? describe : describe.skip;
const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'migrations');

const migrationSql = (filename) => readFileSync(join(migrationsDir, filename), 'utf8');

const fixtureSql = `
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  DO $$
  BEGIN
    CREATE ROLE anon NOLOGIN;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;
  DO $$
  BEGIN
    CREATE ROLE authenticated NOLOGIN;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;
  DO $$
  BEGIN
    CREATE ROLE service_role NOLOGIN;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;

  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    xp integer NOT NULL DEFAULT 0,
    coins integer NOT NULL DEFAULT 0
  );
  CREATE TABLE public.questions (
    id uuid PRIMARY KEY,
    game text NOT NULL,
    is_active boolean NOT NULL DEFAULT true
  );
  CREATE TABLE public.game_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    game text NOT NULL,
    mode text NOT NULL,
    status text NOT NULL,
    total_questions integer NOT NULL,
    correct_count smallint NOT NULL,
    wrong_count smallint NOT NULL,
    skipped_count smallint NOT NULL,
    base_xp integer NOT NULL,
    bonus_xp integer NOT NULL,
    total_xp integer NOT NULL,
    time_spent_sec integer NOT NULL,
    avg_time_sec numeric NOT NULL,
    streak_at_start integer NOT NULL,
    filter_category text,
    filter_difficulty smallint,
    completed_at timestamptz
  );
  CREATE TABLE public.session_answers (
    session_id uuid NOT NULL REFERENCES public.game_sessions(id),
    question_id uuid NOT NULL,
    user_id uuid NOT NULL,
    selected_option smallint,
    is_correct boolean,
    is_skipped boolean,
    time_taken_sec numeric,
    is_fast boolean,
    xp_earned smallint,
    question_order smallint
  );
  CREATE TABLE public.user_topic_progress (
    user_id uuid NOT NULL,
    game text NOT NULL,
    category text NOT NULL,
    questions_seen integer NOT NULL,
    correct integer NOT NULL,
    last_seen_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, game, category)
  );

  CREATE FUNCTION public.batch_increment_question_stats(uuid[], boolean[])
  RETURNS void LANGUAGE plpgsql AS $$ BEGIN END; $$;
  CREATE FUNCTION public.increment_coins(p_user_id uuid, p_amount integer)
  RETURNS void LANGUAGE plpgsql AS $$
  BEGIN
    UPDATE public.profiles SET coins = coins + p_amount WHERE id = p_user_id;
  END;
  $$;
  CREATE FUNCTION public.increment_xp(p_user_id uuid, p_amount integer, text, uuid)
  RETURNS void LANGUAGE plpgsql AS $$
  BEGIN
    UPDATE public.profiles SET xp = xp + p_amount WHERE id = p_user_id;
  END;
  $$;
`;

const answersFor = (questionId) => [
  {
    question_id: questionId,
    selected_option: 1,
    is_correct: true,
    is_skipped: false,
    time_taken_sec: 3,
    is_fast: true,
    xp_earned: 7,
    question_order: 1,
  },
];

async function withServiceRole(client, callback) {
  await client.query('SET ROLE service_role');
  try {
    return await callback();
  } finally {
    await client.query('RESET ROLE');
  }
}

async function issueAttempt(client, { userId, game = 'wordquest', mode = 'classic', questionIds, duration = 60 }) {
  const result = await client.query(
    'SELECT public.issue_verified_attempt($1, $2, $3, $4::uuid[], $5) AS result',
    [userId, game, mode, questionIds, duration],
  );
  return result.rows[0].result;
}

async function completeAttempt(client, args) {
  const result = await client.query(
    `SELECT public.complete_verified_game_session(
      $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::text,
      $7::smallint, $8::jsonb, $9::integer, $10::integer, $11::integer,
      $12::smallint, $13::smallint, $14::integer, $15::numeric
    ) AS result`,
    [
      args.attemptId,
      args.userId,
      args.clientRequestId,
      args.game ?? 'wordquest',
      args.mode ?? 'classic',
      'fixture',
      1,
      JSON.stringify(args.answers),
      args.totalXp,
      args.totalXp,
      0,
      1,
      0,
      3,
      3,
    ],
  );
  return result.rows[0].result;
}

async function expectPgError(callback, code) {
  try {
    await callback();
    throw new Error(`expected PostgreSQL error ${code}`);
  } catch (error) {
    expect(error.code).toBe(code);
  }
}

async function userOutcomeStats(client, userId) {
  const result = await client.query(`
    SELECT
      (SELECT count(*) FROM public.game_sessions WHERE user_id = $1) AS sessions,
      (SELECT count(*) FROM public.session_answers WHERE user_id = $1) AS answers,
      (SELECT xp FROM public.profiles WHERE id = $1) AS xp,
      (SELECT coins FROM public.profiles WHERE id = $1) AS coins
  `, [userId]);
  return Object.fromEntries(
    Object.entries(result.rows[0]).map(([key, value]) => [key, Number(value)]),
  );
}

async function expectRejectedCompletion(client, { attemptId, ownerUserId, code, callArgs }) {
  const before = await userOutcomeStats(client, ownerUserId);
  await withServiceRole(client, () =>
    expectPgError(() => completeAttempt(client, callArgs), code),
  );
  expect(await userOutcomeStats(client, ownerUserId)).toEqual(before);
  const attempt = await client.query(
    'SELECT session_id, completed_at FROM public.verified_attempts WHERE id = $1',
    [attemptId],
  );
  expect(attempt.rows[0]).toMatchObject({ session_id: null, completed_at: null });
}

describePostgres('verified attempts real PostgreSQL integration', () => {
  let client;
  let userOne;
  let userTwo;
  let issuedQuestion;
  let secondQuestion;
  let inactiveQuestion;
  let otherGameQuestion;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    // The opt-in URL and disposable-name guards above are evaluated before this
    // destructive reset. Roles are cluster-wide and the fixture handles them
    // idempotently after the schemas are recreated.
    await client.query(`
      DROP SCHEMA IF EXISTS auth CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      CREATE SCHEMA auth;
    `);
    await client.query(fixtureSql);
    await client.query(migrationSql('081_atomic_complete_game_session.sql'));
    await client.query(migrationSql('091_verified_attempts.sql'));
    await client.query(migrationSql('092_complete_verified_game_session.sql'));

    userOne = randomUUID();
    userTwo = randomUUID();
    issuedQuestion = randomUUID();
    secondQuestion = randomUUID();
    inactiveQuestion = randomUUID();
    otherGameQuestion = randomUUID();
    await client.query('INSERT INTO public.profiles (id) VALUES ($1), ($2)', [userOne, userTwo]);
    await client.query(
      'INSERT INTO public.questions (id, game, is_active) VALUES ($1, $2, true), ($3, $2, true), ($4, $2, false), ($5, $6, true)',
      [issuedQuestion, 'wordquest', secondQuestion, inactiveQuestion, otherGameQuestion, 'matematik'],
    );
  });

  afterAll(async () => {
    await client?.end();
  });

  it('applies actual migrations and exposes the required secure catalog state', async () => {
    const tableState = await client.query(`
      SELECT c.relrowsecurity,
        (SELECT count(*) FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = 'verified_attempts') AS policy_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'verified_attempts'
    `);
    expect(tableState.rows[0]).toMatchObject({ relrowsecurity: true, policy_count: '0' });

    const privileges = await client.query(`
      SELECT
        has_table_privilege('anon', 'public.verified_attempts', 'INSERT') AS anon_insert,
        has_table_privilege('authenticated', 'public.verified_attempts', 'SELECT') AS authenticated_select,
        has_function_privilege('service_role',
          'public.issue_verified_attempt(uuid,text,text,uuid[],integer)', 'EXECUTE') AS issue_service,
        has_function_privilege('anon',
          'public.issue_verified_attempt(uuid,text,text,uuid[],integer)', 'EXECUTE') AS issue_anon,
        has_function_privilege('anon',
          'public.verified_attempts_question_ids_valid(uuid[])', 'EXECUTE') AS helper_anon,
        has_function_privilege('service_role',
          'public.complete_verified_game_session(uuid,uuid,uuid,text,text,text,smallint,jsonb,integer,integer,integer,smallint,smallint,integer,numeric)', 'EXECUTE') AS complete_service,
        has_function_privilege('authenticated',
          'public.complete_verified_game_session(uuid,uuid,uuid,text,text,text,smallint,jsonb,integer,integer,integer,smallint,smallint,integer,numeric)', 'EXECUTE') AS complete_authenticated,
        has_function_privilege('service_role',
          'public.complete_game_session(uuid,uuid,text,text,text,smallint,jsonb,integer,integer,integer,smallint,smallint,integer,numeric)', 'EXECUTE') AS old_service
    `);
    expect(privileges.rows[0]).toMatchObject({
      anon_insert: false,
      authenticated_select: false,
      issue_service: true,
      issue_anon: false,
      helper_anon: false,
      complete_service: true,
      complete_authenticated: false,
      old_service: false,
    });

    const functions = await client.query(`
      SELECT p.proname, p.prosecdef, p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('issue_verified_attempt', 'complete_verified_game_session')
      ORDER BY p.proname
    `);
    expect(functions.rows).toHaveLength(2);
    for (const fn of functions.rows) {
      expect(fn.prosecdef).toBe(true);
      expect(fn.proconfig).toContain('search_path=pg_catalog');
    }
  });

  it('rejects invalid issuance, then issues only active same-game unique questions', async () => {
    await withServiceRole(client, () =>
      expectPgError(
        () => issueAttempt(client, { userId: userOne, questionIds: [inactiveQuestion] }),
        '22023',
      ),
    );
    await withServiceRole(client, () =>
      expectPgError(
        () => issueAttempt(client, { userId: userOne, questionIds: [otherGameQuestion] }),
        '22023',
      ),
    );
    await withServiceRole(client, () =>
      expectPgError(
        () => issueAttempt(client, { userId: userOne, questionIds: [issuedQuestion, issuedQuestion] }),
        '22023',
      ),
    );

    const issued = await withServiceRole(client, () =>
      issueAttempt(client, { userId: userOne, questionIds: [issuedQuestion] }),
    );
    expect(issued.attemptId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(new Date(issued.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('enforces the completed-at/session-id state constraint in PostgreSQL', async () => {
    const issued = await withServiceRole(client, () =>
      issueAttempt(client, { userId: userOne, questionIds: [issuedQuestion] }),
    );
    await expectPgError(
      () => client.query('UPDATE public.verified_attempts SET completed_at = clock_timestamp() WHERE id = $1', [issued.attemptId]),
      '23514',
    );
  });

  it('rejects malformed, mismatched, expired, and colliding completions without binding attempts', async () => {
    const rejectedCases = [
      { name: 'missing question_id', answers: [{}], code: '22023' },
      { name: 'noncanonical UUID', answers: answersFor('not-a-uuid'), code: '22023' },
      { name: 'question outside issued set', answers: answersFor(secondQuestion), code: '22023' },
      { name: 'wrong user', answers: answersFor(issuedQuestion), userId: userTwo, code: '42501' },
      { name: 'wrong game', answers: answersFor(issuedQuestion), game: 'matematik', code: '22023' },
      { name: 'wrong mode', answers: answersFor(issuedQuestion), mode: 'blitz', code: '22023' },
      { name: 'NULL answers', answers: null, code: '22023' },
      { name: 'empty answers', answers: [], code: '22023' },
    ];

    for (const rejected of rejectedCases) {
      const attempt = await withServiceRole(client, () =>
        issueAttempt(client, { userId: userOne, questionIds: [issuedQuestion] }),
      );
      await expectRejectedCompletion(client, {
        attemptId: attempt.attemptId,
        ownerUserId: userOne,
        code: rejected.code,
        callArgs: {
          attemptId: attempt.attemptId,
          userId: rejected.userId ?? userOne,
          clientRequestId: randomUUID(),
          game: rejected.game,
          mode: rejected.mode,
          answers: rejected.answers,
          totalXp: 7,
        },
      });
    }

    const expired = await withServiceRole(client, () =>
      issueAttempt(client, { userId: userOne, questionIds: [issuedQuestion], duration: 5 }),
    );
    await client.query(
      "UPDATE public.verified_attempts SET started_at = clock_timestamp() - interval '10 seconds', expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [expired.attemptId],
    );
    await expectRejectedCompletion(client, {
      attemptId: expired.attemptId,
      ownerUserId: userOne,
      code: '22023',
      callArgs: {
        attemptId: expired.attemptId,
        userId: userOne,
        clientRequestId: randomUUID(),
        answers: answersFor(issuedQuestion),
        totalXp: 7,
      },
    });

    const completedAttempt = await withServiceRole(client, () =>
      issueAttempt(client, { userId: userOne, questionIds: [issuedQuestion] }),
    );
    const occupiedRequestId = randomUUID();
    await withServiceRole(client, () => completeAttempt(client, {
      attemptId: completedAttempt.attemptId,
      userId: userOne,
      clientRequestId: occupiedRequestId,
      answers: answersFor(issuedQuestion),
      totalXp: 7,
    }));
    const collisionAttempt = await withServiceRole(client, () =>
      issueAttempt(client, { userId: userOne, questionIds: [issuedQuestion] }),
    );
    await expectRejectedCompletion(client, {
      attemptId: collisionAttempt.attemptId,
      ownerUserId: userOne,
      code: '23505',
      callArgs: {
        attemptId: collisionAttempt.attemptId,
        userId: userOne,
        clientRequestId: occupiedRequestId,
        answers: answersFor(issuedQuestion),
        totalXp: 7,
      },
    });
  });

  it('uses actual migration 081 for a fresh completion and replays safely', async () => {
    const attempt = await withServiceRole(client, () =>
      issueAttempt(client, { userId: userOne, questionIds: [issuedQuestion] }),
    );
    const requestId = randomUUID();
    const first = await withServiceRole(client, () => completeAttempt(client, {
      attemptId: attempt.attemptId,
      userId: userOne,
      clientRequestId: requestId,
      answers: answersFor(issuedQuestion),
      totalXp: 11,
    }));
    const replay = await withServiceRole(client, () => completeAttempt(client, {
      attemptId: attempt.attemptId,
      userId: userOne,
      clientRequestId: requestId,
      answers: answersFor(issuedQuestion),
      totalXp: 11,
    }));
    expect(first.alreadyProcessed).toBe(false);
    expect(replay).toMatchObject({ sessionId: first.sessionId, alreadyProcessed: true });

    const completion = await client.query(
      'SELECT session_id, completed_at FROM public.verified_attempts WHERE id = $1',
      [attempt.attemptId],
    );
    expect(completion.rows[0].session_id).toBe(first.sessionId);
    expect(completion.rows[0].completed_at).not.toBeNull();
  });

  it('serializes two concurrent callers of one attempt to one session and one reward', async () => {
    const attempt = await withServiceRole(client, () =>
      issueAttempt(client, { userId: userTwo, questionIds: [secondQuestion] }),
    );
    const firstCallArgs = {
      attemptId: attempt.attemptId,
      userId: userTwo,
      clientRequestId: randomUUID(),
      answers: answersFor(secondQuestion),
      totalXp: 13,
    };
    const secondCallArgs = { ...firstCallArgs, clientRequestId: randomUUID() };
    const before = await userOutcomeStats(client, userTwo);
    const firstClient = new Client({ connectionString: databaseUrl });
    const secondClient = new Client({ connectionString: databaseUrl });
    let concurrentSessionId;
    await Promise.all([firstClient.connect(), secondClient.connect()]);
    try {
      const [first, second] = await Promise.all([
        withServiceRole(firstClient, () => completeAttempt(firstClient, firstCallArgs)),
        withServiceRole(secondClient, () => completeAttempt(secondClient, secondCallArgs)),
      ]);
      expect([first.alreadyProcessed, second.alreadyProcessed].sort()).toEqual([false, true]);
      expect(first.sessionId).toBe(second.sessionId);
      concurrentSessionId = first.sessionId;
    } finally {
      await Promise.all([firstClient.end(), secondClient.end()]);
    }

    const after = await userOutcomeStats(client, userTwo);
    expect(after.sessions - before.sessions).toBe(1);
    expect(after.answers - before.answers).toBe(1);
    expect(after.xp - before.xp).toBe(13);
    expect(after.coins - before.coins).toBe(1);
    const completedAttempt = await client.query(
      'SELECT session_id, completed_at FROM public.verified_attempts WHERE id = $1',
      [attempt.attemptId],
    );
    expect(completedAttempt.rows[0].session_id).toBe(concurrentSessionId);
    expect(completedAttempt.rows[0].completed_at).not.toBeNull();
  });
});
