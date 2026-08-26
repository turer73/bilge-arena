// Opt-in disposable PostgreSQL acceptance for migration 166.
// Standalone: OUTCOME_CANDIDATES_TEST_DATABASE_URL=.../bilge_r166_test_* and
// OUTCOME_CANDIDATES_TEST_DATABASE_DISPOSABLE=1. CI reuses the already
// disposable bilge_r43_test_* database sequentially, never in parallel.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const hasDedicatedDatabase = Boolean(process.env.OUTCOME_CANDIDATES_TEST_DATABASE_URL)
const url = process.env.OUTCOME_CANDIDATES_TEST_DATABASE_URL
  ?? process.env.CONTENT_GOVERNANCE_TEST_DATABASE_URL
const disposable = hasDedicatedDatabase
  ? process.env.OUTCOME_CANDIDATES_TEST_DATABASE_DISPOSABLE
  : process.env.CONTENT_GOVERNANCE_TEST_DATABASE_DISPOSABLE
if (url && disposable !== '1') {
  throw new Error('Explicit disposable database flag required')
}
const allowedDatabase = hasDedicatedDatabase
  ? /^bilge_r166_test_[a-z0-9_]+$/i
  : /^bilge_r43_test_[a-z0-9_]+$/i
if (url && !allowedDatabase.test(new URL(url).pathname.slice(1))) {
  throw new Error('Refusing non-disposable outcome-candidate database')
}
const suite = url && disposable === '1'
  ? describe
  : describe.skip
