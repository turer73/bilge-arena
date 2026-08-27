// Opt-in disposable PostgreSQL coverage for 086 -> 091 -> 094 -> 096 -> 097
// -> 138 -> 178 -> historical verified Fen attempt -> 179 -> 180.
// Requires VERIFIED_ATTEMPTS_TEST_DATABASE_URL=.../bilge_r02_test_* and
// VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE=1. Normal CI does not run it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const url = process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_URL
const enabled = Boolean(url && process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE === '1')
if (url && !/^bilge_r02_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) {
  throw new Error('non-disposable database refused')
}
const describePg = enabled ? describe : describe.skip
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const migration = (name) => readFileSync(join(root, name), 'utf8')
const foundationMigrations = [
  '086_outcome_mastery_pilot.sql',
  '091_verified_attempts.sql',
  '094_persistent_fsrs.sql',
  '096_curriculum_graph_v1.sql',
  '097_mastery_evidence_v2.sql',
  '138_curriculum_outcomes_all_subjects.sql',
  '178_curriculum_scope_release_registry.sql',
].map(migration)
const registryMigration = migration('178_curriculum_scope_release_registry.sql')
const fenReleaseMigration = migration('179_release_tyt_fen_mastery_scope.sql')
const fenRepairMigration = migration('180_backfill_released_tyt_fen_mastery_evidence.sql')
const { Client } = pg

