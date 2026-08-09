// Opt-in disposable PostgreSQL coverage for 086 -> 091 -> 096 -> 099.
// Requires VERIFIED_ATTEMPTS_TEST_DATABASE_URL=.../bilge_r02_test_* and
// VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE=1. Normal CI intentionally skips it.
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

describePg('099 verified coach flow real PostgreSQL', () => {
  let client
  let secondClient
  const user = randomUUID()
  const other = randomUUID()
  const attempt = randomUUID()
  const original = '10000000-0000-4000-8000-000000000001'
  const transfer = '20000000-0000-4000-8000-000000000001'
  const laterTransfer = '30000000-0000-4000-8000-000000000001'
  let coachSessionId

  const hash = (char) => char.repeat(64)

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
      REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY);
      CREATE TABLE public.questions(
        id uuid PRIMARY KEY, game varchar(20) NOT NULL, category varchar(30) NOT NULL,
        difficulty smallint NOT NULL DEFAULT 3, exam_ref varchar(20), is_active boolean NOT NULL DEFAULT true,
        content jsonb NOT NULL
      );
      CREATE TABLE public.game_sessions(id uuid PRIMARY KEY, user_id uuid REFERENCES public.profiles(id));
      CREATE TABLE public.session_answers(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid REFERENCES public.game_sessions(id),
        user_id uuid NOT NULL REFERENCES public.profiles(id), question_id uuid NOT NULL REFERENCES public.questions(id),
        is_correct boolean NOT NULL, is_skipped boolean, answered_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
    `)
    await client.query('INSERT INTO public.profiles(id) VALUES($1),($2)', [user, other])
    const originalContent = { question: 'Orijinal soru', options: ['0', '1', '2'], answer: 2, solution: 'Orijinal çözüm.' }
    const transferContent = { question: 'Transfer soru', options: ['0', '1', '2'], answer: 1, solution: 'Doğrulanmış transfer çözümü.' }
    const laterContent = { question: 'Sonraki transfer soru', options: ['0', '1'], answer: 0, solution: 'Başka çözüm.' }
    await client.query(`INSERT INTO public.questions(id,game,category,difficulty,exam_ref,is_active,content)
      VALUES($1,'matematik','sayilar',3,'TYT',true,$2),($3,'matematik','sayilar',3,'TYT',true,$4),($5,'matematik','sayilar',3,'TYT',true,$6)`,
    [original, originalContent, transfer, transferContent, laterTransfer, laterContent])
    for (const migration of [
      '086_outcome_mastery_pilot.sql', '091_verified_attempts.sql', '096_curriculum_graph_v1.sql', '099_verified_coach_flow.sql',
    ]) await client.query(read(migration))
    await client.query(`INSERT INTO public.verified_attempts(
      id,user_id,game,mode,question_ids,duration_sec,started_at,expires_at
    ) VALUES($1,$2,'matematik','classic',$3,600,clock_timestamp(),clock_timestamp()+interval '1 hour')`, [attempt, user, [original]])
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

  async function start(connection = client, values = {}) {
    const { attemptId = attempt, userId = user, questionId = original, selectedOption = 0 } = values
    return (await connection.query(
      'SELECT public.start_verified_coach_session($1,$2,$3,$4::smallint) result',
      [attemptId, userId, questionId, selectedOption],
    )).rows[0].result
  }

  async function advance(connection, { stage, requestId, responseText, source, passed = true, policy = 'coach-v1', contentHash }) {
    return (await connection.query(
      'SELECT public.advance_verified_coach_stage($1,$2,$3::smallint,$4,$5,$6,$7,$8,$9) result',
      [coachSessionId, user, stage, requestId, responseText, source, passed, policy, contentHash],
    )).rows[0].result
  }

  async function answer(connection, requestId, selectedOption) {
    return (await connection.query(
      'SELECT public.answer_verified_coach_transfer($1,$2,$3,$4::smallint) result',
      [coachSessionId, user, requestId, selectedOption],
    )).rows[0].result
  }

  it('starts only for the active owner/member MCQ and makes first selection replay-safe', async () => {
    const started = await start()
    coachSessionId = started.sessionId
    expect(started).toMatchObject({ sessionId: expect.any(String), stage: 0, transferQuestionId: null, transferCompleted: false, replayed: false })
    expect(await start()).toMatchObject({ sessionId: coachSessionId, stage: 0, replayed: true })
    await expect(start(client, { selectedOption: 1 })).rejects.toMatchObject({ code: '22023' })
    await expect(start(client, { userId: other })).rejects.toMatchObject({ code: '42501' })
    await expect(start(client, { questionId: transfer })).rejects.toMatchObject({ code: '22023' })
    await expect(start(client, { selectedOption: 3 })).rejects.toMatchObject({ code: '22023' })
    await expect(client.query('UPDATE public.verified_coach_sessions SET initial_selected_option=1 WHERE id=$1', [coachSessionId]))
      .rejects.toMatchObject({ code: '42501' })
  })

  it('serializes stages, preserves exact request replay, and deterministically binds a transfer without answer leakage', async () => {
    await client.query('DROP INDEX IF EXISTS public.idx_question_outcomes_one_primary')
    const otherOutcome = (await client.query("SELECT id FROM public.curriculum_outcomes WHERE code='MAT-DEN-01'")).rows[0].id
    await client.query(`INSERT INTO public.question_outcomes(question_id,outcome_id,weight,is_primary,mapping_source)
      VALUES($1,$2,1,true,'manual')`, [transfer, otherOutcome])
    const stageOneRequest = randomUUID()
    const calls = await Promise.all([
      advance(client, { stage: 1, requestId: stageOneRequest, responseText: 'Önce verilenleri ayır.', source: 'authored', contentHash: hash('a') }),
      advance(secondClient, { stage: 1, requestId: stageOneRequest, responseText: 'Önce verilenleri ayır.', source: 'authored', contentHash: hash('a') }),
    ])
    expect(calls.map((item) => item.replayed).sort()).toEqual([false, true])
    const canonicalStageOne = calls.find((item) => !item.replayed)
    expect(canonicalStageOne?.responseText).toBeTruthy()
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stage: 1, responseText: 'Önce verilenleri ayır.', source: 'authored',
        evaluationPassed: true, policyVersion: 'coach-v1', contentSha256: hash('a'), transferQuestionId: null,
      }),
    ]))
    expect(await advance(client, {
      stage: 1, requestId: stageOneRequest, responseText: 'Different regenerated response.',
      source: 'ai', passed: false, policy: 'coach-v2', contentHash: hash('z'),
    })).toEqual(expect.objectContaining({
      stage: 1, responseText: canonicalStageOne?.responseText, source: 'authored', evaluationPassed: true, policyVersion: 'coach-v1',
      contentSha256: hash('a'), transferQuestionId: null, replayed: true,
    }))
    await expect(advance(client, {
      stage: 2, requestId: stageOneRequest, responseText: 'Same request other stage.',
      source: 'ai', contentHash: hash('z'),
    })).rejects.toMatchObject({ code: '22023' })
    await expect(advance(client, { stage: 3, requestId: randomUUID(), responseText: 'Atlama.', source: 'ai', contentHash: hash('b') }))
      .rejects.toMatchObject({ code: '22023' })
    await advance(client, { stage: 2, requestId: randomUUID(), responseText: 'Bağıntıyı kur.', source: 'ai', contentHash: hash('c') })
    await advance(client, { stage: 3, requestId: randomUUID(), responseText: 'İşlemi kontrol et.', source: 'fallback', contentHash: hash('d') })
    const stageFourRequest = randomUUID()
    const stageFour = await advance(client, { stage: 4, requestId: stageFourRequest, responseText: null, source: 'solution', contentHash: hash('e') })
    expect(stageFour).toEqual({
      stage: 4, responseText: null, source: 'solution', evaluationPassed: true,
      policyVersion: 'coach-v1', contentSha256: hash('e'), transferQuestionId: laterTransfer, replayed: false,
    })
    expect(Object.keys(stageFour)).not.toContain('correctOption')
    expect(await advance(client, { stage: 4, requestId: stageFourRequest, responseText: null, source: 'solution', contentHash: hash('e') }))
      .toEqual({
        stage: 4, responseText: null, source: 'solution', evaluationPassed: true,
        policyVersion: 'coach-v1', contentSha256: hash('e'), transferQuestionId: laterTransfer, replayed: true,
      })
    await expect(advance(client, { stage: 4, requestId: randomUUID(), responseText: 'sızdırma', source: 'solution', contentHash: hash('f') }))
      .rejects.toMatchObject({ code: '22023' })
    expect((await client.query(`SELECT stage,response_text,source FROM public.verified_coach_stage_events
      WHERE session_id=$1 ORDER BY stage`, [coachSessionId])).rows).toEqual([
      { stage: 1, response_text: 'Önce verilenleri ayır.', source: 'authored' },
      { stage: 2, response_text: 'Bağıntıyı kur.', source: 'ai' },
      { stage: 3, response_text: 'İşlemi kontrol et.', source: 'fallback' },
      { stage: 4, response_text: null, source: 'solution' },
    ])
    const multiPrimaryAttempt = randomUUID()
    await client.query(`INSERT INTO public.verified_attempts(
      id,user_id,game,mode,question_ids,duration_sec,started_at,expires_at
    ) VALUES($1,$2,'matematik','classic',$3,600,clock_timestamp(),clock_timestamp()+interval '1 hour')`, [multiPrimaryAttempt, user, [original]])
    try {
      await client.query(`INSERT INTO public.question_outcomes(question_id,outcome_id,weight,is_primary,mapping_source)
        VALUES($1,$2,1,true,'manual')`, [original, otherOutcome])
      await expect(start(client, { attemptId: multiPrimaryAttempt })).rejects.toMatchObject({ code: '22023' })
    } finally {
      await client.query('DELETE FROM public.question_outcomes WHERE question_id=$1 AND outcome_id=$2', [original, otherOutcome])
    }
  })

  it('grades the stage-four transfer once, returns the bounded canonical result, and rejects direct event mutation', async () => {
    const requestId = randomUUID()
    const results = await Promise.all([answer(client, requestId, 0), answer(secondClient, requestId, 0)])
    expect(results.map((item) => item.replayed).sort()).toEqual([false, true])
    expect(results[0]).toMatchObject({
      isCorrect: true, correctOption: 0, solution: expect.any(String),
      coachDepth: 4, transferQuestionId: laterTransfer,
    })
    await expect(answer(client, randomUUID(), 0)).rejects.toMatchObject({ code: '22023' })
    await expect(client.query('UPDATE public.verified_coach_stage_events SET response_text=$2 WHERE session_id=$1 AND stage=1', [coachSessionId, 'değiştir']))
      .rejects.toMatchObject({ code: '42501' })
    await expect(client.query('DELETE FROM public.verified_coach_stage_events WHERE session_id=$1', [coachSessionId]))
      .rejects.toMatchObject({ code: '42501' })
    expect((await client.query(`SELECT transfer_selected_option,transfer_is_correct,transfer_completed_at IS NOT NULL completed
      FROM public.verified_coach_sessions WHERE id=$1`, [coachSessionId])).rows[0])
      .toEqual({ transfer_selected_option: 0, transfer_is_correct: true, completed: true })
  })

  it('rejects expired attempts and keeps private tables/RPCs closed except for service-role execution', async () => {
    const expiredAttempt = randomUUID()
    await client.query(`INSERT INTO public.verified_attempts(
      id,user_id,game,mode,question_ids,duration_sec,started_at,expires_at
    ) VALUES($1,$2,'matematik','classic',$3,60,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour')`, [expiredAttempt, user, [original]])
    await expect(start(client, { attemptId: expiredAttempt })).rejects.toMatchObject({ code: '22023' })

    const acl = await client.query(`SELECT
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.verified_coach_sessions'::regclass) sessions_rls,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.verified_coach_stage_events'::regclass) events_rls,
      has_table_privilege('authenticated','public.verified_coach_sessions','SELECT') auth_sessions_select,
      has_table_privilege('service_role','public.verified_coach_sessions','SELECT') service_sessions_select,
      has_table_privilege('service_role','public.verified_coach_sessions','INSERT') service_sessions_insert,
      has_table_privilege('service_role','public.verified_coach_stage_events','UPDATE') service_events_update,
      has_table_privilege('service_role','public.verified_coach_stage_events','TRIGGER') service_events_trigger,
      has_function_privilege('authenticated','public.start_verified_coach_session(uuid,uuid,uuid,smallint)','EXECUTE') auth_start,
      has_function_privilege('service_role','public.start_verified_coach_session(uuid,uuid,uuid,smallint)','EXECUTE') service_start,
      has_function_privilege('service_role','public.advance_verified_coach_stage(uuid,uuid,smallint,uuid,text,text,boolean,text,text)','EXECUTE') service_advance,
      has_function_privilege('service_role','public.answer_verified_coach_transfer(uuid,uuid,uuid,smallint)','EXECUTE') service_answer,
      has_function_privilege('service_role','public.verified_coach_correct_option(jsonb)','EXECUTE') service_helper`)
    expect(acl.rows[0]).toEqual({
      sessions_rls: true, events_rls: true, auth_sessions_select: false,
      service_sessions_select: false, service_sessions_insert: false, service_events_update: false, service_events_trigger: false,
      auth_start: false, service_start: true, service_advance: true, service_answer: true, service_helper: false,
    })
    await asRole('authenticated', async () => {
      await expect(client.query('SELECT * FROM public.verified_coach_sessions')).rejects.toMatchObject({ code: '42501' })
      await expect(client.query('SELECT public.start_verified_coach_session($1,$2,$3,$4::smallint)', [attempt, user, original, 0]))
        .rejects.toMatchObject({ code: '42501' })
    })
    await asRole('service_role', async () => {
      await expect(client.query('INSERT INTO public.verified_coach_sessions(attempt_id,user_id,question_id,initial_selected_option,expires_at) VALUES($1,$2,$3,0,clock_timestamp()+interval \'1 hour\')', [attempt, user, original]))
        .rejects.toMatchObject({ code: '42501' })
      expect(await start(client)).toMatchObject({ sessionId: coachSessionId, replayed: true })
    })
  })
})
