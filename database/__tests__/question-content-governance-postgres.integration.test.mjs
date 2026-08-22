import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const url = process.env.CONTENT_GOVERNANCE_TEST_DATABASE_URL
if (url && process.env.CONTENT_GOVERNANCE_TEST_DATABASE_DISPOSABLE !== '1') throw new Error('Set CONTENT_GOVERNANCE_TEST_DATABASE_DISPOSABLE=1')
if (url && !/^bilge_r43_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error('Refusing non-disposable content-governance database')
const suite = url && process.env.CONTENT_GOVERNANCE_TEST_DATABASE_DISPOSABLE === '1' ? describe : describe.skip
const migration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '106_question_content_governance.sql'), 'utf8')
const validationPipelineMigration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '136_question_validation_pipeline.sql'), 'utf8')
const appealEvidenceMigration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '139_question_appeal_evidence_v2.sql'), 'utf8')
const writeContextMigration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '142_question_governance_write_context.sql'), 'utf8')
const psychometricsV2Migration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '137_question_revision_psychometrics_v2.sql'), 'utf8')
const psychometricsV3Migration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '143_question_revision_psychometrics_v3.sql'), 'utf8')
const qualityProjectionMigration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '141_question_quality_evidence_projection.sql'), 'utf8')
const singleAuthorityMigration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '144_question_quality_single_authority_cutover.sql'), 'utf8')