const migration = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '166_question_outcome_mapping_candidates.sql'),
  'utf8',
)
suite('166 question outcome candidate queue disposable PostgreSQL acceptance', () => {
  let client
  let actor
  let reviewer1
  let reviewer2
  let learner
  let exactQuestion
  let staleQuestion
  let gapQuestion
  let ambiguousQuestion
  let mappedQuestion
  let partialQuestion
  let integrityQuestion
  let exactDraft
  let staleDraft
  let partialDraft
  let exactOutcome
  const published = new Map()

  const rpc = async (call, values = []) => {
    await client.query("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ role: 'service_role' }),
    ])
    await client.query('SET ROLE service_role')
    try {
      return (await client.query(`SELECT ${call} AS result`, values)).rows[0].result
    } finally {
      await client.query('RESET ROLE')
    }
  }
  const userRpc = async (userId, call, values = [], aal = 'aal2') => {
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [
      userId, JSON.stringify({ sub: userId, role: 'authenticated', aal }),
    ])
    await client.query('SET ROLE authenticated')
    try {
      return (await client.query(`SELECT ${call} AS result`, values)).rows[0].result
    } finally {
      await client.query('RESET ROLE')
    }
  }
  const err = async (work, code) => {
    let caught
    try { await work() } catch (error) { caught = error }
    expect({ code: caught?.code, message: caught?.message }).toEqual(expect.objectContaining({ code }))
  }
  const addPermission = async (userId, permission, suffix) => {
    const roleId = randomUUID()
    await client.query(
      'INSERT INTO public.roles(id,slug) VALUES($1,$2)',
      [roleId, `${permission}-${suffix}`],
    )
    await client.query('INSERT INTO public.role_permissions(role_id,permission) VALUES($1,$2)', [roleId, permission])
    await client.query('INSERT INTO public.user_roles(user_id,role_id) VALUES($1,$2)', [userId, roleId])
  }
  const addQuestion = async ({ id, game, category, examRef, content, validHash = true }) => {
    const revisionId = randomUUID()
    await client.query(
      `INSERT INTO public.questions(id,game,category,exam_ref,content,is_active)
       VALUES($1,$2,$3,$4,$5::jsonb,true)`,
      [id, game, category, examRef, JSON.stringify(content)],
    )
    await client.query(
      `INSERT INTO public.question_content_revisions
       (id,question_id,game,category,exam_ref,content_sha256,status)
       SELECT $1,question.id,$3,$4,$5,
         CASE WHEN $6 THEN encode(extensions.digest(question.content::text,'sha256'),'hex')
           ELSE repeat('0',64) END,
         'published'
       FROM public.questions question WHERE question.id=$2`,
      [revisionId, id, game, category, examRef, validHash],
    )
    await client.query('UPDATE public.questions SET published_revision_id=$2 WHERE id=$1', [id, revisionId])
    published.set(id, revisionId)
    return revisionId
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url })
    await client.connect()
    await client.query(`
      DROP SCHEMA IF EXISTS auth CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA auth;
      CREATE SCHEMA public;
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb
      $$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(COALESCE(
          NULLIF(current_setting('request.jwt.claim.sub',true),''),auth.jwt()->>'sub'
        ),'')::uuid
      $$;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY);
      CREATE TABLE public.roles(id uuid PRIMARY KEY,slug text UNIQUE NOT NULL);
      CREATE TABLE public.role_permissions(role_id uuid REFERENCES public.roles(id),permission text NOT NULL);
      CREATE TABLE public.user_roles(user_id uuid REFERENCES public.profiles(id),role_id uuid REFERENCES public.roles(id));
      CREATE FUNCTION public.has_permission(p_user_id uuid,p_permission text)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
        SELECT EXISTS(
          SELECT 1 FROM public.user_roles ur
          JOIN public.role_permissions rp ON rp.role_id=ur.role_id
          WHERE ur.user_id=p_user_id AND rp.permission=p_permission
        )
      $$;
      CREATE TABLE public.curriculum_outcomes(
        id uuid PRIMARY KEY,code text,title text,game text,category text,exam_ref text,
        taxonomy_version text,is_active boolean NOT NULL DEFAULT true
      );
      CREATE TABLE public.curriculum_nodes(id uuid PRIMARY KEY);
      CREATE TABLE public.questions(
        id uuid PRIMARY KEY,game text NOT NULL,category text NOT NULL,exam_ref text,
        content jsonb NOT NULL,is_active boolean NOT NULL DEFAULT true,published_revision_id uuid
      );
      CREATE TABLE public.question_content_revisions(
        id uuid PRIMARY KEY,question_id uuid NOT NULL REFERENCES public.questions(id),
        base_revision_id uuid,game text NOT NULL,category text NOT NULL,exam_ref text,
        content_sha256 text NOT NULL,status text NOT NULL,prepared_by uuid REFERENCES public.profiles(id),
        outcomes_prepared_by uuid REFERENCES public.profiles(id)
      );
      ALTER TABLE public.question_content_revisions
        ADD CONSTRAINT fixture_revision_base_fk FOREIGN KEY(base_revision_id)
        REFERENCES public.question_content_revisions(id);
      ALTER TABLE public.questions
        ADD CONSTRAINT fixture_published_revision_fk FOREIGN KEY(published_revision_id)
        REFERENCES public.question_content_revisions(id);
      CREATE TABLE public.question_outcomes(
        question_id uuid REFERENCES public.questions(id),outcome_id uuid REFERENCES public.curriculum_outcomes(id),
        weight numeric NOT NULL DEFAULT 1,is_primary boolean NOT NULL DEFAULT true,
        PRIMARY KEY(question_id,outcome_id)
      );
      CREATE TABLE public.question_revision_outcomes(
        revision_id uuid REFERENCES public.question_content_revisions(id),
        outcome_id uuid REFERENCES public.curriculum_outcomes(id),weight numeric NOT NULL,is_primary boolean NOT NULL,
        PRIMARY KEY(revision_id,outcome_id)
      );
      CREATE TABLE public.question_revision_approvals(
        revision_id uuid REFERENCES public.question_content_revisions(id),stage smallint,
        reviewer_id uuid REFERENCES public.profiles(id),decision text,rationale text,
        PRIMARY KEY(revision_id,stage)
      );
      CREATE TABLE public.content_governance_requests(
        user_id uuid REFERENCES public.profiles(id),operation text,request_id uuid,
        payload_hash text,result jsonb,created_at timestamptz,
        PRIMARY KEY(user_id,operation,request_id)
      );
      CREATE FUNCTION public.content_governance_hash(p_payload jsonb)
      RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
        SELECT encode(extensions.digest(COALESCE(p_payload,'null'::jsonb)::text,'sha256'),'hex')
      $$;
      CREATE FUNCTION public.content_governance_lock_request(p_user_id uuid,p_operation text,p_request_id uuid)
      RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
        SELECT pg_advisory_xact_lock(hashtextextended(
          'fixture:'||p_user_id::text||':'||p_operation||':'||p_request_id::text,166
        ))
      $$;
      CREATE FUNCTION public.content_governance_has_permission(p_user_id uuid,p_permission text)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
        SELECT p_user_id IS NOT NULL AND public.has_permission(p_user_id,p_permission)
      $$;
      CREATE FUNCTION public.curriculum_outcome_scope_valid(
        p_outcome_id uuid,p_game text,p_category text,p_exam_ref text
      ) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
        SELECT COALESCE((SELECT outcome.is_active
          AND outcome.game IS NOT DISTINCT FROM p_game
          AND outcome.category IS NOT DISTINCT FROM p_category
          AND outcome.exam_ref IS NOT DISTINCT FROM p_exam_ref
          FROM public.curriculum_outcomes outcome WHERE outcome.id=p_outcome_id),false)
      $$;
      CREATE FUNCTION public.set_question_revision_outcomes(
        p_user_id uuid,p_revision_id uuid,p_outcomes jsonb,p_request_id uuid
      ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
      DECLARE revision public.question_content_revisions%ROWTYPE;
      BEGIN
        IF NOT public.content_governance_has_permission(p_user_id,'content.prepare') THEN
          RAISE EXCEPTION 'prepare permission required' USING ERRCODE='42501';
        END IF;
        SELECT * INTO revision FROM public.question_content_revisions WHERE id=p_revision_id FOR UPDATE;
        IF NOT FOUND OR revision.status NOT IN ('draft','stage1_approved') THEN
          RAISE EXCEPTION 'draft required' USING ERRCODE='22023';
        END IF;
        DELETE FROM public.question_revision_outcomes WHERE revision_id=p_revision_id;
        INSERT INTO public.question_revision_outcomes(revision_id,outcome_id,weight,is_primary)
        SELECT p_revision_id,(item->>'outcomeId')::uuid,(item->>'weight')::numeric,(item->>'primary')::boolean
        FROM jsonb_array_elements(p_outcomes) item;
        IF EXISTS(
          SELECT 1 FROM public.question_revision_outcomes mapping
          WHERE mapping.revision_id=p_revision_id
            AND NOT public.curriculum_outcome_scope_valid(
              mapping.outcome_id,revision.game,revision.category,revision.exam_ref
            )
        ) THEN RAISE EXCEPTION 'scope mismatch' USING ERRCODE='22023'; END IF;
        UPDATE public.question_content_revisions SET outcomes_prepared_by=p_user_id WHERE id=p_revision_id;
        RETURN jsonb_build_object('status','draft','mappingChanged',true,'replayed',false);
      END $$;
      CREATE FUNCTION public.review_question_content_revision(
        p_user_id uuid,p_revision_id uuid,p_stage smallint,p_decision text,p_rationale text
      ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
      DECLARE revision public.question_content_revisions%ROWTYPE; prior public.question_revision_approvals%ROWTYPE;
      BEGIN
        IF NOT public.has_permission(p_user_id,CASE WHEN p_stage=1 THEN 'content.review.stage1' ELSE 'content.review.stage2' END) THEN
          RAISE EXCEPTION 'review permission required' USING ERRCODE='42501';
        END IF;
        SELECT * INTO revision FROM public.question_content_revisions WHERE id=p_revision_id FOR UPDATE;
        IF NOT FOUND OR revision.prepared_by=p_user_id OR revision.outcomes_prepared_by=p_user_id THEN
          RAISE EXCEPTION 'revision is not independently reviewable' USING ERRCODE='22023';
        END IF;
        IF p_stage=2 THEN
          SELECT * INTO prior FROM public.question_revision_approvals WHERE revision_id=p_revision_id AND stage=1;
          IF NOT FOUND OR prior.decision<>'approved' OR prior.reviewer_id=p_user_id THEN
            RAISE EXCEPTION 'independent stage one required' USING ERRCODE='22023';
          END IF;
        END IF;
        INSERT INTO public.question_revision_approvals VALUES(p_revision_id,p_stage,p_user_id,p_decision,p_rationale);
        UPDATE public.question_content_revisions SET status=CASE WHEN p_stage=1 THEN 'stage1_approved' ELSE 'stage2_approved' END
        WHERE id=p_revision_id;
        RETURN jsonb_build_object('stage',p_stage,'decision',p_decision);
      END $$;
    `)

    ;[actor, reviewer1, reviewer2, learner, exactQuestion, staleQuestion, gapQuestion,
      ambiguousQuestion, mappedQuestion, partialQuestion, integrityQuestion, exactOutcome] = Array.from({ length: 12 }, randomUUID)
    await client.query('INSERT INTO public.profiles(id) SELECT unnest($1::uuid[])', [[actor, reviewer1, reviewer2, learner]])
    await addPermission(actor, 'content.prepare', 'actor')
    await addPermission(actor, 'content.review.stage1', 'actor-review')
    await addPermission(reviewer1, 'content.review.stage1', 'reviewer1')
    await addPermission(reviewer2, 'content.review.stage2', 'reviewer2')

    const ambiguousOutcomes = [randomUUID(), randomUUID()]
    const mappedOutcome = randomUUID()
    await client.query(
      `INSERT INTO public.curriculum_outcomes
       (id,code,title,game,category,exam_ref,taxonomy_version,is_active) VALUES
       ($1,'MAT-SAY-01','Sayılar','matematik','sayilar','TYT','fixture-v1',true),
       ($2,'FEN-FIZ-01','Fizik 1','fen','fizik','TYT','fixture-v1',true),
       ($3,'FEN-FIZ-02','Fizik 2','fen','fizik','TYT','fixture-v1',true),
       ($4,'SOS-TAR-01','Tarih','sosyal','tarih','TYT','fixture-v1',true)`,
      [exactOutcome, ...ambiguousOutcomes, mappedOutcome],
    )
    const baseContent = { question: 'fixture', options: ['a', 'b'], answer: 0 }
    await addQuestion({ id: exactQuestion, game: 'matematik', category: 'sayilar', examRef: 'TYT', content: baseContent })
    await addQuestion({ id: staleQuestion, game: 'matematik', category: 'sayilar', examRef: 'TYT', content: { ...baseContent, question: 'stale' } })
    await addQuestion({ id: gapQuestion, game: 'turkce', category: 'paragraf', examRef: 'LGS', content: { ...baseContent, question: 'gap' } })
    await addQuestion({ id: ambiguousQuestion, game: 'fen', category: 'fizik', examRef: 'TYT', content: { ...baseContent, question: 'ambiguous' } })
    await addQuestion({ id: mappedQuestion, game: 'sosyal', category: 'tarih', examRef: 'TYT', content: { ...baseContent, question: 'mapped' } })
    await addQuestion({ id: partialQuestion, game: 'matematik', category: 'sayilar', examRef: 'TYT', content: { ...baseContent, question: 'partial' } })
    await addQuestion({ id: integrityQuestion, game: 'turkce', category: 'paragraf', examRef: 'LGS', content: { ...baseContent, question: 'integrity' }, validHash: false })
    await client.query(
      'INSERT INTO public.question_outcomes(question_id,outcome_id) VALUES($1,$2)',
      [mappedQuestion, mappedOutcome],
    )
    await client.query(
      `INSERT INTO public.question_outcomes(question_id,outcome_id,is_primary)
       VALUES($1,$2,false)`,
      [partialQuestion, exactOutcome],
    )
    exactDraft = randomUUID()
    staleDraft = randomUUID()
    partialDraft = randomUUID()
    await client.query(
      `INSERT INTO public.question_content_revisions
       (id,question_id,base_revision_id,game,category,exam_ref,content_sha256,status,prepared_by) VALUES
       ($1,$2,$3,'matematik','sayilar','TYT',$4,'draft',$5),
       ($6,$7,$8,'matematik','sayilar','TYT',$9,'draft',$5)`,
      [exactDraft, exactQuestion, published.get(exactQuestion), '1'.repeat(64), actor,
        staleDraft, staleQuestion, published.get(staleQuestion), '2'.repeat(64)],
    )
    await client.query(
      `INSERT INTO public.question_content_revisions
       (id,question_id,base_revision_id,game,category,exam_ref,content_sha256,status,prepared_by)
       VALUES($1,$2,$3,'matematik','sayilar','TYT',$4,'draft',$5)`,
      [partialDraft, partialQuestion, published.get(partialQuestion), '3'.repeat(64), actor],
    )
    await client.query(migration)
  })

  afterAll(async () => { await client?.end() })

  it('classifies exact, catalog-gap and ambiguous debt without touching active mappings', async () => {
    const summary = await rpc('public.get_question_outcome_mapping_candidate_summary($1)', [actor])
    expect(summary).toEqual(expect.objectContaining({
      activeQuestions: 7, validMapped: 1, activeUnmapped: 6, queueEligible: 5,
      integrityGap: 1, exactCandidate: 3, catalogGap: 1, ambiguous: 1,
      pendingTotal: 0,
    }))
    const activeBefore = Number((await client.query('SELECT count(*) FROM public.question_outcomes')).rows[0].count)
    const requestId = randomUUID()
    const first = await rpc('public.enqueue_question_outcome_mapping_candidates($1,$2)', [actor, requestId])
    expect(first).toEqual(expect.objectContaining({
      inserted: 5, staled: 0, pendingExact: 3, pendingCatalogGap: 1,
      pendingAmbiguous: 1, replayed: false,
    }))
    expect(await rpc('public.enqueue_question_outcome_mapping_candidates($1,$2)', [actor, requestId]))
      .toEqual(expect.objectContaining({ inserted: 5, replayed: true }))
    expect(await rpc('public.enqueue_question_outcome_mapping_candidates($1,$2)', [actor, randomUUID()]))
      .toEqual(expect.objectContaining({ inserted: 0, staled: 0, pendingTotal: 5, replayed: false }))
    expect(Number((await client.query('SELECT count(*) FROM public.question_outcomes')).rows[0].count)).toBe(activeBefore)
    expect(Number((await client.query(
      "SELECT count(*) FROM public.question_outcome_mapping_candidate_events WHERE event_type='generated'",
    )).rows[0].count)).toBe(5)
  })

  it('keeps tables and content-bearing internals inaccessible and enforces AAL2 defensively', async () => {
    const privileges = (await client.query(`SELECT
      has_table_privilege('authenticated','public.question_outcome_mapping_candidates','SELECT') AS auth_read,
      has_table_privilege('service_role','public.question_outcome_mapping_candidates','SELECT') AS service_read,
      has_function_privilege('authenticated','public.enqueue_question_outcome_mapping_candidates(uuid,uuid)','EXECUTE') AS auth_enqueue,
      has_function_privilege('service_role','public.enqueue_question_outcome_mapping_candidates(uuid,uuid)','EXECUTE') AS service_enqueue,
      has_function_privilege('authenticated','public.transfer_question_outcome_mapping_candidate(uuid,uuid,uuid,text,uuid)','EXECUTE') AS auth_transfer,
      has_function_privilege('service_role','public.transfer_question_outcome_mapping_candidate(uuid,uuid,uuid,text,uuid)','EXECUTE') AS service_transfer,
      has_function_privilege('authenticated','public.question_outcome_mapping_candidate_snapshot()','EXECUTE') AS auth_snapshot
    `)).rows[0]
    expect(privileges).toEqual({
      auth_read: false, service_read: false, auth_enqueue: false, service_enqueue: true,
      auth_transfer: true, service_transfer: false, auth_snapshot: false,
    })
    for (const aal of ['aal1', 'aal2']) {
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [
        actor, JSON.stringify({ sub: actor, role: 'authenticated', aal }),
      ])
      await client.query('SET ROLE authenticated')
      await err(() => client.query('SELECT public.enqueue_question_outcome_mapping_candidates($1,$2)', [actor, randomUUID()]), '42501')
      await err(() => client.query('SELECT * FROM public.question_outcome_mapping_candidates'), '42501')
      await client.query('RESET ROLE')
    }
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [
      actor, JSON.stringify({ sub: actor, role: 'authenticated', aal: 'aal1' }),
    ])
    expect((await client.query('SELECT public.question_outcome_mapping_actor_has_aal2($1) AS allowed', [actor])).rows[0].allowed).toBe(false)
    await client.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: actor, role: 'authenticated', aal: 'aal2' })])
    expect((await client.query('SELECT public.question_outcome_mapping_actor_has_aal2($1) AS allowed', [actor])).rows[0].allowed).toBe(true)

    const list = await userRpc(actor,
      'public.list_question_outcome_mapping_candidates($1,$2,$3,$4,$5)',
      [actor, 'pending', null, 100, 0],
    )
    expect(list.total).toBe(5)
    for (const forbidden of ['content', 'contentSha256', 'answer', 'solution', 'explanation', 'hint']) {
      expect(Object.keys(list.items[0])).not.toContain(forbidden)
    }
  })

  it('transfers only fresh exact evidence into an empty draft and preserves independent review', async () => {
    const candidate = (await client.query(
      `SELECT id FROM public.question_outcome_mapping_candidates
       WHERE question_id=$1 AND status='pending'`,
      [exactQuestion],
    )).rows[0]
    const activeBefore = Number((await client.query('SELECT count(*) FROM public.question_outcomes')).rows[0].count)
    await err(() => userRpc(learner,
      'public.transfer_question_outcome_mapping_candidate($1,$2,$3,$4,$5)',
      [learner, candidate.id, exactDraft, 'Bu eşleme kapsam ve soru amacıyla doğrulandı.', randomUUID()],
    ), '42501')
    await err(() => userRpc(actor,
      'public.transfer_question_outcome_mapping_candidate($1,$2,$3,$4,$5)',
      [actor, candidate.id, exactDraft, 'Bu eşleme kapsam ve soru amacıyla doğrulandı.', randomUUID()],
      'aal1',
    ), '42501')
    const requestId = randomUUID()
    const transferred = await userRpc(actor,
      'public.transfer_question_outcome_mapping_candidate($1,$2,$3,$4,$5)',
      [actor, candidate.id, exactDraft, 'Bu eşleme kapsam ve soru amacıyla doğrulandı.', requestId],
    )
    expect(transferred).toEqual(expect.objectContaining({ status: 'transferred', replayed: false }))
    expect(await userRpc(actor,
      'public.transfer_question_outcome_mapping_candidate($1,$2,$3,$4,$5)',
      [actor, candidate.id, exactDraft, 'Bu eşleme kapsam ve soru amacıyla doğrulandı.', requestId],
    )).toEqual(expect.objectContaining({ status: 'transferred', replayed: true }))
    expect((await client.query(
      `SELECT revision.outcomes_prepared_by,mapping.outcome_id
       FROM public.question_content_revisions revision
       JOIN public.question_revision_outcomes mapping ON mapping.revision_id=revision.id
       WHERE revision.id=$1`,
      [exactDraft],
    )).rows[0]).toEqual({ outcomes_prepared_by: actor, outcome_id: exactOutcome })
    expect(Number((await client.query('SELECT count(*) FROM public.question_outcomes')).rows[0].count)).toBe(activeBefore)

    await err(() => rpc(
      'public.review_question_content_revision($1,$2,1,$3,$4)',
      [actor, exactDraft, 'approved', 'Kendi outcome kanıtını review edemez.'],
    ), '22023')
    expect(await rpc(
      'public.review_question_content_revision($1,$2,1,$3,$4)',
      [reviewer1, exactDraft, 'approved', 'Bağımsız akademik birinci inceleme.'],
    )).toEqual({ stage: 1, decision: 'approved' })
    expect(await rpc(
      'public.review_question_content_revision($1,$2,2,$3,$4)',
      [reviewer2, exactDraft, 'approved', 'Bağımsız akademik ikinci inceleme.'],
    )).toEqual({ stage: 2, decision: 'approved' })
  })

  it('fails closed on stale evidence, safely reopens returning/rejected work, and audits rejection', async () => {
    const staleCandidate = (await client.query(
      `SELECT id FROM public.question_outcome_mapping_candidates
       WHERE question_id=$1 AND status='pending'`,
      [staleQuestion],
    )).rows[0]
    const changed = { question: 'stale changed', options: ['a', 'b'], answer: 0 }
    await client.query('UPDATE public.questions SET content=$2::jsonb WHERE id=$1', [staleQuestion, JSON.stringify(changed)])
    await client.query(
      `UPDATE public.question_content_revisions revision
       SET content_sha256=(
         SELECT encode(extensions.digest(question.content::text,'sha256'),'hex')
         FROM public.questions question WHERE question.id=$2
       ) WHERE revision.id=$1`,
      [published.get(staleQuestion), staleQuestion],
    )
    await err(() => userRpc(actor,
      'public.transfer_question_outcome_mapping_candidate($1,$2,$3,$4,$5)',
      [actor, staleCandidate.id, staleDraft, 'Eski snapshot aktarılmamalıdır.', randomUUID()],
    ), '22023')
    const refreshed = await rpc('public.enqueue_question_outcome_mapping_candidates($1,$2)', [actor, randomUUID()])
    expect(refreshed).toEqual(expect.objectContaining({ inserted: 1, staled: 1 }))
    expect((await client.query(
      'SELECT status FROM public.question_outcome_mapping_candidates WHERE id=$1',
      [staleCandidate.id],
    )).rows[0].status).toBe('stale')

    const original = { question: 'stale', options: ['a', 'b'], answer: 0 }
    await client.query('UPDATE public.questions SET content=$2::jsonb WHERE id=$1', [staleQuestion, JSON.stringify(original)])
    await client.query(
      `UPDATE public.question_content_revisions revision
       SET content_sha256=(
         SELECT encode(extensions.digest(question.content::text,'sha256'),'hex')
         FROM public.questions question WHERE question.id=$2
       ) WHERE revision.id=$1`,
      [published.get(staleQuestion), staleQuestion],
    )
    const reverted = await rpc('public.enqueue_question_outcome_mapping_candidates($1,$2)', [actor, randomUUID()])
    expect(reverted).toEqual(expect.objectContaining({ inserted: 0, staled: 1, reopened: 1 }))
    expect((await client.query(
      'SELECT status FROM public.question_outcome_mapping_candidates WHERE id=$1',
      [staleCandidate.id],
    )).rows[0].status).toBe('pending')

    const partialCandidate = (await client.query(
      `SELECT id FROM public.question_outcome_mapping_candidates
       WHERE question_id=$1 AND status='pending'`,
      [partialQuestion],
    )).rows[0]
    await userRpc(actor,
      'public.transfer_question_outcome_mapping_candidate($1,$2,$3,$4,$5)',
      [actor, partialCandidate.id, partialDraft, 'Partial mapping insan incelemesine taşındı.', randomUUID()],
    )
    await client.query(
      "UPDATE public.question_content_revisions SET status='rejected' WHERE id=$1",
      [partialDraft],
    )
    const reopenedRejected = await rpc(
      'public.enqueue_question_outcome_mapping_candidates($1,$2)',
      [actor, randomUUID()],
    )
    expect(reopenedRejected).toEqual(expect.objectContaining({ inserted: 0, staled: 0, reopened: 1 }))
    expect((await client.query(
      'SELECT status FROM public.question_outcome_mapping_candidates WHERE id=$1',
      [partialCandidate.id],
    )).rows[0].status).toBe('pending')

    const gapCandidate = (await client.query(
      `SELECT id FROM public.question_outcome_mapping_candidates
       WHERE question_id=$1 AND status='pending'`,
      [gapQuestion],
    )).rows[0]
    const rejectRequest = randomUUID()
    expect(await userRpc(actor,
      'public.reject_question_outcome_mapping_candidate($1,$2,$3,$4)',
      [actor, gapCandidate.id, 'Katalogda resmi kazanım açılmadan eşleme yapılmayacak.', rejectRequest],
    )).toEqual(expect.objectContaining({ status: 'rejected', replayed: false }))
    expect(await userRpc(actor,
      'public.reject_question_outcome_mapping_candidate($1,$2,$3,$4)',
      [actor, gapCandidate.id, 'Katalogda resmi kazanım açılmadan eşleme yapılmayacak.', rejectRequest],
    )).toEqual(expect.objectContaining({ status: 'rejected', replayed: true }))
    expect((await client.query(
      `SELECT event_type,count(*)::integer AS count
       FROM public.question_outcome_mapping_candidate_events
       WHERE event_type IN ('stale','reopened','rejected') GROUP BY event_type ORDER BY event_type`,
    )).rows).toEqual([
      { event_type: 'rejected', count: 1 },
      { event_type: 'reopened', count: 2 },
      { event_type: 'stale', count: 2 },
    ])
  })

  it('reapplies safely over populated queue state', async () => {
    const before = Number((await client.query('SELECT count(*) FROM public.question_outcome_mapping_candidates')).rows[0].count)
    await client.query(migration)
    expect(Number((await client.query('SELECT count(*) FROM public.question_outcome_mapping_candidates')).rows[0].count)).toBe(before)
    expect((await client.query(`SELECT
      has_function_privilege('authenticated','public.transfer_question_outcome_mapping_candidate(uuid,uuid,uuid,text,uuid)','EXECUTE') AS auth_exec,
      has_function_privilege('service_role','public.transfer_question_outcome_mapping_candidate(uuid,uuid,uuid,text,uuid)','EXECUTE') AS service_exec
    `)).rows[0]).toEqual({ auth_exec: true, service_exec: false })
  })
})
