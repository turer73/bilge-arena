// Opt-in disposable PostgreSQL coverage for 086 -> 096 -> 098.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const url = process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_URL
const enabled = Boolean(url && process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE === '1')
if (url && !/^bilge_r02_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) {
  throw new Error('non-disposable database refused')
}
const describePg = enabled ? describe : describe.skip
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const read = (name) => readFileSync(join(root, name), 'utf8')
const { Client } = pg

describePg('098 adaptive diagnostic real PostgreSQL', () => {
  let client
  let secondClient
  const user = randomUUID()
  const other = randomUUID()
  const expiringUser = randomUUID()
  const categories = ['sayilar', 'denklemler', 'fonksiyonlar', 'problemler', 'geometri', 'olasilik']
  const questions = Object.fromEntries(categories.map((category) => [category, {
    base: randomUUID(),
    follow: randomUUID(),
  }]))
  const mainSession = randomUUID()

  beforeAll(async () => {
    client = new Client({ connectionString: url })
    secondClient = new Client({ connectionString: url })
    await client.connect()
    await secondClient.connect()
    await client.query(`
      DROP SCHEMA IF EXISTS auth CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      CREATE SCHEMA auth;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      ALTER ROLE service_role BYPASSRLS;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated,service_role;
      GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY);
      CREATE TABLE public.questions(
        id uuid PRIMARY KEY,
        game varchar(20) NOT NULL,
        category varchar(30) NOT NULL,
        difficulty smallint NOT NULL CHECK(difficulty BETWEEN 1 AND 5),
        exam_ref varchar(20),
        is_active boolean NOT NULL DEFAULT true
      );
      CREATE TABLE public.session_answers(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES public.profiles(id),
        question_id uuid NOT NULL REFERENCES public.questions(id),
        is_correct boolean NOT NULL,
        is_skipped boolean,
        answered_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
    `)
    await client.query('INSERT INTO public.profiles(id) VALUES($1),($2),($3)', [user, other, expiringUser])
    const values = []
    const parameters = []
    for (const category of categories) {
      const baseOffset = parameters.length
      parameters.push(questions[category].base, category, questions[category].follow)
      values.push(
        `($${baseOffset + 1},'matematik',$${baseOffset + 2},3,'TYT',true)`,
        `($${baseOffset + 3},'matematik',$${baseOffset + 2},4,'TYT',true)`,
      )
    }
    await client.query(`INSERT INTO public.questions(id,game,category,difficulty,exam_ref,is_active) VALUES ${values.join(',')}`, parameters)
    for (const migration of ['086_outcome_mastery_pilot.sql', '096_curriculum_graph_v1.sql', '098_adaptive_diagnostic.sql']) {
      await client.query(read(migration))
    }
  })

  afterAll(async () => {
    await secondClient?.end()
    await client?.end()
  })

  async function asRole(role, work) {
    await client.query(`SET ROLE ${role}`)
    try {
      return await work()
    } finally {
      await client.query('RESET ROLE')
    }
  }

  async function start(userId, sessionId, firstQuestionId) {
    return (await client.query(
      'SELECT public.start_adaptive_diagnostic($1,$2,$3) result',
      [userId, sessionId, firstQuestionId],
    )).rows[0].result
  }

  async function record(connection, { userId = user, sessionId = mainSession, questionId, correct, requestId, nextQuestionId }) {
    return (await connection.query(
      'SELECT public.record_adaptive_diagnostic_answer($1,$2,$3,$4,$5,$6,$7) result',
      [userId, sessionId, questionId, correct, 1200, requestId, nextQuestionId],
    )).rows[0].result
  }

  it('requires ten candidates, starts once, and resumes the locked active session', async () => {
    for (const category of categories.slice(3)) {
      await client.query('UPDATE public.questions SET is_active=false WHERE id=$1', [questions[category].follow])
    }
    await expect(start(other, randomUUID(), questions.sayilar.base)).rejects.toMatchObject({ code: '23514' })
    for (const category of categories.slice(3)) {
      await client.query('UPDATE public.questions SET is_active=true WHERE id=$1', [questions[category].follow])
    }

    const started = await start(user, mainSession, questions.sayilar.base)
    expect(started).toMatchObject({
      sessionId: mainSession,
      currentQuestionId: questions.sayilar.base,
      kind: 'initial',
      answeredCount: 0,
      coveredOutcomes: 0,
      resumed: false,
    })
    expect(await start(user, randomUUID(), questions.denklemler.base)).toMatchObject({
      sessionId: mainSession,
      currentQuestionId: questions.sayilar.base,
      resumed: true,
    })

    const outside = randomUUID()
    await client.query("INSERT INTO public.questions VALUES($1,'matematik','sayilar',3,'LGS',true)", [outside])
    await expect(start(other, randomUUID(), outside)).rejects.toMatchObject({ code: '22023' })
  })

  it('serializes answer replay and enforces coverage before confirmations', async () => {
    await expect(record(client, {
      userId: other,
      questionId: questions.sayilar.base,
      correct: false,
      requestId: randomUUID(),
      nextQuestionId: questions.denklemler.base,
    })).rejects.toMatchObject({ code: '42501' })
    await expect(record(client, {
      questionId: questions.sayilar.base,
      correct: false,
      requestId: randomUUID(),
      nextQuestionId: questions.sayilar.follow,
    })).rejects.toMatchObject({ code: '23514' })

    const requestId = randomUUID()
    const calls = await Promise.all([
      record(client, {
        questionId: questions.sayilar.base,
        correct: false,
        requestId,
        nextQuestionId: questions.denklemler.base,
      }),
      record(secondClient, {
        questionId: questions.sayilar.base,
        correct: false,
        requestId,
        nextQuestionId: questions.denklemler.base,
      }),
    ])
    expect(calls.map((result) => result.alreadyProcessed).sort()).toEqual([false, true])
    expect(calls[0]).toMatchObject({ status: 'active', answeredCount: 1, coveredOutcomes: 1 })
    expect((await client.query(
      'SELECT count(*) FROM public.adaptive_diagnostic_answers WHERE session_id=$1',
      [mainSession],
    )).rows[0].count).toBe('1')

    expect(await record(client, {
      questionId: questions.sayilar.base,
      correct: true,
      requestId: randomUUID(),
      nextQuestionId: questions.denklemler.base,
    })).toMatchObject({ alreadyProcessed: true, answeredCount: 1 })
  })

  it('completes ten answers, materializes six explainable states, and never drifts on replay', async () => {
    const steps = [
      [questions.denklemler.base, true, questions.fonksiyonlar.base],
      [questions.fonksiyonlar.base, true, questions.problemler.base],
      [questions.problemler.base, false, questions.geometri.base],
      [questions.geometri.base, true, questions.olasilik.base],
      [questions.olasilik.base, false, questions.sayilar.follow],
      [questions.sayilar.follow, false, questions.denklemler.follow],
      [questions.denklemler.follow, false, questions.fonksiyonlar.follow],
      [questions.fonksiyonlar.follow, true, questions.problemler.follow],
      [questions.problemler.follow, true, null],
    ]
    let lastRequestId
    for (const [questionId, correct, nextQuestionId] of steps) {
      lastRequestId = randomUUID()
      await record(client, { questionId, correct, requestId: lastRequestId, nextQuestionId })
    }

    const completed = (await client.query(
      'SELECT status,answered_count,covered_outcomes,current_question_id,completed_at IS NOT NULL completed FROM public.adaptive_diagnostic_sessions WHERE id=$1',
      [mainSession],
    )).rows[0]
    expect(completed).toEqual({
      status: 'completed', answered_count: 10, covered_outcomes: 6,
      current_question_id: null, completed: true,
    })

    const state = await client.query(`SELECT outcome.category,state.attempts,state.correct_attempts,state.score,state.recommended_difficulty
      FROM public.user_diagnostic_outcome_state state
      JOIN public.curriculum_outcomes outcome ON outcome.id=state.outcome_id
      WHERE state.user_id=$1 ORDER BY outcome.sort_order`, [user])
    expect(state.rows).toEqual([
      { category: 'sayilar', attempts: 2, correct_attempts: 0, score: '0.00', recommended_difficulty: 3 },
      { category: 'denklemler', attempts: 2, correct_attempts: 1, score: '42.86', recommended_difficulty: 3 },
      { category: 'fonksiyonlar', attempts: 2, correct_attempts: 2, score: '100.00', recommended_difficulty: 5 },
      { category: 'problemler', attempts: 2, correct_attempts: 1, score: '57.14', recommended_difficulty: 5 },
      { category: 'geometri', attempts: 1, correct_attempts: 1, score: '100.00', recommended_difficulty: 4 },
      { category: 'olasilik', attempts: 1, correct_attempts: 0, score: '0.00', recommended_difficulty: 2 },
    ])
    const stateBeforeReplay = JSON.stringify(state.rows)
    expect(await record(client, {
      questionId: questions.problemler.follow,
      correct: false,
      requestId: lastRequestId,
      nextQuestionId: null,
    })).toMatchObject({ alreadyProcessed: true, status: 'completed', answeredCount: 10 })
    expect(JSON.stringify((await client.query(`SELECT outcome.category,state.attempts,state.correct_attempts,state.score,state.recommended_difficulty
      FROM public.user_diagnostic_outcome_state state JOIN public.curriculum_outcomes outcome ON outcome.id=state.outcome_id
      WHERE state.user_id=$1 ORDER BY outcome.sort_order`, [user])).rows)).toBe(stateBeforeReplay)

    await expect(client.query(
      'UPDATE public.adaptive_diagnostic_answers SET is_correct=true WHERE session_id=$1',
      [mainSession],
    )).rejects.toMatchObject({ code: '42501' })
    await expect(client.query(
      'DELETE FROM public.adaptive_diagnostic_answers WHERE session_id=$1',
      [mainSession],
    )).rejects.toMatchObject({ code: '42501' })
  })

  it('labels a later run as recheck and persists expiry/insufficient coverage as abandoned', async () => {
    const recheck = randomUUID()
    expect(await start(user, recheck, questions.sayilar.base)).toMatchObject({ kind: 'recheck', resumed: false })
    expect(await record(client, {
      sessionId: recheck,
      questionId: questions.sayilar.base,
      correct: true,
      requestId: randomUUID(),
      nextQuestionId: null,
    })).toMatchObject({ status: 'abandoned', answeredCount: 1, coveredOutcomes: 1 })
    expect((await client.query(
      'SELECT count(*) FROM public.user_diagnostic_outcome_state WHERE user_id=$1',
      [user],
    )).rows[0].count).toBe('6')

    const expiring = randomUUID()
    await start(expiringUser, expiring, questions.sayilar.base)
    await client.query(`UPDATE public.adaptive_diagnostic_sessions
      SET started_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour'
      WHERE id=$1`, [expiring])
    expect(await record(client, {
      userId: expiringUser,
      sessionId: expiring,
      questionId: questions.sayilar.base,
      correct: true,
      requestId: randomUUID(),
      nextQuestionId: questions.denklemler.base,
    })).toMatchObject({ status: 'abandoned', answeredCount: 0, coveredOutcomes: 0 })
    expect((await client.query(
      'SELECT status,current_question_id FROM public.adaptive_diagnostic_sessions WHERE id=$1',
      [expiring],
    )).rows[0]).toEqual({ status: 'abandoned', current_question_id: null })
  })

  it('keeps all raw records private with service read-only and RPC-only writes', async () => {
    const acl = await client.query(`SELECT
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.adaptive_diagnostic_sessions'::regclass) sessions_rls,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.adaptive_diagnostic_answers'::regclass) answers_rls,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.user_diagnostic_outcome_state'::regclass) state_rls,
      has_table_privilege('authenticated','public.adaptive_diagnostic_sessions','SELECT') auth_select,
      has_table_privilege('service_role','public.adaptive_diagnostic_sessions','SELECT') service_select,
      has_table_privilege('service_role','public.adaptive_diagnostic_sessions','INSERT') service_insert,
      has_table_privilege('service_role','public.adaptive_diagnostic_sessions','UPDATE') service_update,
      has_table_privilege('service_role','public.adaptive_diagnostic_sessions','DELETE') service_delete,
      has_table_privilege('service_role','public.adaptive_diagnostic_sessions','TRUNCATE') service_truncate,
      has_table_privilege('service_role','public.adaptive_diagnostic_sessions','REFERENCES') service_references,
      has_table_privilege('service_role','public.adaptive_diagnostic_sessions','TRIGGER') service_trigger,
      has_function_privilege('authenticated','public.start_adaptive_diagnostic(uuid,uuid,uuid)','EXECUTE') auth_start,
      has_function_privilege('service_role','public.start_adaptive_diagnostic(uuid,uuid,uuid)','EXECUTE') service_start,
      has_function_privilege('service_role','public.record_adaptive_diagnostic_answer(uuid,uuid,uuid,boolean,integer,uuid,uuid)','EXECUTE') service_record,
      has_function_privilege('service_role','public.resolve_adaptive_diagnostic_question(uuid)','EXECUTE') service_resolve`)
    expect(acl.rows[0]).toEqual({
      sessions_rls: true, answers_rls: true, state_rls: true,
      auth_select: false, service_select: true, service_insert: false, service_update: false,
      service_delete: false, service_truncate: false, service_references: false, service_trigger: false,
      auth_start: false, service_start: true, service_record: true, service_resolve: false,
    })
    await asRole('authenticated', async () => {
      await expect(client.query('SELECT * FROM public.adaptive_diagnostic_sessions')).rejects.toMatchObject({ code: '42501' })
      await expect(client.query('SELECT public.start_adaptive_diagnostic($1,$2,$3)', [other, randomUUID(), questions.sayilar.base]))
        .rejects.toMatchObject({ code: '42501' })
    })
    await asRole('service_role', async () => {
      expect((await client.query('SELECT count(*) FROM public.adaptive_diagnostic_sessions')).rows[0].count).toBe('3')
      await expect(client.query(`INSERT INTO public.adaptive_diagnostic_sessions
        (id,user_id,game,exam_ref,taxonomy_version,kind,status,current_question_id,expires_at)
        VALUES($1,$2,'matematik','TYT','ba-tyt-math-v1','initial','active',$3,clock_timestamp()+interval '1 hour')`,
      [randomUUID(), other, questions.sayilar.base])).rejects.toMatchObject({ code: '42501' })
    })
  })
})