suite('106 content governance disposable PostgreSQL acceptance', () => {
  let client; let author; let reviewer1; let reviewer2; let publisher; let learner; let legacyLearner; let question; let outcome; let legacyRevision
  const rpc = async (call, values = []) => { await client.query('SET ROLE service_role'); try { return (await client.query(`SELECT ${call} AS result`, values)).rows[0].result } finally { await client.query('RESET ROLE') } }
  const concurrentReplay = async (call, values = []) => {
    const firstClient = new pg.Client({ connectionString: url }); const secondClient = new pg.Client({ connectionString: url })
    await Promise.all([firstClient.connect(), secondClient.connect()])
    try {
      await Promise.all([firstClient.query('SET ROLE service_role'), secondClient.query('SET ROLE service_role')])
      await Promise.all([firstClient.query('BEGIN'), secondClient.query('BEGIN')])
      const first = (await firstClient.query(`SELECT ${call} AS result`, values)).rows[0].result
      const secondPending = secondClient.query(`SELECT ${call} AS result`, values)
      await new Promise((resolve) => setTimeout(resolve, 50))
      await firstClient.query('COMMIT')
      const second = (await secondPending).rows[0].result
      await secondClient.query('COMMIT')
      return [first, second]
    } catch (error) {
      await Promise.allSettled([firstClient.query('ROLLBACK'), secondClient.query('ROLLBACK')])
      throw error
    } finally {
      await Promise.allSettled([firstClient.end(), secondClient.end()])
    }
  }
  const err = async (fn, code) => { let caught; try { await fn() } catch (e) { caught = e } expect({ code: caught?.code, message: caught?.message }).toEqual(expect.objectContaining({ code })) }
  const payload = (answer = 1) => ({ content: { question: '2 + 2 kac eder?', options: ['3','4','5','6'], answer, solution: 'Dort.' }, metadata: { game: 'matematik', category: 'Temel', difficulty: 2 }, outcomes: [{ outcomeId: outcome, weight: 1, primary: true }], source: { kind: 'original', title: 'Ogretmen notu', licenseCode: 'INTERNAL' }, changeKind: 'correct_answer', summary: 'Answer key reviewed' })
  beforeAll(async () => {
    client = new pg.Client({ connectionString: url }); await client.connect()
    await client.query(`DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA auth; CREATE SCHEMA public; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions; DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$; GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$; CREATE TABLE public.profiles(id uuid PRIMARY KEY); CREATE TABLE public.roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text UNIQUE,name text,description text,is_system boolean); CREATE TABLE public.role_permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),role_id uuid REFERENCES public.roles(id),permission text,UNIQUE(role_id,permission)); CREATE TABLE public.user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES public.profiles(id),role_id uuid REFERENCES public.roles(id),UNIQUE(user_id,role_id)); CREATE FUNCTION public.has_permission(uuid,text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles u JOIN public.role_permissions p ON p.role_id=u.role_id WHERE u.user_id=$1 AND p.permission=$2) $$; CREATE TABLE public.curriculum_outcomes(id uuid PRIMARY KEY,is_active boolean NOT NULL DEFAULT true); CREATE TABLE public.questions(id uuid PRIMARY KEY,game text NOT NULL,category text NOT NULL,subcategory text,topic text,difficulty smallint NOT NULL,level_tag text,exam_ref text,is_boss boolean NOT NULL DEFAULT false,content jsonb NOT NULL,is_active boolean NOT NULL DEFAULT true); CREATE TABLE public.question_outcomes(question_id uuid,outcome_id uuid,weight numeric,is_primary boolean); CREATE TABLE public.game_sessions(id uuid PRIMARY KEY,user_id uuid,status text,total_questions smallint,correct_count smallint,wrong_count smallint,base_xp integer,bonus_xp integer,total_xp integer,completed_at timestamptz); CREATE TABLE public.verified_attempts(id uuid PRIMARY KEY,user_id uuid NOT NULL,game text NOT NULL,mode text NOT NULL DEFAULT 'classic',question_ids uuid[] NOT NULL,duration_sec integer NOT NULL DEFAULT 60,started_at timestamptz DEFAULT clock_timestamp(),expires_at timestamptz DEFAULT clock_timestamp()+interval '1 hour',completed_at timestamptz,session_id uuid); CREATE TABLE public.verified_exam_attempts(attempt_id uuid PRIMARY KEY,user_id uuid,game text,exam_ref text,blueprint_version text,question_set_hash text,planned_duration_sec integer,issue_request_id uuid,status text DEFAULT 'issued',deadline_at timestamptz); CREATE TABLE public.verified_exam_attempt_items(attempt_id uuid,position smallint,question_id uuid,source_bucket text,PRIMARY KEY(attempt_id,position)); CREATE TABLE public.session_answers(id uuid PRIMARY KEY,session_id uuid,user_id uuid,question_id uuid,question_order smallint,is_correct boolean NOT NULL,is_skipped boolean DEFAULT false,selected_option smallint,time_taken_sec numeric,is_fast boolean DEFAULT false,xp_earned smallint NOT NULL DEFAULT 0,answered_at timestamptz DEFAULT clock_timestamp()); CREATE TABLE public.error_reports(id uuid PRIMARY KEY,user_id uuid NOT NULL,question_id uuid NOT NULL,report_type text NOT NULL,description text,status text NOT NULL,created_at timestamptz NOT NULL); GRANT INSERT ON public.error_reports TO authenticated; CREATE TABLE public.verified_attempt_hint_events(attempt_id uuid,user_id uuid,question_id uuid,stage smallint); CREATE TABLE public.adaptive_diagnostic_answers(user_id uuid,question_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp());`)
    await client.query(`CREATE TYPE public.report_status AS ENUM('pending','reviewed','resolved','rejected'); ALTER TABLE public.profiles ADD COLUMN coins integer NOT NULL DEFAULT 0; ALTER TABLE public.error_reports ALTER COLUMN status TYPE public.report_status USING status::public.report_status, ADD COLUMN admin_note text, ADD COLUMN resolved_by uuid, ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), ADD COLUMN rewarded_at timestamptz, ADD COLUMN rewarded_coins integer; CREATE FUNCTION public.increment_coins(uuid,integer) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.profiles SET coins=coins+$2 WHERE id=$1 $$;`)
    ;[author, reviewer1, reviewer2, publisher, learner, legacyLearner, question, outcome] = Array.from({ length: 8 }, randomUUID)
    await client.query('INSERT INTO public.profiles SELECT unnest($1::uuid[])', [[author,reviewer1,reviewer2,publisher,learner,legacyLearner]])
    await client.query('INSERT INTO public.curriculum_outcomes(id) VALUES($1)', [outcome])
    await client.query(`INSERT INTO public.questions(id,game,category,difficulty,content) VALUES($1,'matematik','Temel',2,$2)`, [question,{ question:'legacy',options:['A','B'],answer:0 }])
    await client.query("INSERT INTO public.error_reports(id,user_id,question_id,report_type,description,status,created_at) VALUES($1,$2,$3,'typo','Eski yazım bildirimi','pending','2026-07-01T10:00:00Z')",[randomUUID(),legacyLearner,question])
    await client.query(migration)
    await client.query(validationPipelineMigration)
    await client.query(psychometricsV2Migration)
    await client.query(psychometricsV3Migration)
    await client.query(appealEvidenceMigration)
    await client.query(qualityProjectionMigration)
    await client.query(writeContextMigration)
    await client.query(singleAuthorityMigration)
    const roles = [['author','content.prepare',author],['author-r1','content.review.stage1',author],['r1','content.review.stage1',reviewer1],['r1-stage2','content.review.stage2',reviewer1],['r2','content.review.stage2',reviewer2],['pub','content.publish',publisher],['correct','content.corrections.apply',publisher],['psy','content.psychometrics.refresh',publisher],['appeal','content.appeals.manage',publisher],['enforce','content.enforcement.manage',publisher]]
    for (const [slug, permission, user] of roles) { const role = randomUUID(); await client.query('INSERT INTO public.roles(id,slug,name,is_system) VALUES($1,$2,$2,true)', [role,slug]); await client.query('INSERT INTO public.role_permissions(role_id,permission) VALUES($1,$2)', [role,permission]); await client.query('INSERT INTO public.user_roles(user_id,role_id) VALUES($1,$2)', [user,role]) }
    legacyRevision = (await client.query('SELECT published_revision_id FROM public.questions WHERE id=$1',[question])).rows[0].published_revision_id
  })
  afterAll(async () => { await client?.end() })
  it('backfills legacy pointers, denies direct content mutation, and requires independent approval', async () => {
    expect(legacyRevision).toMatch(/[0-9a-f-]{36}/)
    const importedAppeals = await rpc('public.get_my_question_appeals($1)',[legacyLearner]); expect(importedAppeals.appeals[0]).toEqual(expect.objectContaining({ status:'submitted', publicMessage:'Önceki soru bildiriminiz inceleme kuyruğuna taşındı.' })); expect((await client.query('SELECT count(*)::int AS n FROM public.error_reports WHERE status=$1',['pending'])).rows[0].n).toBe(1)
    expect((await rpc('public.get_content_governance_enforcement($1)',[publisher])).enforced).toBe(false)
    await client.query("UPDATE public.questions SET category='Geçiş modu' WHERE id=$1",[question]); await client.query("UPDATE public.questions SET category='Temel' WHERE id=$1",[question])
    const transitionLegacyReport=randomUUID()
    await client.query("INSERT INTO public.error_reports(id,user_id,question_id,report_type,description,status,created_at) VALUES($1,$2,$3,'unclear','Geçiş anında geldi.','pending',clock_timestamp())",[transitionLegacyReport,learner,question])
    const enforcementRequest=randomUUID()
    expect((await rpc('public.set_content_governance_enforcement($1,$2,$3)',[publisher,true,enforcementRequest]))).toEqual(expect.objectContaining({ enforced:true, importedLegacyReports:1 }))
    expect((await client.query('SELECT count(*)::int AS n FROM public.question_appeals WHERE legacy_error_report_id=$1',[transitionLegacyReport])).rows[0].n).toBe(1)
    const transitionAppeal=(await client.query('SELECT id FROM public.question_appeals WHERE legacy_error_report_id=$1',[transitionLegacyReport])).rows[0].id
    await rpc('public.resolve_question_appeal($1,$2,$3,$4,$5,$6)',[publisher,transitionAppeal,'resolved','Haklı bildirim.','Geçiş ödülü.',randomUUID()])
    expect(await rpc('public.finalize_legacy_question_appeal_transition($1,$2,$3)',[publisher,transitionAppeal,250])).toEqual(expect.objectContaining({ legacy:true, awarded:true, replayed:false, coins:250, userId:learner }))
    expect((await client.query('SELECT coins FROM public.profiles WHERE id=$1',[learner])).rows[0].coins).toBe(250)
    expect(await rpc('public.finalize_legacy_question_appeal_transition($1,$2,$3)',[publisher,transitionAppeal,250])).toEqual(expect.objectContaining({ legacy:true, awarded:false, replayed:true, coins:250 }))
    expect((await client.query('SELECT coins FROM public.profiles WHERE id=$1',[learner])).rows[0].coins).toBe(250)
    expect((await rpc('public.set_content_governance_enforcement($1,$2,$3)',[publisher,true,enforcementRequest])).replayed).toBe(true)
    await err(() => rpc('public.set_content_governance_enforcement($1,$2,$3)',[learner,false,randomUUID()]), '42501')
    await err(() => client.query("UPDATE public.questions SET content='{}'::jsonb WHERE id=$1", [question]), '42501')
    await client.query('BEGIN'); await client.query("SELECT set_config('app.content_governance_publish','on',true)"); await err(() => client.query("UPDATE public.questions SET content='{}'::jsonb WHERE id=$1", [question]), '42501'); await client.query('ROLLBACK')
    const draft = await rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)', [author,question,legacyRevision,JSON.stringify(payload(1)),randomUUID()])
    await err(() => rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [author,draft.revisionId,1,'approved','self',randomUUID()]), '22023')
    const concurrentReviewRequest = randomUUID(); const [firstReview, replayedReview] = await concurrentReplay('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [reviewer1,draft.revisionId,1,'approved','subject valid',concurrentReviewRequest]); expect(firstReview).toEqual(expect.objectContaining({ revisionId:draft.revisionId, replayed:false })); expect(replayedReview).toEqual(expect.objectContaining({ revisionId:draft.revisionId, replayed:true }))
    await err(() => rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [reviewer1,draft.revisionId,2,'approved','same person',randomUUID()]), '22023')
    await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [reviewer2,draft.revisionId,2,'approved','pedagogy valid',randomUUID()])
    await err(() => rpc('public.publish_question_content_revision($1,$2,$3)', [author,draft.revisionId,randomUUID()]), '42501')
    const published = await rpc('public.publish_question_content_revision($1,$2,$3)', [publisher,draft.revisionId,randomUUID()]); expect(published.status).toBe('published')
    const detail = await rpc('public.get_question_content_revision($1,$2)', [author,draft.revisionId])
    expect(detail.revision).toEqual(expect.objectContaining({
      revisionId: draft.revisionId,
      source: expect.objectContaining({ kind: 'original', licenseCode: 'INTERNAL' }),
      outcomes: [expect.objectContaining({ outcomeId: outcome, weight: 1, primary: true })],
    }))
    expect((await rpc('public.get_published_question_content_revision($1,$2)', [author,question])).revision.revisionId).toBe(draft.revisionId)
    const firstPage = await rpc('public.get_question_content_governance_queue($1,$2::text,$3,$4::text)',[author,null,1,'']); expect(firstPage.items).toHaveLength(1); expect(firstPage.nextCursor).toMatch(/\|[0-9a-f-]{36}$/); const secondPage = await rpc('public.get_question_content_governance_queue($1,$2::text,$3,$4::text)',[author,null,1,firstPage.nextCursor]); expect(secondPage.items).toHaveLength(1); expect(secondPage.items[0].revisionId).not.toBe(firstPage.items[0].revisionId)
    await err(() => rpc('public.get_question_content_governance_queue($1,$2::text,$3,$4::text)',[author,null,1,'not-a-cursor']), '22023')
    await err(() => rpc('public.get_question_content_revision($1,$2)', [author,randomUUID()]), 'P0002')
    const crossTargetRequest = randomUUID(); await rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)', [author,question,published.revisionId,JSON.stringify(payload(1)),crossTargetRequest]); const secondQuestion = (await rpc('public.create_governed_question($1,$2::jsonb,$3)',[author,JSON.stringify({ ...payload(1), changeKind:'create' }),randomUUID()])).questionId; await err(() => rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)',[author,secondQuestion,null,JSON.stringify(payload(1)),crossTargetRequest]),'22023'); expect((await client.query('SELECT count(*)::int AS n FROM public.question_content_revisions WHERE question_id=$1',[secondQuestion])).rows[0].n).toBe(1)
  })
  it('does not reuse a governed write context in another transaction or backend', async () => {
    await client.query('UPDATE public.content_governance_runtime SET enforce_direct_mutation=true')
    await client.query('BEGIN')
    await client.query("SELECT public.content_governance_authorize_question_write($1,'publish')", [question])
    await client.query('COMMIT')
    await err(() => client.query("UPDATE public.questions SET category='stale-context' WHERE id=$1", [question]), '42501')

    const otherClient = new pg.Client({ connectionString: url })
    await otherClient.connect()
    try {
      await err(() => otherClient.query("UPDATE public.questions SET category='cross-backend' WHERE id=$1", [question]), '42501')
    } finally {
      await otherClient.end()
    }
  })
  it('closes legacy student intake and projects governed appeal counts after cutover', async () => {
    await client.query('SET ROLE authenticated')
    try {
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [learner])
      expect((await client.query('SELECT public.legacy_error_report_intake_enabled() AS enabled')).rows[0]).toEqual({ enabled:false })
      await err(() => client.query("INSERT INTO public.error_reports(id,user_id,question_id,report_type,description,status,created_at) VALUES($1,$2,$3,'unclear','Cutover sonrası','pending',clock_timestamp())",[randomUUID(),learner,question]), '42501')
    } finally {
      await client.query('RESET ROLE')
    }
    const counts=await rpc('public.get_question_quality_appeal_counts($1,$2)',[publisher,500])
    expect(counts).toEqual(expect.objectContaining({ capped:false, items:expect.arrayContaining([
      expect.objectContaining({ questionId:question, openCount:expect.any(Number), verifiedOpenCount:expect.any(Number) }),
    ]) }))
    await err(() => rpc('public.get_question_quality_appeal_counts($1,$2)',[learner,500]), '42501')
    await rpc('public.set_content_governance_enforcement($1,$2,$3)',[publisher,false,randomUUID()])
    await client.query('SET ROLE authenticated')
    try {
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [learner])
      expect((await client.query('SELECT public.legacy_error_report_intake_enabled() AS enabled')).rows[0]).toEqual({ enabled:false })
    } finally {
      await client.query('RESET ROLE')
    }
    await rpc('public.set_content_governance_enforcement($1,$2,$3)',[publisher,true,randomUUID()])
  })
  it('snapshots verified attempts, binds only matching completion, and keeps correction an overlay', async () => {
    const published = (await client.query('SELECT published_revision_id FROM public.questions WHERE id=$1',[question])).rows[0].published_revision_id
    const attempt = randomUUID(); const session = randomUUID(); const answer = randomUUID()
    await client.query('INSERT INTO public.verified_attempts(id,user_id,game,question_ids) VALUES($1,$2,$3,$4)', [attempt,learner,'matematik',[question]])
    const privateSnapshot = await rpc('public.get_verified_attempt_question_snapshots($1,$2,$3)',[attempt,learner,true])
    expect(privateSnapshot).toEqual(expect.objectContaining({ items:[expect.objectContaining({ questionId:question, revisionId:published, correctOption:1, metadata:expect.objectContaining({ difficulty:2, basePoints:20 }) })] }))
    await err(() => rpc('public.get_verified_attempt_question_snapshots($1,$2,$3)',[attempt,author,true]), '42501')
    await client.query("INSERT INTO public.game_sessions(id,user_id,status,total_questions,correct_count,wrong_count,base_xp,bonus_xp,total_xp,completed_at) VALUES($1,$2,'completed',1,1,0,14,6,20,clock_timestamp())", [session,learner])
    await client.query('INSERT INTO public.session_answers(id,session_id,user_id,question_id,question_order,selected_option,is_correct,xp_earned) VALUES($1,$2,$3,$4,0,1,true,20)', [answer,session,learner,question])
    await client.query('UPDATE public.verified_attempts SET session_id=$1,completed_at=clock_timestamp() WHERE id=$2',[session,attempt])
    expect((await client.query('SELECT question_revision_id FROM public.session_answers WHERE id=$1',[answer])).rows[0].question_revision_id).toBe(published)
    await err(() => rpc('public.get_verified_attempt_question_snapshots($1,$2,$3)',[attempt,learner,true]), '22023')
    expect((await rpc('public.get_verified_attempt_question_snapshots($1,$2,$3)',[attempt,learner,false])).items).toHaveLength(1)
    const expiredAttempt = randomUUID()
    await client.query("INSERT INTO public.verified_attempts(id,user_id,game,question_ids,expires_at) VALUES($1,$2,'matematik',$3,clock_timestamp()-interval '1 second')", [expiredAttempt,learner,[question]])
    await err(() => rpc('public.get_verified_attempt_question_snapshots($1,$2,$3)',[expiredAttempt,learner,false]), '22023')
    const newer = (await rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)', [author,question,published,JSON.stringify(payload(0)),randomUUID()])).revisionId
    await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)',[reviewer1,newer,1,'approved','ok',randomUUID()]); await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)',[reviewer2,newer,2,'approved','ok',randomUUID()]); await rpc('public.publish_question_content_revision($1,$2,$3)',[publisher,newer,randomUUID()])
    const legacySession = randomUUID(); await client.query("INSERT INTO public.game_sessions(id,user_id,status,total_questions,correct_count,wrong_count,base_xp,bonus_xp,total_xp,completed_at) VALUES($1,$2,'completed',1,1,0,0,0,0,clock_timestamp())",[legacySession,learner]); await client.query('INSERT INTO public.session_answers(id,session_id,user_id,question_id,question_order,selected_option,is_correct,xp_earned) VALUES($1,$2,$3,$4,0,1,true,0)',[randomUUID(),legacySession,learner,question])
    const incident = await rpc('public.create_question_error_incident($1,$2,$3,$4,$5,$6)',[publisher,question,published,newer,'wrong_key',randomUUID()])
    expect(incident).toEqual(expect.objectContaining({ eligibleCount:1, manualRequiredCount:1 }))
    const before = await client.query('SELECT is_correct FROM public.session_answers WHERE id=$1',[answer]); const applyRequest = randomUUID(); const applied = await rpc('public.apply_question_result_corrections($1,$2,$3)',[publisher,incident.incidentId,applyRequest]); expect(applied).toEqual(expect.objectContaining({ changedCount:1, manualRequiredCount:1 })); const replay = await rpc('public.apply_question_result_corrections($1,$2,$3)',[publisher,incident.incidentId,applyRequest]); expect(replay).toEqual(expect.objectContaining({ changedCount:1, replayed:true })); expect((await client.query('SELECT is_correct FROM public.session_answers WHERE id=$1',[answer])).rows).toEqual(before.rows); expect((await rpc('public.get_my_question_result_corrections($1)',[learner])).corrections).toHaveLength(1); expect((await client.query('SELECT count(*)::int AS n FROM public.question_result_corrections WHERE incident_id=$1',[incident.incidentId])).rows[0].n).toBe(1)
  })
  it('keeps appeals owner-scoped, SLA-idempotent, and new governance tables private', async () => {
    const appeal = await rpc('public.submit_question_appeal($1,$2,$3,$4,$5,$6)',[learner,question,null,'ambiguous','',randomUUID()]); expect(appeal.status).toBe('submitted'); const privateAppeals = await rpc('public.get_my_question_appeals($1)',[learner]); expect(privateAppeals.appeals[0]).toEqual(expect.objectContaining({ status:'submitted', publicMessage:'Your appeal was received.' })); expect(JSON.stringify(privateAppeals)).not.toMatch(/appealId|questionId|reason|internal/i)
    const adminQueue = await rpc('public.get_question_appeal_queue($1,$2::text,$3,$4::text)',[publisher,'submitted',50,'']); expect(adminQueue.items[0]).toEqual(expect.objectContaining({ appealId:appeal.appealId, questionId:question, reasonCode:'ambiguous', status:'submitted', hasSessionEvidence:false })); expect(JSON.stringify(adminQueue)).not.toMatch(/userId|sessionAnswerId/)
    await err(() => rpc('public.get_question_appeal_queue($1,$2::text,$3,$4::text)',[learner,null,50,'']), '42501')
    expect((await rpc('public.resolve_question_appeal($1,$2,$3,$4,$5,$6)',[publisher,appeal.appealId,'acknowledged','İnceleme başladı.','Kanıtlar kontrol edilecek.',randomUUID()])).status).toBe('acknowledged')
    const concurrentLearner = randomUUID(); await client.query('INSERT INTO public.profiles(id) VALUES($1)',[concurrentLearner]); const concurrentAppealRequest = randomUUID(); const [firstAppeal,replayedAppeal] = await concurrentReplay('public.submit_question_appeal($1,$2,$3,$4,$5,$6)',[concurrentLearner,question,null,'wrong_key','Parallel retry.',concurrentAppealRequest]); expect(firstAppeal).toEqual(expect.objectContaining({ replayed:false })); expect(replayedAppeal).toEqual(expect.objectContaining({ appealId:firstAppeal.appealId, replayed:true })); expect((await client.query("SELECT count(*)::int AS n FROM public.question_appeals WHERE user_id=$1 AND question_id=$2 AND status IN ('submitted','acknowledged','investigating')",[concurrentLearner,question])).rows[0].n).toBe(1)
    expect((await rpc("public.sweep_question_appeal_sla(clock_timestamp()+interval '15 days')",[])).breached).toBe(3); expect((await rpc("public.sweep_question_appeal_sla(clock_timestamp()+interval '15 days')",[])).breached).toBe(0); expect((await client.query('SELECT count(*)::int AS n FROM public.question_appeal_events WHERE event_type=$1',['sla_breached'])).rows[0].n).toBe(3)
    expect((await client.query("SELECT has_table_privilege('service_role','public.question_appeals','INSERT') AS allowed,(SELECT relrowsecurity FROM pg_class WHERE oid='public.question_appeals'::regclass) AS rls")).rows[0]).toEqual({ allowed:false, rls:true })
  })
  it('binds v2 appeals to issued and completed attempt snapshots without exposing raw evidence ids', async () => {
    const issuedLearner = randomUUID(); const completedLearner = randomUUID(); const outsider = randomUUID()
    await client.query('INSERT INTO public.profiles SELECT unnest($1::uuid[])', [[issuedLearner,completedLearner,outsider]])

    const issuedAttempt = randomUUID()
    await client.query("INSERT INTO public.verified_attempts(id,user_id,game,question_ids) VALUES($1,$2,'matematik',$3)", [issuedAttempt,issuedLearner,[question]])
    await err(() => rpc('public.submit_question_appeal_v2($1,$2,$3,$4,$5,$6,$7)',[outsider,question,null,issuedAttempt,'ambiguous','Bana ait değil.',randomUUID()]), '42501')
    const issued = await rpc('public.submit_question_appeal_v2($1,$2,$3,$4,$5,$6,$7)',[issuedLearner,question,null,issuedAttempt,'ambiguous','Sunulan soru belirsiz.',randomUUID()])
    expect(issued).toEqual(expect.objectContaining({ status:'submitted', evidenceKind:'issued_attempt', replayed:false }))
    const alreadyOpen = await rpc('public.submit_question_appeal_v2($1,$2,$3,$4,$5,$6,$7)',[issuedLearner,question,null,issuedAttempt,'wrong_key','Aynı revizyon için ikinci istek.',randomUUID()])
    expect(alreadyOpen).toEqual(expect.objectContaining({ appealId:issued.appealId, alreadyReported:true, replayed:false }))

    const completedAttempt = randomUUID(); const completedSession = randomUUID(); const completedAnswer = randomUUID()
    await client.query("INSERT INTO public.verified_attempts(id,user_id,game,question_ids) VALUES($1,$2,'matematik',$3)", [completedAttempt,completedLearner,[question]])
    await client.query("INSERT INTO public.game_sessions(id,user_id,status,total_questions,correct_count,wrong_count,base_xp,bonus_xp,total_xp,completed_at) VALUES($1,$2,'completed',1,1,0,14,6,20,clock_timestamp())", [completedSession,completedLearner])
    await client.query('INSERT INTO public.session_answers(id,session_id,user_id,question_id,question_order,selected_option,is_correct,xp_earned) VALUES($1,$2,$3,$4,0,0,true,20)', [completedAnswer,completedSession,completedLearner,question])
    await client.query('UPDATE public.verified_attempts SET session_id=$1,completed_at=clock_timestamp() WHERE id=$2',[completedSession,completedAttempt])
    const boundRevision = (await client.query('SELECT question_revision_id FROM public.session_answers WHERE id=$1',[completedAnswer])).rows[0].question_revision_id
    const completed = await rpc('public.submit_question_appeal_v2($1,$2,$3,$4,$5,$6,$7)',[completedLearner,question,completedAnswer,null,'wrong_key','Cevap anahtarı uyuşmuyor.',randomUUID()])
    expect(completed).toEqual(expect.objectContaining({ status:'submitted', evidenceKind:'verified_session', replayed:false }))
    await err(() => rpc('public.submit_question_appeal_v2($1,$2,$3,$4,$5,$6,$7)',[completedLearner,question,completedAnswer,completedAttempt,'wrong_key','Çifte kanıt.',randomUUID()]), '22023')

    const queue = await rpc('public.get_question_appeal_queue_v2($1,$2::text,$3,$4::text)',[publisher,'submitted',100,''])
    expect(queue.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ appealId:issued.appealId, revisionId:boundRevision, evidenceKind:'issued_attempt', hasVerifiedEvidence:true, hasSessionEvidence:false }),
      expect.objectContaining({ appealId:completed.appealId, revisionId:boundRevision, evidenceKind:'verified_session', hasVerifiedEvidence:true, hasSessionEvidence:true, selectedOption:0 }),
    ]))
    expect(JSON.stringify(queue)).not.toMatch(/attemptId|sessionAnswerId/)
    expect((await client.query("SELECT has_function_privilege('authenticated','public.submit_question_appeal_v2(uuid,uuid,uuid,uuid,text,text,uuid)','EXECUTE') AS authenticated_allowed,has_function_privilege('service_role','public.submit_question_appeal_v2(uuid,uuid,uuid,uuid,text,text,uuid)','EXECUTE') AS service_allowed")).rows[0]).toEqual({ authenticated_allowed:false, service_allowed:true })
  })
  it('materializes only verified revision snapshots and suppresses discrimination below n=30', async () => {
    const revision = (await client.query('SELECT published_revision_id FROM public.questions WHERE id=$1',[question])).rows[0].published_revision_id
    const windowStart = '2026-08-01T00:00:00.000Z'; const windowEnd = '2026-08-02T00:00:00.000Z'
    const seed = async (index, verified = true, priorDiagnostic = false) => {
      const sampleUser = randomUUID(); const session = randomUUID(); const attempt = randomUUID(); const answer = randomUUID(); const isCorrect = index % 2 === 0; const answeredAt = `2026-08-01T00:00:${String(index).padStart(2,'0')}.000Z`
      await client.query('INSERT INTO public.profiles(id) VALUES($1)', [sampleUser])
      if (priorDiagnostic) await client.query("INSERT INTO public.adaptive_diagnostic_answers(user_id,question_id,created_at) VALUES($1,$2,$3::timestamptz-interval '1 minute')", [sampleUser,question,answeredAt])
      await client.query("INSERT INTO public.game_sessions(id,user_id,status,total_questions,correct_count,wrong_count,base_xp,bonus_xp,total_xp,completed_at) VALUES($1,$2,'completed',10,$3,$4,0,0,0,$5::timestamptz)",[session,sampleUser,isCorrect?5:1,isCorrect?5:9,answeredAt])
      await client.query('INSERT INTO public.session_answers(id,session_id,user_id,question_id,question_order,selected_option,is_correct,xp_earned,answered_at,question_revision_id) VALUES($1,$2,$3,$4,0,$5,$6,$7,$8::timestamptz,$9)',[answer,session,sampleUser,question,isCorrect?0:1,isCorrect,isCorrect?20:0,answeredAt,revision])
      if (verified) await client.query("INSERT INTO public.verified_attempts(id,user_id,game,question_ids,duration_sec,started_at,expires_at,completed_at,session_id) VALUES($1,$2,'matematik',$3,60,$4::timestamptz,$4::timestamptz+interval '1 hour',$4::timestamptz,$5)",[attempt,sampleUser,[question],answeredAt,session])
    }
    await seed(59,false)
    for (let index=0; index<29; index+=1) await seed(index)
    const below = await rpc('public.materialize_question_revision_psychometrics($1,$2,$3::timestamptz,$4::timestamptz,$5)',[publisher,revision,windowStart,windowEnd,randomUUID()]); expect(below).toEqual(expect.objectContaining({ sampleN:29, discrimination:null }))
    await seed(29)
    const threshold = await rpc('public.materialize_question_revision_psychometrics($1,$2,$3::timestamptz,$4::timestamptz,$5)',[publisher,revision,windowStart,windowEnd,randomUUID()]); expect(threshold.sampleN).toBe(30); expect(threshold.discrimination).toBeGreaterThan(0.9)
    await seed(30,true,true)
    const diagnosticExcluded = await rpc('public.materialize_question_revision_psychometrics($1,$2,$3::timestamptz,$4::timestamptz,$5)',[publisher,revision,windowStart,windowEnd,randomUUID()]); expect(diagnosticExcluded).toEqual(expect.objectContaining({ sampleN:30, medianResponseTimeSec:null, fastResponseRate:null, eligibilityPolicy:'verified_first_question_exposure_no_hint_no_timing_normalized_rest_v3' }))
    const detail = await rpc('public.get_question_content_revision($1,$2)',[publisher,revision])
    expect(detail.revision.psychometrics[0]).toEqual(expect.objectContaining({ sampleN:30, correctN:15 }))
    expect(detail.revision.optionStatistics).toHaveLength(4)
    expect(detail.revision.optionStatistics.reduce((sum, option) => sum + option.selectedN, 0)).toBe(30)
    expect(detail.revision.optionStatistics.filter((option) => option.correctOption)).toHaveLength(1)
    expect(detail.revision.appealSignals.openCount).toBeGreaterThanOrEqual(2)
    expect(detail.revision.appealSignals.verifiedOpenCount).toBeGreaterThanOrEqual(2)
    expect(detail.revision.appealSignals.byReason).toEqual(expect.objectContaining({ ambiguous:expect.any(Number), wrong_key:expect.any(Number) }))
    expect(JSON.stringify(detail)).not.toMatch(/userId|attemptId|sessionAnswerId|selectedOption/)
    await err(() => rpc('public.materialize_question_revision_psychometrics($1,$2,$3::timestamptz,$4::timestamptz,$5)',[learner,revision,windowStart,windowEnd,randomUUID()]), '42501')
  })
})
