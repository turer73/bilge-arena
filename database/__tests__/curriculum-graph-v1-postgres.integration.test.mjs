// Opt-in disposable PostgreSQL coverage for 086 -> 096.
// Requires VERIFIED_ATTEMPTS_TEST_DATABASE_URL=.../bilge_r02_test_* and
// VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE=1. Normal CI does not run it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const url = process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_URL
const enabled = Boolean(url && process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE === '1')
if (url && !/^bilge_r02_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error('non-disposable database refused')
const describePg = enabled ? describe : describe.skip
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pilotMigration = readFileSync(join(root, 'migrations', '086_outcome_mastery_pilot.sql'), 'utf8')
const migration = readFileSync(join(root, 'migrations', '096_curriculum_graph_v1.sql'), 'utf8')
const { Client } = pg

describePg('096 curriculum graph v1 real PostgreSQL', () => {
  let client
  const questions = Object.fromEntries(['sayilar', 'denklemler', 'fonksiyonlar', 'problemler', 'geometri', 'olasilik']
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
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
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
    await client.query(
      `INSERT INTO public.questions(id,game,category,exam_ref,is_active)
       VALUES ${Object.keys(questions).map((_, index) => `($${index + 1},'matematik',$${index + 7},'TYT',true)`).join(',')}`,
      [...Object.values(questions), ...Object.keys(questions)],
    )
    await client.query(pilotMigration)
    await client.query(migration)
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

  async function integrity() {
    return (await client.query('SELECT public.curriculum_graph_integrity() AS result')).rows[0].result
  }

  it('creates the strict 4-level seed, preserves MAT-SAY-01, and is replay-safe', async () => {
    const counts = await client.query(`SELECT node_type,count(*)::integer AS count
      FROM public.curriculum_nodes WHERE taxonomy_version='ba-tyt-math-v1'
      GROUP BY node_type ORDER BY node_type`)
    expect(counts.rows).toEqual([
      { node_type: 'course', count: 1 },
      { node_type: 'outcome', count: 6 },
      { node_type: 'topic', count: 6 },
      { node_type: 'unit', count: 4 },
    ])
    const matSay = await client.query(`SELECT outcome.node_id,node.node_type,outcome.taxonomy_version
      FROM public.curriculum_outcomes outcome JOIN public.curriculum_nodes node ON node.id=outcome.node_id
      WHERE outcome.code='MAT-SAY-01'`)
    expect(matSay.rows[0]).toEqual({ node_id: expect.any(String), node_type: 'outcome', taxonomy_version: 'ba-tyt-math-v1' })
    await expect(client.query(`INSERT INTO public.curriculum_nodes
      (code,taxonomy_version,game,exam_ref,node_type,parent_id,title)
      VALUES ('bad-unit','ba-tyt-math-v1','fen','TYT','unit',
        (SELECT id FROM public.curriculum_nodes WHERE code='ba-tyt-math-v1:course'),'bad')`)).rejects.toMatchObject({ code: '22023' })
    await expect(client.query(`UPDATE public.curriculum_nodes SET game='fen'
      WHERE code='ba-tyt-math-v1:course'`)).rejects.toMatchObject({ code: '22023' })

    await client.query(migration)
    expect((await client.query(`SELECT count(*) FROM public.curriculum_nodes WHERE taxonomy_version='ba-tyt-math-v1'`)).rows[0].count).toBe('17')
  })

  it('maps every current pilot category while retaining the existing manual primary', async () => {
    const result = await integrity()
    expect(result).toEqual({ total: 6, mapped: 6, unmapped: 0, scopeMismatch: 0, nodeOrphan: 0, outcomeOrphan: 0 })
    const mapped = await client.query(`SELECT q.category, outcome.code, mapping.mapping_source, mapping.is_primary
      FROM public.questions q
      JOIN public.question_outcomes mapping ON mapping.question_id=q.id
      JOIN public.curriculum_outcomes outcome ON outcome.id=mapping.outcome_id
      WHERE q.id = ANY($1::uuid[]) ORDER BY q.category, outcome.code`, [Object.values(questions)])
    expect(mapped.rows).toEqual(expect.arrayContaining([
      { category: 'sayilar', code: 'MAT-SAY-01', mapping_source: 'manual', is_primary: true },
      { category: 'denklemler', code: 'MAT-DEN-01', mapping_source: 'taxonomy_auto', is_primary: true },
      { category: 'fonksiyonlar', code: 'MAT-FON-01', mapping_source: 'taxonomy_auto', is_primary: true },
      { category: 'problemler', code: 'MAT-PRO-01', mapping_source: 'taxonomy_auto', is_primary: true },
      { category: 'geometri', code: 'MAT-GEO-01', mapping_source: 'taxonomy_auto', is_primary: true },
      { category: 'olasilik', code: 'MAT-OLA-01', mapping_source: 'taxonomy_auto', is_primary: true },
    ]))
  })

  it('rebuilds only auto mappings for future scope/category/activation changes and fails closed', async () => {
    const future = randomUUID()
    await client.query(`INSERT INTO public.questions(id,game,category,exam_ref,is_active)
      VALUES ($1,'matematik','geometri','TYT',true)`, [future])
    const outcomeFor = async (questionId) => (await client.query(`SELECT outcome.code,mapping.mapping_source
      FROM public.question_outcomes mapping JOIN public.curriculum_outcomes outcome ON outcome.id=mapping.outcome_id
      WHERE mapping.question_id=$1 ORDER BY outcome.code`, [questionId])).rows
    expect(await outcomeFor(future)).toEqual([{ code: 'MAT-GEO-01', mapping_source: 'taxonomy_auto' }])

    await client.query(`UPDATE public.questions SET category='olasilik' WHERE id=$1`, [future])
    expect(await outcomeFor(future)).toEqual([{ code: 'MAT-OLA-01', mapping_source: 'taxonomy_auto' }])
    await client.query(`UPDATE public.questions SET exam_ref='LGS' WHERE id=$1`, [future])
    expect(await outcomeFor(future)).toEqual([])
    await client.query(`UPDATE public.questions SET exam_ref='TYT', is_active=false WHERE id=$1`, [future])
    expect(await outcomeFor(future)).toEqual([])

    await client.query(`UPDATE public.questions SET category='denklemler' WHERE id=$1`, [questions.sayilar])
    expect(await outcomeFor(questions.sayilar)).toEqual(expect.arrayContaining([
      { code: 'MAT-SAY-01', mapping_source: 'manual' },
      { code: 'MAT-DEN-01', mapping_source: 'taxonomy_auto' },
    ]))
    await client.query(`UPDATE public.questions SET category='sayilar' WHERE id=$1`, [questions.sayilar])
    expect(await outcomeFor(questions.sayilar)).toEqual([{ code: 'MAT-SAY-01', mapping_source: 'manual' }])

    const unsupported = randomUUID()
    await client.query(`INSERT INTO public.questions(id,game,category,exam_ref,is_active)
      VALUES ($1,'matematik','unsupported','TYT',false)`, [unsupported])
    await expect(client.query(`UPDATE public.questions SET is_active=true WHERE id=$1`, [unsupported]))
      .rejects.toMatchObject({ code: '22023' })
    expect((await client.query(`SELECT is_active FROM public.questions WHERE id=$1`, [unsupported])).rows[0].is_active).toBe(false)
    expect(await outcomeFor(unsupported)).toEqual([])
  })

  it('reports count-only integrity telemetry and does not count a wrong-category manual mapping', async () => {
    await client.query(`DELETE FROM public.question_outcomes
      WHERE question_id=$1 AND mapping_source='taxonomy_auto'`, [questions.fonksiyonlar])
    const wrongOutcome = (await client.query(`SELECT id FROM public.curriculum_outcomes WHERE code='MAT-SAY-01'`)).rows[0].id
    await client.query(`INSERT INTO public.question_outcomes(question_id,outcome_id,weight,is_primary,mapping_source)
      VALUES ($1,$2,1,true,'manual')`, [questions.fonksiyonlar, wrongOutcome])
    const result = await integrity()
    expect(result).toMatchObject({ total: 6, mapped: 5, unmapped: 1, scopeMismatch: 1, nodeOrphan: 0, outcomeOrphan: 0 })
    expect(Object.keys(result).sort()).toEqual(['mapped','nodeOrphan','outcomeOrphan','scopeMismatch','total','unmapped'])
  })

  it('keeps graph tables/RPCs private while service_role has only required reads and integrity execute', async () => {
    const catalog = await client.query(`SELECT
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.curriculum_nodes'::regclass) nodes_rls,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.curriculum_outcomes'::regclass) outcomes_rls,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.question_outcomes'::regclass) mappings_rls,
      has_table_privilege('authenticated','public.curriculum_nodes','SELECT') auth_nodes_select,
      has_table_privilege('service_role','public.curriculum_nodes','SELECT') service_nodes_select,
      has_table_privilege('service_role','public.curriculum_nodes','INSERT') service_nodes_insert,
      has_table_privilege('service_role','public.question_outcomes','UPDATE') service_mapping_update,
      has_function_privilege('authenticated','public.curriculum_graph_integrity()','EXECUTE') auth_integrity,
      has_function_privilege('service_role','public.curriculum_graph_integrity()','EXECUTE') service_integrity,
      has_function_privilege('service_role','public.sync_taxonomy_auto_question_outcomes(uuid,text,text,text,boolean)','EXECUTE') service_sync`)
    expect(catalog.rows[0]).toEqual({
      nodes_rls: true, outcomes_rls: true, mappings_rls: true,
      auth_nodes_select: false, service_nodes_select: true, service_nodes_insert: false,
      service_mapping_update: false, auth_integrity: false, service_integrity: true, service_sync: false,
    })
    await asRole('authenticated', async () => {
      await expect(client.query('SELECT * FROM public.curriculum_nodes')).rejects.toMatchObject({ code: '42501' })
      await expect(client.query('SELECT public.curriculum_graph_integrity()')).rejects.toMatchObject({ code: '42501' })
    })
    await asRole('service_role', async () => {
      expect((await client.query('SELECT public.curriculum_graph_integrity()')).rows[0].curriculum_graph_integrity).toMatchObject({ total: 6 })
      await expect(client.query(`INSERT INTO public.curriculum_nodes(code,taxonomy_version,game,node_type,title)
        VALUES ('not-allowed','x','fen','course','no')`)).rejects.toMatchObject({ code: '42501' })
      await expect(client.query(`SELECT public.sync_taxonomy_auto_question_outcomes(NULL,NULL,NULL,NULL,false)`)).rejects.toMatchObject({ code: '42501' })
    })
  })
})
