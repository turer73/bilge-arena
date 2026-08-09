import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAssembly } from '../../scripts/roadmap-production-close.mjs'

const url = process.env.ROADMAP_CLOSE_TEST_DATABASE_URL
const disposable = process.env.ROADMAP_CLOSE_TEST_DATABASE_DISPOSABLE === '1'
if (
  url &&
  (
    !disposable ||
    !/^bilge_roadmap_close_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))
  )
) {
  throw new Error('Refusing non-disposable roadmap-close database')
}

const suite = url && disposable ? describe : describe.skip
const here = dirname(fileURLToPath(import.meta.url))
const readDatabase = (path) => readFileSync(join(here, '..', path), 'utf8')
const migration = (name) => readDatabase(join('migrations', name))
const assembly = loadAssembly()

const predecessorMigrations = [
  '016_rbac.sql',
  '016b_fix_rls_recursion.sql',
  '022_batch_increment_question_stats.sql',
  '023_soft_delete_user.sql',
  '055_coin_balance.sql',
  '071_xp_ledger_level_security_fix.sql',
  '081_atomic_complete_game_session.sql',
  '082_single_question_stats_writer.sql',
  '083_wrong_answers_partial_index.sql',
  '084_daily_plan.sql',
  '085_daily_plan_exam_ref.sql',
  '086_outcome_mastery_pilot.sql',
  '087_award_badges_atomic.sql',
  '088_repair_award_badges_concurrency.sql',
  '089_fix_handle_new_user_long_email.sql',
  '090_harden_sensitive_function_execute_grants.sql',
]

suite('roadmap production close PostgreSQL 17 acceptance', () => {
  let client

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url })
    await client.connect()
    await client.query(`
      DROP SCHEMA IF EXISTS public CASCADE;
      DROP SCHEMA IF EXISTS auth CASCADE;
      CREATE SCHEMA public;
      CREATE SCHEMA auth;
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN ALTER ROLE service_role BYPASSRLS; END $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
      CREATE TABLE auth.users (
        id uuid PRIMARY KEY,
        email text,
        raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    `)

    await client.query(readDatabase('full-schema.sql'))
    for (const filename of predecessorMigrations) {
      await client.query(migration(filename))
    }

    for (let index = 0; index < 22; index += 1) {
      await client.query(
        `INSERT INTO public.questions(
          id, external_id, game, category, difficulty, content, source, is_active
        ) VALUES($1,$2,'wordquest','vocabulary',2,$3::jsonb,'original',true)`,
        [
          randomUUID(),
          'roadmap-legacy-' + index,
          JSON.stringify({
            type: 'multiple_choice',
            sentence: 'Legacy sentence ' + index,
            options: ['A', 'B', 'C', 'D', 'E'],
            correct: index === 21 ? 1 : 0,
          }),
        ],
      )
    }

    for (let index = 0; index < 296; index += 1) {
      await client.query(
        `INSERT INTO public.questions(
          id, external_id, game, category, difficulty, content,
          source, exam_ref, is_active
        ) VALUES($1,$2,'fen','biyoloji',2,$3::jsonb,'ai_gemini_tyt','TYT',true)`,
        [
          randomUUID(),
          'roadmap-tyt-' + index,
          JSON.stringify({
            type: 'multiple_choice',
            question: 'TYT biology question ' + index,
            options: ['A', 'B', 'C', 'D', 'E'],
            answer: 0,
          }),
        ],
      )
    }
  }, 60_000)

  afterAll(async () => {
    await client?.end()
  })

  it('rolls back repair and every migration when a transaction preflight fails', async () => {
    await client.query(`
      UPDATE public.questions
      SET exam_ref = 'YKS-TYT'
      WHERE id = (
        SELECT id
        FROM public.questions
        WHERE source = 'ai_gemini_tyt'
        ORDER BY id
        LIMIT 1
      )
    `)

    await client.query('BEGIN')
    await expect(client.query(assembly.sql)).rejects.toMatchObject({ code: '22023' })
    await client.query('ROLLBACK')

    const state = await client.query(`
      SELECT
        to_regclass('public.verified_attempts') IS NOT NULL AS migration_091,
        count(*) FILTER (
          WHERE content->'answer' IS NULL
            AND content->'correct' IS NOT NULL
        )::integer AS legacy_rows
      FROM public.questions
    `)
    expect(state.rows[0]).toEqual({ migration_091: false, legacy_rows: 22 })

    await client.query(`
      UPDATE public.questions
      SET exam_ref = 'TYT'
      WHERE source = 'ai_gemini_tyt'
    `)
  }, 60_000)

  it('applies the full 091-107 assembly atomically and satisfies postconditions', async () => {
    await client.query('BEGIN')
    await client.query(assembly.sql)
    await client.query('COMMIT')

    const stateSql = readFileSync(
      join(here, '..', '..', 'scripts', 'roadmap-production-close-state.sql'),
      'utf8',
    )
    const state = (await client.query(stateSql)).rows[0]

    expect(state).toEqual(expect.objectContaining({
      invalid_total: 0,
      repair_candidates: 0,
      gemini_total: 296,
      gemini_tyt: 296,
      present_count: 17,
      constraint_validated: true,
    }))
    expect(Object.values(state.fingerprints)).toEqual(Array(17).fill(true))

    const repaired = await client.query(`
      SELECT
        count(*)::integer AS repaired,
        count(*) FILTER (
          WHERE content ? 'sentence'
            AND content ? 'correct'
        )::integer AS legacy_preserved
      FROM public.questions
      WHERE source = 'original'
        AND game = 'wordquest'
        AND content->'answer' IS NOT NULL
        AND content->'question' IS NOT NULL
    `)
    expect(repaired.rows[0]).toEqual({ repaired: 22, legacy_preserved: 22 })
  }, 60_000)
})
