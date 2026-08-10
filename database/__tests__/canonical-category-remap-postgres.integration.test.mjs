import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const url = process.env.CANONICAL_CATEGORY_TEST_DATABASE_URL
if (url && process.env.CANONICAL_CATEGORY_TEST_DATABASE_DISPOSABLE !== '1') {
  throw new Error('Set CANONICAL_CATEGORY_TEST_DATABASE_DISPOSABLE=1')
}
if (url && !/^bilge_r109_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) {
  throw new Error('Refusing non-disposable canonical-category database')
}

const suite = url && process.env.CANONICAL_CATEGORY_TEST_DATABASE_DISPOSABLE === '1'
  ? describe
  : describe.skip
const migration = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '109_canonical_category_remap.sql'),
  'utf8',
)

suite('109 canonical category disposable PostgreSQL acceptance', () => {
  let client
  let outcomeId
  const seeded = new Map()

  const seedQuestion = async ({
    key,
    game,
    category,
    topic,
    examRef,
    revisionCategory = category,
    revisionExamRef = examRef,
    in108Backup = false,
  }) => {
    const questionId = randomUUID()
    const revisionId = randomUUID()
    const content = {
      question: `${key} fixture question`,
      options: ['A', 'B', 'C', 'D'],
      answer: 1,
      solution: `${key} fixture solution`,
    }
    const contentSha256 = key.padEnd(64, 'a').slice(0, 64).replace(/[^0-9a-f]/g, 'a')

    await client.query(
      `INSERT INTO public.questions(
         id, game, category, topic, difficulty, exam_ref, content, is_active
       ) VALUES($1,$2,$3,$4,2,$5,$6::jsonb,true)`,
      [questionId, game, category, topic, examRef, JSON.stringify(content)],
    )
    await client.query(
      `INSERT INTO public.question_content_revisions(
         id, question_id, revision_no, game, category, topic, difficulty,
         exam_ref, content, content_sha256, change_kind, change_summary,
         status, published_at
       ) VALUES($1,$2,1,$3,$4,$5,2,$6,$7::jsonb,$8,'legacy_import','fixture','published',clock_timestamp())`,
      [revisionId, questionId, game, revisionCategory, topic, revisionExamRef, JSON.stringify(content), contentSha256],
    )
    await client.query(
      'UPDATE public.questions SET published_revision_id=$1 WHERE id=$2',
      [revisionId, questionId],
    )
    await client.query(
      `INSERT INTO public.question_revision_sources(
         revision_id, source_kind, source_title, license_code, attribution, provenance_ref
       ) VALUES($1,'original',$2,'INTERNAL','fixture','fixture:' || $3::text)`,
      [revisionId, `${key} source`, questionId],
    )
    await client.query(
      `INSERT INTO public.question_revision_outcomes(revision_id,outcome_id,weight,is_primary)
       VALUES($1,$2,1,true)`,
      [revisionId, outcomeId],
    )
    if (in108Backup) {
      await client.query(
        `INSERT INTO public._backup_questions_taxonomy_20260810(id,old_exam_ref,old_category)
         VALUES($1,$2,$3)`,
        [questionId, revisionExamRef, revisionCategory],
      )
    }

    const value = { questionId, revisionId, content, contentSha256 }
    seeded.set(key, value)
    return value
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url })
    await client.connect()
    await client.query(`
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO CURRENT_USER;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

      CREATE TABLE public.profiles(id uuid PRIMARY KEY);
      CREATE TABLE public.curriculum_outcomes(id uuid PRIMARY KEY, is_active boolean NOT NULL DEFAULT true);
      CREATE TABLE public.questions(
        id uuid PRIMARY KEY,
        game text NOT NULL,
        category varchar(50),
        subcategory text,
        topic text,
        difficulty smallint NOT NULL,
        level_tag text,
        exam_ref varchar(20),
        is_boss boolean NOT NULL DEFAULT false,
        content jsonb NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        published_revision_id uuid
      );
      CREATE TABLE public.question_content_revisions(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        question_id uuid NOT NULL REFERENCES public.questions(id),
        revision_no integer NOT NULL,
        base_revision_id uuid REFERENCES public.question_content_revisions(id),
        game text NOT NULL,
        category text NOT NULL,
        subcategory text,
        topic text,
        difficulty smallint NOT NULL,
        level_tag text,
        exam_ref text,
        is_boss boolean NOT NULL DEFAULT false,
        content jsonb NOT NULL,
        content_sha256 text NOT NULL,
        change_kind text NOT NULL,
        change_summary text NOT NULL,
        status text NOT NULL,
        prepared_by uuid REFERENCES public.profiles(id),
        prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        published_at timestamptz,
        UNIQUE(question_id,revision_no)
      );
      ALTER TABLE public.questions ADD CONSTRAINT questions_published_revision_id_fkey
        FOREIGN KEY(published_revision_id) REFERENCES public.question_content_revisions(id);
      CREATE TABLE public.question_revision_sources(
        revision_id uuid PRIMARY KEY REFERENCES public.question_content_revisions(id),
        source_kind text NOT NULL,
        source_title text NOT NULL,
        source_url text,
        license_code text NOT NULL,
        license_url text,
        attribution text,
        provenance_ref text,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      CREATE TABLE public.question_revision_outcomes(
        revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id),
        outcome_id uuid NOT NULL REFERENCES public.curriculum_outcomes(id),
        weight numeric(6,3) NOT NULL,
        is_primary boolean NOT NULL DEFAULT false,
        PRIMARY KEY(revision_id,outcome_id)
      );
      CREATE TABLE public.question_governance_events(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        question_id uuid NOT NULL REFERENCES public.questions(id),
        revision_id uuid REFERENCES public.question_content_revisions(id),
        actor_id uuid REFERENCES public.profiles(id),
        event_type text NOT NULL,
        public_reason text,
        private_note text,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      CREATE TABLE public._backup_questions_taxonomy_20260810(
        id uuid PRIMARY KEY,
        old_exam_ref varchar(20),
        old_category varchar(50),
        backed_up_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      CREATE TABLE public.content_governance_runtime(
        singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
        enforce_direct_mutation boolean NOT NULL
      );
      INSERT INTO public.content_governance_runtime(singleton,enforce_direct_mutation) VALUES(true,true);
    `)

    outcomeId = randomUUID()
    await client.query('INSERT INTO public.curriculum_outcomes(id) VALUES($1)', [outcomeId])

    await seedQuestion({ key: 'ayt', game: 'matematik', category: 'cebir', topic: 'Limit', examRef: 'AYT-SAY' })
    await seedQuestion({ key: 'lgs_problem', game: 'matematik', category: 'cebir', topic: 'Oran ve Orantı Problemleri', examRef: 'LGS' })
    await seedQuestion({ key: 'lgs_equation', game: 'matematik', category: 'cebir', topic: 'Denklemler ve Eşitsizlikler', examRef: 'LGS' })
    await seedQuestion({ key: 'data', game: 'matematik', category: 'veri', topic: 'Olasılık', examRef: 'TYT' })
    await seedQuestion({ key: 'history', game: 'sosyal', category: 'inkılap_tarihi', topic: 'Milli Mücadele', examRef: 'LGS' })
    await seedQuestion({
      key: 'citizenship', game: 'sosyal', category: 'vatandaşlık', topic: 'Temel Haklar', examRef: 'TYT',
      revisionExamRef: 'YKS-TYT', in108Backup: true,
    })
    await seedQuestion({
      key: 'geography', game: 'sosyal', category: 'cografya', topic: 'Harita', examRef: 'TYT',
      revisionCategory: 'coğrafya', revisionExamRef: 'YKS-TYT', in108Backup: true,
    })
    await seedQuestion({ key: 'religion', game: 'sosyal', category: 'din_kulturu', topic: 'Ahlak', examRef: 'TYT' })

    await client.query(`
      CREATE FUNCTION public.tg_question_content_direct_mutation_guard()
      RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF COALESCE((SELECT enforce_direct_mutation FROM public.content_governance_runtime WHERE singleton),true)
          AND current_setting('app.content_governance_publish',true) IS DISTINCT FROM 'on'
          AND (NEW.content,NEW.game,NEW.category,NEW.subcategory,NEW.topic,NEW.difficulty,NEW.level_tag,NEW.exam_ref,NEW.is_boss,NEW.is_active,NEW.published_revision_id)
              IS DISTINCT FROM (OLD.content,OLD.game,OLD.category,OLD.subcategory,OLD.topic,OLD.difficulty,OLD.level_tag,OLD.exam_ref,OLD.is_boss,OLD.is_active,OLD.published_revision_id) THEN
          RAISE EXCEPTION 'direct question content or activation mutation is disabled' USING ERRCODE='42501';
        END IF;
        RETURN NEW;
      END $fn$;
      CREATE TRIGGER trg_question_content_direct_mutation_guard
        BEFORE UPDATE ON public.questions FOR EACH ROW
        EXECUTE FUNCTION public.tg_question_content_direct_mutation_guard();
    `)

    await client.query(migration)
  })

  afterAll(async () => {
    await client?.end()
  })

  it('remaps categories and repairs the earlier 108 revision drift atomically', async () => {
    const expected = new Map([
      ['ayt', 'fonksiyonlar'],
      ['lgs_problem', 'problemler'],
      ['lgs_equation', 'denklemler'],
      ['data', 'olasilik'],
      ['history', 'tarih'],
      ['citizenship', 'sosyoloji'],
      ['geography', 'cografya'],
    ])

    for (const [key, category] of expected) {
      const original = seeded.get(key)
      const row = (await client.query(
        `SELECT q.category,q.exam_ref,q.content,q.published_revision_id,
                r.category AS revision_category,r.exam_ref AS revision_exam_ref,
                r.content AS revision_content,r.content_sha256,r.status,
                old.status AS old_status,
                EXISTS(SELECT 1 FROM public.question_revision_sources s WHERE s.revision_id=r.id) AS has_source,
                EXISTS(SELECT 1 FROM public.question_revision_outcomes o WHERE o.revision_id=r.id AND o.is_primary) AS has_primary
         FROM public.questions q
         JOIN public.question_content_revisions r ON r.id=q.published_revision_id
         JOIN public.question_content_revisions old ON old.id=$2
         WHERE q.id=$1`,
        [original.questionId, original.revisionId],
      )).rows[0]

      expect(row).toEqual(expect.objectContaining({
        category,
        revision_category: category,
        revision_exam_ref: row.exam_ref,
        revision_content: original.content,
        content_sha256: original.contentSha256,
        status: 'published',
        old_status: 'superseded',
        has_source: true,
        has_primary: true,
      }))
      expect(row.published_revision_id).not.toBe(original.revisionId)
    }

    const religion = seeded.get('religion')
    expect((await client.query(
      'SELECT category,published_revision_id FROM public.questions WHERE id=$1',
      [religion.questionId],
    )).rows[0]).toEqual({ category: 'din_kulturu', published_revision_id: religion.revisionId })

    expect((await client.query('SELECT count(*)::int AS n FROM public.question_governance_events')).rows[0].n).toBe(7)
    expect((await client.query('SELECT count(*)::int AS n FROM public._backup_questions_taxonomy_109_20260810')).rows[0].n).toBe(7)
  })

  it('keeps the backup private and leaves direct mutation enforcement enabled', async () => {
    const access = (await client.query(`
      SELECT
        has_table_privilege('service_role','public._backup_questions_taxonomy_109_20260810','SELECT') AS service_select,
        (SELECT relrowsecurity FROM pg_class WHERE oid='public._backup_questions_taxonomy_109_20260810'::regclass) AS rls
    `)).rows[0]
    expect(access).toEqual({ service_select: false, rls: true })

    let caught
    try {
      await client.query("UPDATE public.questions SET category='cebir' WHERE id=$1", [seeded.get('ayt').questionId])
    } catch (error) {
      caught = error
    }
    expect(caught).toEqual(expect.objectContaining({ code: '42501' }))
  })

  it('is replay-safe and fails closed on an unknown algebra topic', async () => {
    const before = (await client.query('SELECT count(*)::int AS n FROM public.question_content_revisions')).rows[0].n
    await client.query(migration)
    expect((await client.query('SELECT count(*)::int AS n FROM public.question_content_revisions')).rows[0].n).toBe(before)

    await client.query('BEGIN')
    try {
      await client.query("SET LOCAL app.content_governance_publish='on'")
      await seedQuestion({ key: 'unknown', game: 'matematik', category: 'cebir', topic: 'Tanımsız Konu', examRef: 'LGS' })
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }

    let caught
    try {
      await client.query(migration)
    } catch (error) {
      caught = error
      await client.query('ROLLBACK')
    }
    expect(caught?.message).toMatch(/hala kanonik disi/)
    expect((await client.query('SELECT category FROM public.questions WHERE id=$1', [seeded.get('unknown').questionId])).rows[0].category).toBe('cebir')
    expect((await client.query('SELECT count(*)::int AS n FROM public.question_content_revisions')).rows[0].n).toBe(before + 1)
  })
})
