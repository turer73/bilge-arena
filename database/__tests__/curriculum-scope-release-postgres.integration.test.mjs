// Opt-in disposable PostgreSQL coverage for 086 -> 096 -> 138 -> 178 -> 179.
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
const migrations = [
  '086_outcome_mastery_pilot.sql',
  '096_curriculum_graph_v1.sql',
  '138_curriculum_outcomes_all_subjects.sql',
  '178_curriculum_scope_release_registry.sql',
  '179_release_tyt_fen_mastery_scope.sql',
].map(migration)
const { Client } = pg

describePg('178-179 curriculum scope release real PostgreSQL', () => {
  let client
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
        exam_ref varchar(20),
        is_active boolean NOT NULL DEFAULT true
      );
      CREATE TABLE public.session_answers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES public.profiles(id),
        question_id uuid NOT NULL REFERENCES public.questions(id),
        is_correct boolean NOT NULL,
        is_skipped boolean,
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
    for (const sql of migrations) await client.query(sql)
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

  it('is replay-safe without downgrading Fen', async () => {
    await client.query(migrations[3])
    await client.query(migrations[4])
    expect((await client.query(`SELECT release_status FROM public.curriculum_scope_releases
      WHERE game='fen' AND display_exam_ref='TYT'`)).rows[0].release_status).toBe('released')
    expect((await client.query(
      `SELECT public.curriculum_scope_integrity('fen','TYT','ba-tyt-fen-v1') AS result`,
    )).rows[0].result).toMatchObject({ total: 4, mapped: 4, unmapped: 0, emptyOutcome: 0 })
  })
})