describePg('178-180 curriculum scope release real PostgreSQL', () => {
  let client
  let historicalUser
  let historicalAttempt
  let historicalSession
  let historicalAnswers
  let preRepair
  const mathCategories = ['sayilar', 'denklemler', 'fonksiyonlar', 'problemler', 'geometri', 'olasilik']
  const fenCategories = ['fizik', 'kimya', 'biyoloji']
  const questionIds = new Map([...mathCategories, ...fenCategories]
    .map((category) => [category, randomUUID()]))

  beforeAll(async () => {
    client = new Client({ connectionString: url })
    await client.connect()
    await client.query(`
      DROP SCHEMA IF EXISTS auth CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      CREATE SCHEMA auth;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      ALTER ROLE service_role BYPASSRLS;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      CREATE TABLE public.profiles (id uuid PRIMARY KEY);
      CREATE TABLE public.questions (
        id uuid PRIMARY KEY,
        game varchar(20) NOT NULL,
        category varchar(30) NOT NULL,
        difficulty smallint NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
        exam_ref varchar(20),
        is_active boolean NOT NULL DEFAULT true
      );
      CREATE TABLE public.game_sessions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES public.profiles(id),
        client_request_id uuid,
        total_xp integer DEFAULT 0,
        correct_count smallint DEFAULT 0,
        wrong_count smallint DEFAULT 0
      );
      CREATE TABLE public.session_answers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES public.game_sessions(id),
        user_id uuid NOT NULL REFERENCES public.profiles(id),
        question_id uuid NOT NULL REFERENCES public.questions(id),
        is_correct boolean NOT NULL,
        is_skipped boolean,
        time_taken_sec numeric,
        is_fast boolean,
        answered_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
    `)
    for (const category of mathCategories) {
      await client.query(
        `INSERT INTO public.questions(id,game,category,exam_ref,is_active)
         VALUES ($1,'matematik',$2,'TYT',true)`,
        [questionIds.get(category), category],
      )
    }
    for (const category of fenCategories) {
      await client.query(
        `INSERT INTO public.questions(id,game,category,exam_ref,is_active)
         VALUES ($1,'fen',$2,'TYT',true)`,
        [questionIds.get(category), category],
      )
    }
    historicalUser = randomUUID()
    historicalAttempt = randomUUID()
    historicalSession = randomUUID()
    historicalAnswers = fenCategories.map(() => randomUUID())
    await client.query('INSERT INTO public.profiles(id) VALUES($1)', [historicalUser])

    for (const sql of foundationMigrations) await client.query(sql)

    await client.query(
      `INSERT INTO public.game_sessions(id,user_id,client_request_id) VALUES($1,$2,$3)`,
      [historicalSession, historicalUser, randomUUID()],
    )
    await client.query(
      `INSERT INTO public.verified_attempts(
        id,user_id,game,mode,question_ids,duration_sec,expires_at
      ) VALUES($1,$2,'fen','classic',$3,180,clock_timestamp()+interval '1 hour')`,
      [historicalAttempt, historicalUser, fenCategories.map((category) => questionIds.get(category))],
    )
    for (const [index, category] of fenCategories.entries()) {
      await client.query(
        `INSERT INTO public.session_answers(
          id,session_id,user_id,question_id,is_correct,time_taken_sec,is_fast,answered_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()-interval '3 hours')`,
        [historicalAnswers[index], historicalSession, historicalUser, questionIds.get(category), index !== 1, 10 + index, false],
      )
    }
    await client.query(
      `UPDATE public.verified_attempts
       SET completed_at=clock_timestamp()-interval '2 hours',session_id=$2
       WHERE id=$1`,
      [historicalAttempt, historicalSession],
    )
    preRepair = (await client.query(`SELECT
      (SELECT count(*)::integer FROM public.mastery_materialized_attempts WHERE attempt_id=$1) AS markers,
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence WHERE attempt_id=$1) AS evidence`,
    [historicalAttempt])).rows[0]

    await client.query(fenReleaseMigration)
    await client.query(fenRepairMigration)
  })

  afterAll(async () => client?.end())

  async function asRole(role, work) {
    await client.query(`SET ROLE ${role}`)
    try {
      return await work()
    } finally {
      await client.query('RESET ROLE')
    }
  }

  it('releases only proven scopes and keeps incomplete scopes in draft', async () => {
    const rows = (await client.query(`SELECT game,display_exam_ref,question_exam_ref,taxonomy_version,
      release_status,diagnostic_enabled,(released_at IS NOT NULL) AS has_released_at
      FROM public.curriculum_scope_releases ORDER BY game,display_exam_ref`)).rows
    expect(rows).toEqual([
      { game: 'fen', display_exam_ref: 'TYT', question_exam_ref: 'TYT', taxonomy_version: 'ba-tyt-fen-v1', release_status: 'released', diagnostic_enabled: false, has_released_at: true },
      { game: 'matematik', display_exam_ref: 'TYT', question_exam_ref: 'TYT', taxonomy_version: 'ba-tyt-math-v1', release_status: 'released', diagnostic_enabled: true, has_released_at: true },
      { game: 'sosyal', display_exam_ref: 'TYT', question_exam_ref: 'TYT', taxonomy_version: 'ba-tyt-sosyal-v1', release_status: 'draft', diagnostic_enabled: false, has_released_at: false },
      { game: 'turkce', display_exam_ref: 'TYT', question_exam_ref: 'TYT', taxonomy_version: 'ba-tyt-turkce-v1', release_status: 'draft', diagnostic_enabled: false, has_released_at: false },
      { game: 'wordquest', display_exam_ref: 'YDT', question_exam_ref: null, taxonomy_version: 'ba-ydt-eng-v1', release_status: 'draft', diagnostic_enabled: false, has_released_at: false },
    ])
  })

  it('maps the full Fen bank and passes the generic release invariant', async () => {
    const result = (await client.query(
      `SELECT public.curriculum_scope_integrity('fen','TYT','ba-tyt-fen-v1') AS result`,
    )).rows[0].result
    expect(result).toEqual({
      total: 3,
      mapped: 3,
      unmapped: 0,
      scopeMismatch: 0,
      nodeOrphan: 0,
      outcomeOrphan: 0,
      primaryMismatch: 0,
      emptyOutcome: 0,
    })
    const mappings = (await client.query(`SELECT question.category,outcome.code,mapping.mapping_source,mapping.is_primary
      FROM public.questions AS question
      JOIN public.question_outcomes AS mapping ON mapping.question_id=question.id
      JOIN public.curriculum_outcomes AS outcome ON outcome.id=mapping.outcome_id
      WHERE question.game='fen' ORDER BY question.category`)).rows
    expect(mappings).toEqual([
      { category: 'biyoloji', code: 'FEN-BIY-01', mapping_source: 'taxonomy_auto', is_primary: true },
      { category: 'fizik', code: 'FEN-FIZ-01', mapping_source: 'taxonomy_auto', is_primary: true },
      { category: 'kimya', code: 'FEN-KIM-01', mapping_source: 'taxonomy_auto', is_primary: true },
    ])
  })

  it('repairs historical verified Fen evidence once and records the exact scope ledger', async () => {
    expect(preRepair).toEqual({ markers: 1, evidence: 0 })
    const evidence = (await client.query(`SELECT evidence.base_already_recorded,evidence.is_correct,
      outcome.category
      FROM public.mastery_outcome_evidence AS evidence
      JOIN public.curriculum_outcomes AS outcome ON outcome.id=evidence.outcome_id
      WHERE evidence.attempt_id=$1 ORDER BY outcome.category`, [historicalAttempt])).rows
    expect(evidence).toEqual([
      { base_already_recorded: false, is_correct: true, category: 'biyoloji' },
      { base_already_recorded: false, is_correct: true, category: 'fizik' },
      { base_already_recorded: false, is_correct: false, category: 'kimya' },
    ])
    const aggregate = (await client.query(`SELECT
      sum(attempts)::integer AS attempts,
      sum(v2_attempts)::integer AS v2_attempts,
      sum(correct_attempts)::integer AS correct_attempts
      FROM public.user_outcome_state WHERE user_id=$1`, [historicalUser])).rows[0]
    expect(aggregate).toEqual({ attempts: 3, v2_attempts: 3, correct_attempts: 2 })
    expect((await client.query(`SELECT candidate_attempts,candidate_answers,
      candidate_evidence_rows,inserted_evidence_rows,affected_users
      FROM public.curriculum_scope_evidence_repairs
      WHERE game='fen' AND display_exam_ref='TYT' AND taxonomy_version='ba-tyt-fen-v1'`)).rows[0]).toEqual({
      candidate_attempts: 1,
      candidate_answers: 3,
      candidate_evidence_rows: 3,
      inserted_evidence_rows: 3,
      affected_users: 1,
    })

    await client.query(fenRepairMigration)
    expect((await client.query(`SELECT
      count(*)::integer AS evidence,
      (SELECT sum(attempts)::integer FROM public.user_outcome_state WHERE user_id=$1) AS attempts,
      (SELECT sum(v2_attempts)::integer FROM public.user_outcome_state WHERE user_id=$1) AS v2_attempts
      FROM public.mastery_outcome_evidence WHERE attempt_id=$2`, [historicalUser, historicalAttempt])).rows[0]).toEqual({
      evidence: 3,
      attempts: 3,
      v2_attempts: 3,
    })
  })

  it('resolves released scopes, but never exposes draft scopes', async () => {
    const fen = (await client.query(
      `SELECT public.resolve_released_curriculum_scope('fen','tyt') AS scope`,
    )).rows[0].scope
    expect(fen).toEqual({
      game: 'fen',
      displayExamRef: 'TYT',
      questionExamRef: 'TYT',
      taxonomyVersion: 'ba-tyt-fen-v1',
      mappingMode: 'category_proxy',
      diagnosticEnabled: false,
    })
    expect((await client.query(
      `SELECT public.resolve_released_curriculum_scope('turkce','TYT') AS scope`,
    )).rows[0].scope).toBeNull()
  })

  it('maps future released Fen questions, ignores draft scopes, and fails closed on unknown Fen categories', async () => {
    const futureFen = randomUUID()
    const futureTurkish = randomUUID()
    await client.query(`INSERT INTO public.questions(id,game,category,exam_ref,is_active)
      VALUES ($1,'fen','fizik','TYT',true),($2,'turkce','paragraf','TYT',true)`, [futureFen, futureTurkish])
    expect((await client.query(`SELECT outcome.code FROM public.question_outcomes AS mapping
      JOIN public.curriculum_outcomes AS outcome ON outcome.id=mapping.outcome_id
      WHERE mapping.question_id=$1`, [futureFen])).rows).toEqual([{ code: 'FEN-FIZ-01' }])
    expect((await client.query(
      `SELECT count(*)::integer AS count FROM public.question_outcomes WHERE question_id=$1`,
      [futureTurkish],
    )).rows[0].count).toBe(0)
    await expect(client.query(
      `UPDATE public.questions SET category='bilinmeyen' WHERE id=$1`,
      [futureFen],
    )).rejects.toMatchObject({ code: '22023' })
    expect((await client.query(
      `SELECT category FROM public.questions WHERE id=$1`,
      [futureFen],
    )).rows[0].category).toBe('fizik')
  })

  it('keeps registry and direct mutation private while exposing count-only service RPCs', async () => {
    const privileges = (await client.query(`SELECT
      has_table_privilege('authenticated','public.curriculum_scope_releases','SELECT') AS auth_registry,
      has_table_privilege('service_role','public.curriculum_scope_releases','SELECT') AS service_registry,
      has_function_privilege('authenticated','public.resolve_released_curriculum_scope(text,text)','EXECUTE') AS auth_resolve,
      has_function_privilege('service_role','public.resolve_released_curriculum_scope(text,text)','EXECUTE') AS service_resolve,
      has_function_privilege('authenticated','public.curriculum_scope_integrity(text,text,text)','EXECUTE') AS auth_integrity,
      has_function_privilege('service_role','public.curriculum_scope_integrity(text,text,text)','EXECUTE') AS service_integrity,
      has_function_privilege('service_role','public.sync_taxonomy_auto_question_outcomes(uuid,text,text,text,boolean)','EXECUTE') AS service_sync`)).rows[0]
    expect(privileges).toEqual({
      auth_registry: false,
      service_registry: false,
      auth_resolve: false,
      service_resolve: true,
      auth_integrity: false,
      service_integrity: true,
      service_sync: false,
    })
    await asRole('authenticated', async () => {
      await expect(client.query('SELECT * FROM public.curriculum_scope_releases')).rejects.toMatchObject({ code: '42501' })
      await expect(client.query(`SELECT public.resolve_released_curriculum_scope('fen','TYT')`)).rejects.toMatchObject({ code: '42501' })
    })
    await asRole('service_role', async () => {
      expect((await client.query(
        `SELECT public.resolve_released_curriculum_scope('fen','TYT') AS scope`,
      )).rows[0].scope).toMatchObject({ game: 'fen', taxonomyVersion: 'ba-tyt-fen-v1' })
      await expect(client.query('SELECT * FROM public.curriculum_scope_releases')).rejects.toMatchObject({ code: '42501' })
      await expect(client.query(
        `SELECT public.sync_taxonomy_auto_question_outcomes(NULL,NULL,NULL,NULL,false)`,
      )).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('preserves operator retirement and later taxonomy metadata on replay', async () => {
    await client.query(`UPDATE public.curriculum_scope_releases
      SET release_status='retired' WHERE game='matematik' AND display_exam_ref='TYT'`)
    await client.query(`UPDATE public.curriculum_scope_releases
      SET release_status='released',taxonomy_version='ba-tyt-sosyal-v2',released_at=clock_timestamp()
      WHERE game='sosyal' AND display_exam_ref='TYT'`)

    await client.query(registryMigration)
    expect((await client.query(`SELECT release_status,taxonomy_version
      FROM public.curriculum_scope_releases WHERE game='matematik' AND display_exam_ref='TYT'`)).rows[0]).toEqual({
      release_status: 'retired', taxonomy_version: 'ba-tyt-math-v1',
    })
    expect((await client.query(`SELECT release_status,taxonomy_version
      FROM public.curriculum_scope_releases WHERE game='sosyal' AND display_exam_ref='TYT'`)).rows[0]).toEqual({
      release_status: 'released', taxonomy_version: 'ba-tyt-sosyal-v2',
    })

    await client.query(fenReleaseMigration)
    await client.query(fenRepairMigration)
    expect((await client.query(`SELECT release_status FROM public.curriculum_scope_releases
      WHERE game='fen' AND display_exam_ref='TYT'`)).rows[0].release_status).toBe('released')
    expect((await client.query(
      `SELECT public.curriculum_scope_integrity('fen','TYT','ba-tyt-fen-v1') AS result`,
    )).rows[0].result).toMatchObject({ total: 4, mapped: 4, unmapped: 0, emptyOutcome: 0 })
  })
})
