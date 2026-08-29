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
const communityQualityMigration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '146_community_question_quality_consensus.sql'), 'utf8')
const outcomeScopeMigration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '164_question_revision_outcome_scope.sql'), 'utf8')
const questionsDmlLockdownMigration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '163_questions_client_dml_lockdown.sql'), 'utf8')
const searchAdminAal2Migration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '165_question_search_admin_aal2.sql'), 'utf8')
const outcomeCandidatesMigration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '166_question_outcome_mapping_candidates.sql'), 'utf8')
const curriculumScopeRegistryMigration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '178_curriculum_scope_release_registry.sql'), 'utf8')
const ydtEnglishReleaseMigration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '187_release_ydt_english_mastery_scope.sql'), 'utf8')

suite('106 content governance disposable PostgreSQL acceptance', () => {
  let client; let author; let reviewer1; let reviewer2; let publisher; let learner; let legacyLearner; let question; let outcome; let outcome2; let outcomeCourse; let outcomeUnit; let outcomeTopic; let outcomeNode; let legacyRevision; let candidateQuestion; let candidateOutcome; let candidateLegacyRevision; let ydtQuestion; let ydtLegacyNullQuestion; let ydtOutcome; let ydtWrongOutcome; let ydtLegacyRevision; let ydtLegacyNullRevision
  const rpc = async (call, values = []) => { await client.query("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims',$1,false)",[JSON.stringify({ role:'service_role' })]); await client.query('SET ROLE service_role'); try { return (await client.query(`SELECT ${call} AS result`, values)).rows[0].result } finally { await client.query('RESET ROLE') } }
  const userRpc = async (userId, aal, call, values = []) => { await client.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[userId,JSON.stringify({ sub:userId,role:'authenticated',aal })]); await client.query('SET ROLE authenticated'); try { return (await client.query(`SELECT ${call} AS result`, values)).rows[0].result } finally { await client.query('RESET ROLE') } }
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
  const ydtPayload = ({ examRef = 'YDT', outcomes = [{ outcomeId: ydtOutcome, weight: 1, primary: true }], summary = 'YDT scope lifecycle proof' } = {}) => ({ content: { question: 'Which option completes the sentence?', options: ['A','B','C','D'], answer: 0, solution: 'A is correct.' }, metadata: { game: 'wordquest', category: 'vocabulary', difficulty: 2, examRef }, outcomes, source: { kind: 'original', title: 'YDT fixture', licenseCode: 'INTERNAL' }, changeKind: 'edit', summary })
  beforeAll(async () => {
    client = new pg.Client({ connectionString: url }); await client.connect()
    await client.query(`DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA auth; CREATE SCHEMA public; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions; DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$; GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$; CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$; CREATE FUNCTION public.immutable_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT $1 $$; CREATE TABLE public.profiles(id uuid PRIMARY KEY); CREATE TABLE public.roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text UNIQUE,name text,description text,is_system boolean); CREATE TABLE public.role_permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),role_id uuid REFERENCES public.roles(id),permission text,UNIQUE(role_id,permission)); CREATE TABLE public.user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES public.profiles(id),role_id uuid REFERENCES public.roles(id),UNIQUE(user_id,role_id)); CREATE FUNCTION public.has_permission(uuid,text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles u JOIN public.role_permissions p ON p.role_id=u.role_id WHERE u.user_id=$1 AND p.permission=$2) $$; CREATE TABLE public.curriculum_nodes(id uuid PRIMARY KEY,code text NOT NULL DEFAULT '',title text NOT NULL DEFAULT '',game text NOT NULL,category text,exam_ref text,parent_id uuid REFERENCES public.curriculum_nodes(id),node_type text NOT NULL,sort_order integer NOT NULL DEFAULT 0,taxonomy_version text NOT NULL,is_active boolean NOT NULL DEFAULT true); CREATE TABLE public.curriculum_outcomes(id uuid PRIMARY KEY,game text,category text,exam_ref text,node_id uuid REFERENCES public.curriculum_nodes(id),taxonomy_version text,is_active boolean NOT NULL DEFAULT true); CREATE TABLE public.questions(id uuid PRIMARY KEY,external_id varchar,game varchar NOT NULL,category varchar NOT NULL,subcategory varchar,topic varchar,difficulty smallint NOT NULL,level_tag varchar,exam_ref varchar,is_boss boolean NOT NULL DEFAULT false,content jsonb NOT NULL,is_active boolean NOT NULL DEFAULT true,source varchar,times_answered integer NOT NULL DEFAULT 0,times_correct integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT clock_timestamp()); CREATE TABLE public.question_outcomes(question_id uuid,outcome_id uuid,weight numeric,is_primary boolean,mapping_source text NOT NULL DEFAULT 'manual',UNIQUE(question_id,outcome_id)); CREATE TABLE public.game_sessions(id uuid PRIMARY KEY,user_id uuid,status text,total_questions smallint,correct_count smallint,wrong_count smallint,base_xp integer,bonus_xp integer,total_xp integer,completed_at timestamptz); CREATE TABLE public.verified_attempts(id uuid PRIMARY KEY,user_id uuid NOT NULL,game text NOT NULL,mode text NOT NULL DEFAULT 'classic',question_ids uuid[] NOT NULL,duration_sec integer NOT NULL DEFAULT 60,started_at timestamptz DEFAULT clock_timestamp(),expires_at timestamptz DEFAULT clock_timestamp()+interval '1 hour',completed_at timestamptz,session_id uuid); CREATE TABLE public.mastery_materialized_attempts(attempt_id uuid PRIMARY KEY REFERENCES public.verified_attempts(id) ON DELETE RESTRICT,materialized_at timestamptz NOT NULL DEFAULT clock_timestamp()); CREATE TABLE public.verified_exam_attempts(attempt_id uuid PRIMARY KEY,user_id uuid,game text,exam_ref text,blueprint_version text,question_set_hash text,planned_duration_sec integer,issue_request_id uuid,status text DEFAULT 'issued',deadline_at timestamptz); CREATE TABLE public.verified_exam_attempt_items(attempt_id uuid,position smallint,question_id uuid,source_bucket text,PRIMARY KEY(attempt_id,position)); CREATE TABLE public.session_answers(id uuid PRIMARY KEY,session_id uuid,user_id uuid,question_id uuid,question_order smallint,is_correct boolean NOT NULL,is_skipped boolean DEFAULT false,selected_option smallint,time_taken_sec numeric,is_fast boolean DEFAULT false,xp_earned smallint NOT NULL DEFAULT 0,answered_at timestamptz DEFAULT clock_timestamp()); CREATE TABLE public.error_reports(id uuid PRIMARY KEY,user_id uuid NOT NULL,question_id uuid NOT NULL,report_type text NOT NULL,description text,status text NOT NULL,created_at timestamptz NOT NULL); GRANT INSERT ON public.error_reports TO authenticated; CREATE TABLE public.verified_attempt_hint_events(attempt_id uuid,user_id uuid,question_id uuid,stage smallint); CREATE TABLE public.adaptive_diagnostic_answers(user_id uuid,question_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp());`)
    await client.query(`CREATE TYPE public.report_status AS ENUM('pending','reviewed','resolved','rejected'); ALTER TABLE public.profiles ADD COLUMN coins integer NOT NULL DEFAULT 0; ALTER TABLE public.error_reports ALTER COLUMN status TYPE public.report_status USING status::public.report_status, ADD COLUMN admin_note text, ADD COLUMN resolved_by uuid, ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), ADD COLUMN rewarded_at timestamptz, ADD COLUMN rewarded_coins integer; CREATE FUNCTION public.increment_coins(uuid,integer) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.profiles SET coins=coins+$2 WHERE id=$1 $$; CREATE TABLE public.reward_ledger(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id),source_type text NOT NULL,source_id uuid NOT NULL,reward_type text NOT NULL,reward_key text NOT NULL,amount integer NOT NULL CHECK(amount>=0),metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(source_type,source_id,reward_type,reward_key));`)
    await client.query('ALTER TABLE public.curriculum_outcomes ADD COLUMN code text, ADD COLUMN title text')
    ;[author, reviewer1, reviewer2, publisher, learner, legacyLearner, question, outcome, outcome2, outcomeCourse, outcomeUnit, outcomeTopic, outcomeNode, candidateQuestion, candidateOutcome] = Array.from({ length: 15 }, randomUUID)
    ;[ydtQuestion, ydtLegacyNullQuestion, ydtOutcome, ydtWrongOutcome] = Array.from({ length: 4 }, randomUUID)
    await client.query('INSERT INTO public.profiles SELECT unnest($1::uuid[])', [[author,reviewer1,reviewer2,publisher,learner,legacyLearner]])
    await client.query(`INSERT INTO public.curriculum_nodes(id,game,category,exam_ref,parent_id,node_type,taxonomy_version) VALUES
      ($1,'matematik',NULL,NULL,NULL,'course','test-v1'),
      ($2,'matematik',NULL,NULL,$1,'unit','test-v1'),
      ($3,'matematik','Temel',NULL,$2,'topic','test-v1'),
      ($4,'matematik','Temel',NULL,$3,'outcome','test-v1')`, [outcomeCourse,outcomeUnit,outcomeTopic,outcomeNode])
    await client.query("INSERT INTO public.curriculum_outcomes(id,game,category,exam_ref,node_id,taxonomy_version) VALUES($1,'matematik','Temel',NULL,$3,'test-v1'),($2,'matematik','Temel',NULL,$3,'test-v1')", [outcome,outcome2,outcomeNode])
    const candidateTopic=randomUUID(); const candidateNode=randomUUID()
    await client.query(`INSERT INTO public.curriculum_nodes(id,game,category,exam_ref,parent_id,node_type,taxonomy_version) VALUES
      ($1,'matematik','Aday',NULL,$3,'topic','test-v1'),
      ($2,'matematik','Aday',NULL,$1,'outcome','test-v1')`,[candidateTopic,candidateNode,outcomeUnit])
    await client.query("INSERT INTO public.curriculum_outcomes(id,code,title,game,category,exam_ref,node_id,taxonomy_version) VALUES($1,'MAT-ADAY-01','Aday kazanımı','matematik','Aday',NULL,$2,'test-v1')",[candidateOutcome,candidateNode])
    const [registryMathCourse,registryMathUnit,registryMathTopic,registryMathNode,registryMathOutcome,registryMathQuestion] = Array.from({ length:6 }, randomUUID)
    await client.query(`INSERT INTO public.curriculum_nodes(id,code,title,game,category,exam_ref,parent_id,node_type,taxonomy_version) VALUES
      ($1,'ba-tyt-math-v1:course','TYT Matematik','matematik',NULL,'TYT',NULL,'course','ba-tyt-math-v1'),
      ($2,'ba-tyt-math-v1:unit','Registry unit','matematik',NULL,'TYT',$1,'unit','ba-tyt-math-v1'),
      ($3,'ba-tyt-math-v1:topic:registry','Registry topic','matematik','Registry','TYT',$2,'topic','ba-tyt-math-v1'),
      ($4,'ba-tyt-math-v1:outcome:registry','Registry outcome','matematik','Registry','TYT',$3,'outcome','ba-tyt-math-v1')`, [registryMathCourse,registryMathUnit,registryMathTopic,registryMathNode])
    await client.query("INSERT INTO public.curriculum_outcomes(id,code,title,game,category,exam_ref,node_id,taxonomy_version) VALUES($1,'MAT-REG-01','Registry outcome','matematik','Registry','TYT',$2,'ba-tyt-math-v1')", [registryMathOutcome,registryMathNode])

    const [ydtCourse,ydtUnit,ydtTopic,ydtNode] = Array.from({ length:4 }, randomUUID)
    await client.query(`INSERT INTO public.curriculum_nodes(id,code,title,game,category,exam_ref,parent_id,node_type,taxonomy_version) VALUES
      ($1,'ba-ydt-eng-v1:course','YDT English','wordquest',NULL,'YDT',NULL,'course','ba-ydt-eng-v1'),
      ($2,'ba-ydt-eng-v1:unit','Vocabulary unit','wordquest',NULL,'YDT',$1,'unit','ba-ydt-eng-v1'),
      ($3,'ba-ydt-eng-v1:topic:vocabulary','Vocabulary topic','wordquest','vocabulary','YDT',$2,'topic','ba-ydt-eng-v1'),
      ($4,'ba-ydt-eng-v1:outcome:vocabulary','Vocabulary outcome','wordquest','vocabulary','YDT',$3,'outcome','ba-ydt-eng-v1')`, [ydtCourse,ydtUnit,ydtTopic,ydtNode])
    await client.query("INSERT INTO public.curriculum_outcomes(id,code,title,game,category,exam_ref,node_id,taxonomy_version) VALUES($1,'ENG-VOC-01','Vocabulary outcome','wordquest','vocabulary','YDT',$2,'ba-ydt-eng-v1')", [ydtOutcome,ydtNode])

    const [ydtWrongCourse,ydtWrongUnit,ydtWrongTopic,ydtWrongNode] = Array.from({ length:4 }, randomUUID)
    await client.query(`INSERT INTO public.curriculum_nodes(id,code,title,game,category,exam_ref,parent_id,node_type,taxonomy_version) VALUES
      ($1,'test-ydt-wrong-v1:course','Wrong scope','wordquest',NULL,'TYT',NULL,'course','test-ydt-wrong-v1'),
      ($2,'test-ydt-wrong-v1:unit','Wrong unit','wordquest',NULL,'TYT',$1,'unit','test-ydt-wrong-v1'),
      ($3,'test-ydt-wrong-v1:topic:vocabulary','Wrong topic','wordquest','vocabulary','TYT',$2,'topic','test-ydt-wrong-v1'),
      ($4,'test-ydt-wrong-v1:outcome:vocabulary','Wrong outcome','wordquest','vocabulary','TYT',$3,'outcome','test-ydt-wrong-v1')`, [ydtWrongCourse,ydtWrongUnit,ydtWrongTopic,ydtWrongNode])
    await client.query("INSERT INTO public.curriculum_outcomes(id,code,title,game,category,exam_ref,node_id,taxonomy_version) VALUES($1,'ENG-WRONG-01','Wrong outcome','wordquest','vocabulary','TYT',$2,'test-ydt-wrong-v1')", [ydtWrongOutcome,ydtWrongNode])
    await client.query(`INSERT INTO public.questions(id,game,category,difficulty,content) VALUES($1,'matematik','Temel',2,$2)`, [question,{ question:'legacy',options:['A','B'],answer:0 }])
    await client.query(`INSERT INTO public.questions(id,game,category,difficulty,content) VALUES($1,'matematik','Aday',2,$2)`, [candidateQuestion,{ question:'aday legacy',options:['A','B'],answer:0 }])
    await client.query(`INSERT INTO public.questions(id,game,category,difficulty,exam_ref,content) VALUES
      ($1,'matematik','Registry',2,'TYT',$2),
      ($3,'wordquest','vocabulary',2,'YDT',$4),
      ($5,'wordquest','vocabulary',2,NULL,$6)`, [
      registryMathQuestion,{ question:'registry math',options:['A','B'],answer:0 },
      ydtQuestion,{ question:'legacy YDT',options:['A','B'],answer:0 },
      ydtLegacyNullQuestion,{ question:'legacy null YDT',options:['A','B'],answer:0 },
    ])
    await client.query(`INSERT INTO public.question_outcomes(question_id,outcome_id,weight,is_primary)
      VALUES($1,$2,1,true),($3,$4,1,true)`, [
      registryMathQuestion,registryMathOutcome,ydtQuestion,ydtOutcome,
    ])
    await client.query("INSERT INTO public.error_reports(id,user_id,question_id,report_type,description,status,created_at) VALUES($1,$2,$3,'typo','Eski yazım bildirimi','pending','2026-07-01T10:00:00Z')",[randomUUID(),legacyLearner,question])
    await client.query(migration)
    await client.query(validationPipelineMigration)
    await client.query(psychometricsV2Migration)
    await client.query(psychometricsV3Migration)
    await client.query(appealEvidenceMigration)
    await client.query(qualityProjectionMigration)
    await client.query(writeContextMigration)
    await client.query(singleAuthorityMigration)
    await client.query(communityQualityMigration)
    await client.query('GRANT SELECT (id,game,category,difficulty,is_active) ON TABLE public.questions TO authenticated; GRANT INSERT,UPDATE,DELETE ON TABLE public.questions TO authenticated')
    await client.query(questionsDmlLockdownMigration)
    await client.query(outcomeScopeMigration)
    await client.query(searchAdminAal2Migration)
    const roles = [['author','content.prepare',author],['author-r1','content.review.stage1',author],['author-admin-view','admin.dashboard.view',author],['r1-prepare','content.prepare',reviewer1],['r1','content.review.stage1',reviewer1],['r1-stage2','content.review.stage2',reviewer1],['r2-stage1','content.review.stage1',reviewer2],['r2','content.review.stage2',reviewer2],['pub-stage2','content.review.stage2',publisher],['pub','content.publish',publisher],['correct','content.corrections.apply',publisher],['psy','content.psychometrics.refresh',publisher],['appeal','content.appeals.manage',publisher],['enforce','content.enforcement.manage',publisher]]
    for (const [slug, permission, user] of roles) { const role = randomUUID(); await client.query('INSERT INTO public.roles(id,slug,name,is_system) VALUES($1,$2,$2,true)', [role,slug]); await client.query('INSERT INTO public.role_permissions(role_id,permission) VALUES($1,$2)', [role,permission]); await client.query('INSERT INTO public.user_roles(user_id,role_id) VALUES($1,$2)', [user,role]) }
    await client.query(outcomeCandidatesMigration)
    await client.query(curriculumScopeRegistryMigration)
    await client.query(ydtEnglishReleaseMigration)
    legacyRevision = (await client.query('SELECT published_revision_id FROM public.questions WHERE id=$1',[question])).rows[0].published_revision_id
    candidateLegacyRevision = (await client.query('SELECT published_revision_id FROM public.questions WHERE id=$1',[candidateQuestion])).rows[0].published_revision_id
    ydtLegacyRevision = (await client.query('SELECT published_revision_id FROM public.questions WHERE id=$1',[ydtQuestion])).rows[0].published_revision_id
    ydtLegacyNullRevision = (await client.query('SELECT published_revision_id FROM public.questions WHERE id=$1',[ydtLegacyNullQuestion])).rows[0].published_revision_id
  })
  afterAll(async () => { await client?.end() })
  it('backfills legacy pointers, denies direct content mutation, and requires independent approval', async () => {
    expect(legacyRevision).toMatch(/[0-9a-f-]{36}/)
    expect((await client.query("SELECT has_table_privilege('authenticated','public.questions','UPDATE') AS client_update,has_column_privilege('authenticated','public.questions','id','SELECT') AS id_read,has_column_privilege('authenticated','public.questions','content','SELECT') AS content_read,has_table_privilege('service_role','public.questions','UPDATE') AS server_update,has_function_privilege('authenticated','public.publish_question_content_revision(uuid,uuid,uuid)','EXECUTE') AS client_publish_rpc,has_function_privilege('service_role','public.publish_question_content_revision(uuid,uuid,uuid)','EXECUTE') AS server_publish_rpc")).rows[0]).toEqual({ client_update:false,id_read:true,content_read:false,server_update:false,client_publish_rpc:false,server_publish_rpc:true })
    for (const aal of ['aal1','aal2']) {
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [author,JSON.stringify({ sub:author,role:'authenticated',aal })])
      await client.query('SET ROLE authenticated'); await err(() => client.query("UPDATE public.questions SET category=$2 WHERE id=$1",[question,`${aal}-bypass`]),'42501'); await client.query('RESET ROLE')
    }
    await client.query("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','',false)")
    await client.query('SET ROLE service_role'); await err(() => client.query("UPDATE public.questions SET category='service-bypass' WHERE id=$1",[question]),'42501'); await client.query('RESET ROLE')
    const invalidScopes = [
      [randomUUID(),'fen','Temel',null,'test-v1'],
      [randomUUID(),'matematik','geometri',null,'test-v1'],
      [randomUUID(),'matematik','Temel','TYT','test-v1'],
      [randomUUID(),'matematik','Temel',null,'other-v1'],
    ]
    for (const [invalidOutcome,game,category,examRef,taxonomyVersion] of invalidScopes) {
      await client.query('INSERT INTO public.curriculum_outcomes(id,game,category,exam_ref,node_id,taxonomy_version) VALUES($1,$2,$3,$4,$5,$6)',[invalidOutcome,game,category,examRef,outcomeNode,taxonomyVersion])
      const invalidPayload = { ...payload(1), outcomes:[{ outcomeId:invalidOutcome,weight:1,primary:true }], summary:`Reject invalid scope ${game}/${category}/${examRef ?? 'general'}/${taxonomyVersion}` }
      await err(() => rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)',[author,question,legacyRevision,JSON.stringify(invalidPayload),randomUUID()]),'22023')
    }
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
    const taxonomyWriter = new pg.Client({ connectionString: url })
    await taxonomyWriter.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT public.lock_question_revision_outcome_scope($1)', [draft.revisionId])
      await taxonomyWriter.query("SET lock_timeout='150ms'")
      await err(() => taxonomyWriter.query('UPDATE public.curriculum_nodes SET is_active=false WHERE id=$1',[outcomeTopic]), '55P03')
    } finally {
      await client.query('ROLLBACK')
      await taxonomyWriter.end()
    }
    await client.query('UPDATE public.curriculum_nodes SET is_active=false WHERE id=$1',[outcomeTopic])
    await err(() => rpc('public.publish_question_content_revision($1,$2,$3)', [publisher,draft.revisionId,randomUUID()]), '22023')
    await client.query('UPDATE public.curriculum_nodes SET is_active=true WHERE id=$1',[outcomeTopic])
    const published = await rpc('public.publish_question_content_revision($1,$2,$3)', [publisher,draft.revisionId,randomUUID()]); expect(published.status).toBe('published')
    const detail = await rpc('public.get_question_content_revision($1,$2)', [author,draft.revisionId])
    expect(detail.revision).toEqual(expect.objectContaining({
      revisionId: draft.revisionId,
      source: expect.objectContaining({ kind: 'original', licenseCode: 'INTERNAL' }),
      outcomes: [expect.objectContaining({ outcomeId: outcome, weight: 1, primary: true })],
    }))
    const unmappedPayload = { ...payload(1), outcomes: [], summary: 'Legacy correction kept pending curriculum mapping' }
    const unmapped = await rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)', [author,question,published.revisionId,JSON.stringify(unmappedPayload),randomUUID()])
    expect(unmapped).toEqual(expect.objectContaining({ status:'draft', mappingRequired:true }))
    await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [reviewer1,unmapped.revisionId,1,'approved','content valid',randomUUID()])
    await err(() => rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [reviewer2,unmapped.revisionId,2,'approved','scope missing',randomUUID()]), '22023')
    const pendingCoverage = await rpc('public.get_question_outcome_coverage($1)', [author])
    expect(pendingCoverage.openRevisionUnmappedOrInvalid).toBeGreaterThanOrEqual(1)
    const mapped = await rpc('public.set_question_revision_outcomes($1,$2,$3::jsonb,$4)', [author,unmapped.revisionId,JSON.stringify([{ outcomeId:outcome,weight:1,primary:true }]),randomUUID()])
    expect(mapped).toEqual(expect.objectContaining({ status:'draft', mappingRequired:false, outcomeCount:1, mappingChanged:true, stage1ApprovalInvalidated:true }))
    await err(() => rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [reviewer2,unmapped.revisionId,2,'approved','stale stage one cannot survive mapping',randomUUID()]), '22023')
    await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [reviewer1,unmapped.revisionId,1,'approved','content and final mapping valid',randomUUID()])
    const unchangedMapping = await rpc('public.set_question_revision_outcomes($1,$2,$3::jsonb,$4)', [author,unmapped.revisionId,JSON.stringify([{ outcomeId:outcome,weight:1,primary:true }]),randomUUID()])
    expect(unchangedMapping).toEqual(expect.objectContaining({ status:'stage1_approved', mappingChanged:false, stage1ApprovalInvalidated:false }))
    await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [reviewer2,unmapped.revisionId,2,'approved','scope valid',randomUUID()])

    const crossActorDraft = await rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)', [author,question,published.revisionId,JSON.stringify({ ...unmappedPayload, summary:'Cross-actor outcome independence proof' }),randomUUID()])
    await rpc('public.set_question_revision_outcomes($1,$2,$3::jsonb,$4)', [reviewer1,crossActorDraft.revisionId,JSON.stringify([{ outcomeId:outcome,weight:1,primary:true }]),randomUUID()])
    expect((await client.query('SELECT prepared_by,outcomes_prepared_by FROM public.question_content_revisions WHERE id=$1',[crossActorDraft.revisionId])).rows[0]).toEqual({ prepared_by:author,outcomes_prepared_by:reviewer1 })
    await err(() => rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [reviewer1,crossActorDraft.revisionId,1,'approved','must not self-review mapped evidence',randomUUID()]), '22023')
    await err(() => rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [author,crossActorDraft.revisionId,1,'approved','must not self-review authored content',randomUUID()]), '22023')

    const concurrentPayload = { ...payload(1), outcomes: [], summary: 'Concurrent mapping lock order proof' }
    const [mappingDraftA,mappingDraftB] = await Promise.all([
      rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)', [author,question,published.revisionId,JSON.stringify(concurrentPayload),randomUUID()]),
      rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)', [author,question,published.revisionId,JSON.stringify({ ...concurrentPayload, summary:'Concurrent mapping lock order proof B' }),randomUUID()]),
    ])
    const mappingClientA = new pg.Client({ connectionString:url }); const mappingClientB = new pg.Client({ connectionString:url })
    await Promise.all([mappingClientA.connect(),mappingClientB.connect()])
    try {
      await Promise.all([
        mappingClientA.query("SET ROLE service_role; SET statement_timeout='5s'"),
        mappingClientB.query("SET ROLE service_role; SET statement_timeout='5s'"),
      ])
      const [mappingA,mappingB] = await Promise.all([
        mappingClientA.query('SELECT public.set_question_revision_outcomes($1,$2,$3::jsonb,$4) AS result',[author,mappingDraftA.revisionId,JSON.stringify([{ outcomeId:outcome,weight:0.6,primary:true },{ outcomeId:outcome2,weight:0.4,primary:false }]),randomUUID()]),
        mappingClientB.query('SELECT public.set_question_revision_outcomes($1,$2,$3::jsonb,$4) AS result',[author,mappingDraftB.revisionId,JSON.stringify([{ outcomeId:outcome2,weight:0.4,primary:false },{ outcomeId:outcome,weight:0.6,primary:true }]),randomUUID()]),
      ])
      expect([mappingA.rows[0].result,mappingB.rows[0].result]).toEqual([
        expect.objectContaining({ outcomeCount:2, mappingChanged:true }),
        expect.objectContaining({ outcomeCount:2, mappingChanged:true }),
      ])
    } finally {
      await Promise.allSettled([mappingClientA.end(),mappingClientB.end()])
    }
    await err(() => rpc('public.create_governed_question($1,$2::jsonb,$3)', [author,JSON.stringify({ ...unmappedPayload, changeKind:'create' }),randomUUID()]), '22023')
    expect((await rpc('public.get_published_question_content_revision($1,$2)', [author,question])).revision.revisionId).toBe(draft.revisionId)
    const firstPage = await rpc('public.get_question_content_governance_queue($1,$2::text,$3,$4::text)',[author,null,1,'']); expect(firstPage.items).toHaveLength(1); expect(firstPage.nextCursor).toMatch(/\|[0-9a-f-]{36}$/); const secondPage = await rpc('public.get_question_content_governance_queue($1,$2::text,$3,$4::text)',[author,null,1,firstPage.nextCursor]); expect(secondPage.items).toHaveLength(1); expect(secondPage.items[0].revisionId).not.toBe(firstPage.items[0].revisionId)
    await err(() => rpc('public.get_question_content_governance_queue($1,$2::text,$3,$4::text)',[author,null,1,'not-a-cursor']), '22023')
    await err(() => rpc('public.get_question_content_revision($1,$2)', [author,randomUUID()]), 'P0002')
    const crossTargetRequest = randomUUID(); await rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)', [author,question,published.revisionId,JSON.stringify(payload(1)),crossTargetRequest]); const secondQuestion = (await rpc('public.create_governed_question($1,$2::jsonb,$3)',[author,JSON.stringify({ ...payload(1), changeKind:'create' }),randomUUID()])).questionId; await err(() => rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)',[author,secondQuestion,null,JSON.stringify(payload(1)),crossTargetRequest]),'22023'); expect((await client.query('SELECT count(*)::int AS n FROM public.question_content_revisions WHERE question_id=$1',[secondQuestion])).rows[0].n).toBe(1)
  }, 15_000)
  it('requires AAL2 for the raw search projection while keeping public content redacted', async () => {
    const setJwt = async (aal) => client.query(
      "SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
      [author,JSON.stringify({ sub:author,role:'authenticated',aal })],
    )
    await setJwt('aal1')
    await client.query('SET ROLE authenticated')
    try {
      await err(() => client.query('SELECT content FROM public.search_questions(NULL::text,NULL::text,NULL::text,NULL::integer,NULL::boolean,true,0,20)'), '42501')
      const publicRows = await client.query('SELECT content FROM public.search_questions(NULL::text,NULL::text,NULL::text,NULL::integer,NULL::boolean,false,0,20)')
      expect(publicRows.rows.length).toBeGreaterThan(0)
      expect(publicRows.rows.every((row) => !('answer' in row.content) && !('solution' in row.content))).toBe(true)
    } finally {
      await client.query('RESET ROLE')
    }

    await setJwt('aal2')
    await client.query('SET ROLE authenticated')
    try {
      const adminRows = await client.query('SELECT content FROM public.search_questions(NULL::text,NULL::text,NULL::text,NULL::integer,NULL::boolean,true,0,20)')
      expect(adminRows.rows.some((row) => 'answer' in row.content)).toBe(true)
    } finally {
      await client.query('RESET ROLE')
      await client.query("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','',false)")
    }
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
  it('locks independent answers server-side and recomputes weighted consensus from private evidence', async () => {
    const revision = (await client.query(`SELECT r.id,r.content_sha256,r.game FROM public.questions q JOIN public.question_content_revisions r ON r.id=q.published_revision_id WHERE q.id=$1`,[question])).rows[0]
    const qualityCase = (await client.query('INSERT INTO public.question_quality_cases(question_id,revision_id,content_sha256) VALUES($1,$2,$3) RETURNING id',[question,revision.id,revision.content_sha256])).rows[0].id
    const voters = Array.from({ length: 6 }, () => randomUUID())
    await client.query('INSERT INTO public.profiles SELECT unnest($1::uuid[])',[voters])
    for (const voter of voters) {
      await client.query(`INSERT INTO public.question_quality_worker_profiles(user_id,domain,resolved_total,flawed_controls,flawed_controls_correct,clean_controls,clean_controls_correct,correction_checks,correction_checks_correct,trust_state) VALUES($1,$2,40,20,20,20,20,20,20,'trusted')`,[voter,revision.game])
    }

    const assign = async (voter,index) => rpc('public.get_next_question_quality_mission($1,$2,$3)',[voter,index.toString(16).padStart(64,'0'),randomUUID()])
    const invalidMission = (await assign(voters[5],6)).mission
    expect(invalidMission.content).not.toHaveProperty('answer')
    expect(invalidMission.content).not.toHaveProperty('solution')
    expect(JSON.stringify(invalidMission)).not.toMatch(/controlId|correctOption|expectedVerdict/)
    await err(() => rpc('public.lock_question_quality_mission_answer($1,$2,$3::integer,$4)',[voters[5],invalidMission.missionId,4,randomUUID()]),'22023')

    let firstClaim
    for (let index=0; index<5; index+=1) {
      const assigned = (await assign(voters[index],index+1)).mission
      const lockRequest = randomUUID()
      const locked = await rpc('public.lock_question_quality_mission_answer($1,$2,$3::integer,$4)',[voters[index],assigned.missionId,1,lockRequest])
      expect(locked).toEqual(expect.objectContaining({ status:'answer_locked',replayed:false }))
      expect(await rpc('public.lock_question_quality_mission_answer($1,$2,$3::integer,$4)',[voters[index],assigned.missionId,1,lockRequest])).toEqual(expect.objectContaining({ replayed:true }))
      await err(() => rpc('public.lock_question_quality_mission_answer($1,$2,$3::integer,$4)',[voters[index],assigned.missionId,2,randomUUID()]),'P0003')
      const submitted = await rpc('public.submit_assigned_question_quality_mission($1,$2,$3::integer,$4,$5,$6::integer,$7,$8,$9::integer,$10)',[
        voters[index],assigned.missionId,1,'flawed','wrong_key',1,null,'Bağımsız çözüm cevap anahtarının hatalı olduğunu gösteriyor.',95,randomUUID(),
      ])
      expect(submitted).toEqual(expect.objectContaining({ status:'submitted',rewardEligible:false }))
      if (index===0) firstClaim=submitted.claimId
      await err(() => rpc('public.submit_assigned_question_quality_mission($1,$2,$3::integer,$4,$5,$6::integer,$7,$8,$9::integer,$10)',[
        voters[index],assigned.missionId,1,'clean',null,null,null,'',60,randomUUID(),
      ]),'P0003')
    }

    expect((await client.query('SELECT solved_answer_index,proposed_answer_index,revision_id FROM public.question_quality_claims WHERE id=$1',[firstClaim])).rows[0]).toEqual({ solved_answer_index:1,proposed_answer_index:1,revision_id:revision.id })
    await err(() => client.query('UPDATE public.question_quality_claims SET solved_answer_index=2 WHERE id=$1',[firstClaim]),'42501')
    await err(() => client.query('UPDATE public.question_quality_missions SET locked_answer_index=2 WHERE id=(SELECT mission_id FROM public.question_quality_claims WHERE id=$1)',[firstClaim]),'42501')

    const consensus = (await client.query('SELECT public.compute_question_quality_consensus($1) AS result',[qualityCase])).rows[0].result
    expect(consensus).toEqual(expect.objectContaining({
      decision:'quarantine',independentUserCount:5,independentClusterCount:5,trustedAgreementCount:5,
      leadingReasonCode:'wrong_key',inputsSha256:expect.stringMatching(/^[0-9a-f]{64}$/),
    }))
    const quarantine = await rpc('public.record_question_quality_consensus($1,$2,$3,$4)',[publisher,qualityCase,'community-quality@1',randomUUID()])
    expect(quarantine).toEqual(expect.objectContaining({ state:'quarantined',replayed:false }))
    expect((await client.query('SELECT is_active FROM public.questions WHERE id=$1',[question])).rows[0].is_active).toBe(false)
    expect((await client.query('SELECT count(*)::int AS n FROM public.question_quality_consensus_queue WHERE case_id=$1',[qualityCase])).rows[0].n).toBe(0)

    await rpc('public.record_question_quality_external_proof($1,$2,$3,$4,$5::jsonb,$6)',[publisher,qualityCase,'deterministic','supports_flaw',JSON.stringify({ rule:'independent arithmetic proof',version:1 }),randomUUID()])
    const confirmRequest = randomUUID()
    const confirmed = await rpc('public.record_question_quality_consensus($1,$2,$3,$4)',[publisher,qualityCase,'community-quality@1',confirmRequest])
    expect(confirmed).toEqual(expect.objectContaining({ state:'confirmed',replayed:false }))
    expect(await rpc('public.record_question_quality_consensus($1,$2,$3,$4)',[publisher,qualityCase,'community-quality@1',confirmRequest])).toEqual(expect.objectContaining({ state:'confirmed',replayed:true }))
    expect((await client.query("SELECT count(*)::int AS n,sum(amount)::int AS total FROM public.reward_ledger WHERE source_type='question_quality_claim' AND metadata->>'caseId'=$1",[qualityCase])).rows[0]).toEqual({ n:6,total:240 })
    expect((await client.query('SELECT coins FROM public.profiles WHERE id=$1',[voters[0]])).rows[0].coins).toBe(200)

    const controlRevision = (await client.query('SELECT id,content_sha256 FROM public.question_content_revisions WHERE question_id=$1 AND id<>$2 ORDER BY revision_no LIMIT 1',[question,revision.id])).rows[0]
    const controlUser = randomUUID(); await client.query('INSERT INTO public.profiles(id) VALUES($1)',[controlUser])
    await client.query(`INSERT INTO public.question_quality_controls(revision_id,question_id,content_sha256,expected_verdict,expected_answer_index,proof_kind,proof_evidence,created_by) VALUES($1,$2,$3,'clean',1,'deterministic',$4::jsonb,$5)`,[controlRevision.id,question,controlRevision.content_sha256,JSON.stringify({ rule:'known clean control' }),publisher])
    const controlMission = (await assign(controlUser,15)).mission
    expect(JSON.stringify(controlMission)).not.toMatch(/controlId|expectedVerdict|expectedAnswer/)
    await rpc('public.lock_question_quality_mission_answer($1,$2,$3::integer,$4)',[controlUser,controlMission.missionId,1,randomUUID()])
    await rpc('public.submit_assigned_question_quality_mission($1,$2,$3::integer,$4,$5,$6::integer,$7,$8,$9::integer,$10)',[controlUser,controlMission.missionId,1,'clean',null,null,null,'',80,randomUUID()])
    expect((await client.query('SELECT clean_controls,clean_controls_correct,trust_state FROM public.question_quality_worker_profiles WHERE user_id=$1',[controlUser])).rows[0]).toEqual({ clean_controls:1,clean_controls_correct:1,trust_state:'new' })
    expect((await client.query("SELECT has_table_privilege('authenticated','public.question_quality_claims','SELECT') AS claims_read,has_table_privilege('service_role','public.question_quality_consensus_queue','SELECT') AS queue_read,has_function_privilege('service_role','public.claim_question_quality_consensus_job(uuid)','EXECUTE') AS queue_rpc")).rows[0]).toEqual({ claims_read:false,queue_read:false,queue_rpc:true })
  }, 15_000)
  it('routes a fresh outcome candidate through the real 164 review and publish chain', async () => {
    const draftPayload={
      content:{ question:'Aday sorusu güncellendi.',options:['A','B'],answer:0,solution:'A seçeneği.' },
      metadata:{ game:'matematik',category:'Aday',difficulty:2 },
      outcomes:[],
      source:{ kind:'original',title:'Aday fixture',licenseCode:'INTERNAL' },
      changeKind:'edit',summary:'Kazanım adayı için yönetişimli revizyon',
    }
    const draft=await rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)',[
      author,candidateQuestion,candidateLegacyRevision,JSON.stringify(draftPayload),randomUUID(),
    ])
    expect(draft).toEqual(expect.objectContaining({ status:'draft',mappingRequired:true }))
    expect((await rpc('public.enqueue_question_outcome_mapping_candidates($1,$2)',[author,randomUUID()])))
      .toEqual(expect.objectContaining({ inserted:1,pendingExact:1,replayed:false }))
    const candidate=(await client.query(
      "SELECT id FROM public.question_outcome_mapping_candidates WHERE question_id=$1 AND status='pending'",
      [candidateQuestion],
    )).rows[0]
    expect(candidate?.id).toMatch(/[0-9a-f-]{36}/)
    await err(() => userRpc(reviewer1,'aal1',
      'public.transfer_question_outcome_mapping_candidate($1,$2,$3,$4,$5)',[
        reviewer1,candidate.id,draft.revisionId,'Kapsam eşleşmesi insan tarafından doğrulandı.',randomUUID(),
      ]), '42501')
    const transferRequest=randomUUID()
    expect(await userRpc(reviewer1,'aal2',
      'public.transfer_question_outcome_mapping_candidate($1,$2,$3,$4,$5)',[
        reviewer1,candidate.id,draft.revisionId,'Kapsam eşleşmesi insan tarafından doğrulandı.',transferRequest,
      ])).toEqual(expect.objectContaining({ status:'transferred',replayed:false }))
    expect((await client.query(
      `SELECT revision.outcomes_prepared_by,mapping.outcome_id
       FROM public.question_content_revisions revision
       JOIN public.question_revision_outcomes mapping ON mapping.revision_id=revision.id
       WHERE revision.id=$1`,[draft.revisionId],
    )).rows[0]).toEqual({ outcomes_prepared_by:reviewer1,outcome_id:candidateOutcome })
    expect((await client.query(
      'SELECT count(*)::integer AS count FROM public.question_outcomes WHERE question_id=$1',
      [candidateQuestion],
    )).rows[0].count).toBe(0)
    await err(() => rpc(
      'public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)',
      [reviewer1,draft.revisionId,1,'approved','Kendi outcome kanıtını inceleyemez.',randomUUID()],
    ), '22023')

    for (const [slug,permission,user] of [
      ['candidate-review-stage1','content.review.stage1',reviewer2],
      ['candidate-review-stage2','content.review.stage2',publisher],
    ]) {
      const role=randomUUID()
      await client.query('INSERT INTO public.roles(id,slug,name,is_system) VALUES($1,$2,$2,true)',[role,slug])
      await client.query('INSERT INTO public.role_permissions(role_id,permission) VALUES($1,$2)',[role,permission])
      await client.query('INSERT INTO public.user_roles(user_id,role_id) VALUES($1,$2)',[user,role])
    }
    await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)',[
      reviewer2,draft.revisionId,1,'approved','Bağımsız akademik ilk inceleme.',randomUUID(),
    ])
    await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)',[
      publisher,draft.revisionId,2,'approved','Bağımsız akademik ikinci inceleme.',randomUUID(),
    ])
    expect((await client.query(
      'SELECT count(*)::integer AS count FROM public.question_outcomes WHERE question_id=$1',
      [candidateQuestion],
    )).rows[0].count).toBe(0)
    await rpc('public.publish_question_content_revision($1,$2,$3)',[publisher,draft.revisionId,randomUUID()])
    expect((await client.query(
      `SELECT mapping.outcome_id,candidate.status
       FROM public.question_outcomes mapping
       JOIN public.question_outcome_mapping_candidates candidate ON candidate.question_id=mapping.question_id
       WHERE mapping.question_id=$1`,[candidateQuestion],
    )).rows[0]).toEqual({ outcome_id:candidateOutcome,status:'transferred' })
  })
  it('keeps Wordquest storage NULL through YDT governance, candidate repair, and fail-closed publish', async () => {
    expect((await client.query(`SELECT question.exam_ref,revision.exam_ref AS revision_exam_ref
      FROM public.questions question
      JOIN public.question_content_revisions revision ON revision.id=question.published_revision_id
      WHERE question.id=$1`, [ydtQuestion])).rows[0]).toEqual({ exam_ref:null, revision_exam_ref:'YDT' })
    expect((await client.query(`SELECT question.exam_ref,revision.exam_ref AS revision_exam_ref
      FROM public.questions question
      JOIN public.question_content_revisions revision ON revision.id=question.published_revision_id
      WHERE question.id=$1`, [ydtLegacyNullQuestion])).rows[0]).toEqual({ exam_ref:null, revision_exam_ref:null })
    expect((await client.query(`SELECT count(*)::integer AS count
      FROM public.content_governance_write_context
      WHERE question_id=ANY($1::uuid[])`, [[ydtQuestion,ydtLegacyNullQuestion]])).rows[0]).toEqual({ count:0 })

    const directDraft = await rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)', [
      author,ydtQuestion,ydtLegacyRevision,JSON.stringify(ydtPayload()),randomUUID(),
    ])
    await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [
      reviewer1,directDraft.revisionId,1,'approved','YDT scope stage one.',randomUUID(),
    ])
    await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [
      reviewer2,directDraft.revisionId,2,'approved','YDT scope stage two.',randomUUID(),
    ])
    await rpc('public.publish_question_content_revision($1,$2,$3)', [
      publisher,directDraft.revisionId,randomUUID(),
    ])
    expect((await client.query(`SELECT question.exam_ref,question.published_revision_id,
      revision.exam_ref AS revision_exam_ref,revision.status
      FROM public.questions question
      JOIN public.question_content_revisions revision ON revision.id=question.published_revision_id
      WHERE question.id=$1`, [ydtQuestion])).rows[0]).toEqual({
      exam_ref:null,published_revision_id:directDraft.revisionId,revision_exam_ref:'YDT',status:'published',
    })
    expect((await client.query(
      'SELECT public.question_active_outcome_mapping_valid($1) AS valid', [ydtQuestion],
    )).rows[0]).toEqual({ valid:true })

    await err(() => client.query(
      'DELETE FROM public.question_outcomes WHERE question_id=$1', [ydtLegacyNullQuestion],
    ), '22023')
    await client.query('BEGIN')
    try {
      await client.query('DELETE FROM public.question_outcomes WHERE question_id=$1', [ydtLegacyNullQuestion])
      const repairDraft = await rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)', [
        author,ydtLegacyNullQuestion,ydtLegacyNullRevision,
        JSON.stringify(ydtPayload({ outcomes:[],summary:'Repair legacy NULL revision through YDT candidate' })),
        randomUUID(),
      ])
      expect(repairDraft).toEqual(expect.objectContaining({ mappingRequired:true,status:'draft' }))
      await rpc('public.enqueue_question_outcome_mapping_candidates($1,$2)', [author,randomUUID()])
      const candidate = (await client.query(`SELECT id,scope_exam_ref,candidate_kind,
        proposed_outcome_id,base_revision_id
        FROM public.question_outcome_mapping_candidates
        WHERE question_id=$1 AND status='pending'`, [ydtLegacyNullQuestion])).rows[0]
      expect(candidate).toEqual(expect.objectContaining({
        scope_exam_ref:'YDT',candidate_kind:'exact_scope',proposed_outcome_id:ydtOutcome,
        base_revision_id:ydtLegacyNullRevision,
      }))
      await userRpc(reviewer1,'aal2',
        'public.transfer_question_outcome_mapping_candidate($1,$2,$3,$4,$5)', [
          reviewer1,candidate.id,repairDraft.revisionId,
          'Legacy NULL revision YDT kapsamına insan incelemesiyle taşındı.',randomUUID(),
        ])
      await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [
        reviewer2,repairDraft.revisionId,1,'approved','Legacy YDT repair stage one.',randomUUID(),
      ])
      await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [
        publisher,repairDraft.revisionId,2,'approved','Legacy YDT repair stage two.',randomUUID(),
      ])
      await rpc('public.publish_question_content_revision($1,$2,$3)', [
        publisher,repairDraft.revisionId,randomUUID(),
      ])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }

    const coverage = await rpc('public.get_question_outcome_coverage($1)', [author])
    expect(coverage.byScope).toEqual(expect.arrayContaining([
      expect.objectContaining({
        game:'wordquest',category:'vocabulary',examRef:'YDT',total:2,
        questionMappedInScope:2,publishedRevisionMappedInScope:2,
      }),
    ]))
    expect((await client.query(`SELECT count(*)::integer AS count
      FROM public.question_outcome_mapping_candidate_snapshot()
      WHERE question_id=ANY($1::uuid[])`, [[ydtQuestion,ydtLegacyNullQuestion]])).rows[0]).toEqual({ count:0 })
    expect((await client.query(
      "SELECT public.curriculum_scope_integrity('wordquest','YDT','ba-ydt-eng-v1') AS result",
    )).rows[0].result).toEqual(expect.objectContaining({
      total:2,mapped:2,unmapped:0,scopeMismatch:0,nodeOrphan:0,
      outcomeOrphan:0,primaryMismatch:0,emptyOutcome:0,
    }))

    const beforeWrongPublish = (await client.query(`SELECT published_revision_id,content,exam_ref
      FROM public.questions WHERE id=$1`, [ydtQuestion])).rows[0]
    const wrongDraft = await rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)', [
      author,ydtQuestion,directDraft.revisionId,
      JSON.stringify(ydtPayload({
        examRef:'TYT',outcomes:[{ outcomeId:ydtWrongOutcome,weight:1,primary:true }],
        summary:'Wrong TYT scope must roll back at publish',
      })),randomUUID(),
    ])
    await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [
      reviewer1,wrongDraft.revisionId,1,'approved','Wrong-scope fixture stage one.',randomUUID(),
    ])
    await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [
      reviewer2,wrongDraft.revisionId,2,'approved','Wrong-scope fixture stage two.',randomUUID(),
    ])
    let publishError
    try {
      await rpc('public.publish_question_content_revision($1,$2,$3)', [
        publisher,wrongDraft.revisionId,randomUUID(),
      ])
    } catch (error) {
      publishError = error
    }
    expect({ code:publishError?.code,message:publishError?.message }).toEqual({
      code:'22023',message:'question outcome is outside the active split curriculum scope',
    })
    expect((await client.query(`SELECT published_revision_id,content,exam_ref
      FROM public.questions WHERE id=$1`, [ydtQuestion])).rows[0]).toEqual(beforeWrongPublish)
    expect((await client.query(`SELECT outcome_id FROM public.question_outcomes
      WHERE question_id=$1`, [ydtQuestion])).rows).toEqual([{ outcome_id:ydtOutcome }])

    const retiredDraft = await rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)', [
      author,ydtQuestion,directDraft.revisionId,
      JSON.stringify(ydtPayload({ summary:'Retired split scope must block a valid YDT publish' })),
      randomUUID(),
    ])
    await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [
      reviewer1,retiredDraft.revisionId,1,'approved','Retired-scope fixture stage one.',randomUUID(),
    ])
    await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [
      reviewer2,retiredDraft.revisionId,2,'approved','Retired-scope fixture stage two.',randomUUID(),
    ])
    expect((await client.query(
      'SELECT public.question_revision_outcomes_valid($1) AS valid', [retiredDraft.revisionId],
    )).rows[0]).toEqual({ valid:true })
    let retiredPublishError
    await client.query('BEGIN')
    try {
      await client.query(`UPDATE public.curriculum_scope_releases SET release_status='retired'
        WHERE game='wordquest' AND display_exam_ref='YDT'`)
      await client.query('SELECT public.publish_question_content_revision($1,$2,$3)', [
        publisher,retiredDraft.revisionId,randomUUID(),
      ])
    } catch (error) {
      retiredPublishError = error
    } finally {
      await client.query('ROLLBACK')
    }
    expect({ code:retiredPublishError?.code,message:retiredPublishError?.message }).toEqual({
      code:'22023',message:'question outcome is outside the active split curriculum scope',
    })
    expect((await client.query(`SELECT release_status FROM public.curriculum_scope_releases
      WHERE game='wordquest' AND display_exam_ref='YDT'`)).rows[0]).toEqual({ release_status:'released' })
    expect((await client.query(`SELECT published_revision_id,content,exam_ref
      FROM public.questions WHERE id=$1`, [ydtQuestion])).rows[0]).toEqual(beforeWrongPublish)

    await client.query('BEGIN')
    try {
      for (const examRef of ['YDT','TYT','   ']) {
        const newQuestion = randomUUID()
        await client.query("SELECT public.content_governance_authorize_question_write($1,'create')", [newQuestion])
        await client.query(`INSERT INTO public.questions(
          id,game,category,difficulty,exam_ref,content,is_active
        ) VALUES($1,'wordquest','vocabulary',2,$2,$3,false)`, [
          newQuestion,examRef,{ question:'canonical',options:['A','B'],answer:0 },
        ])
        await client.query('SELECT public.content_governance_clear_question_write($1)', [newQuestion])
        expect((await client.query(
          'SELECT exam_ref FROM public.questions WHERE id=$1', [newQuestion],
        )).rows[0]).toEqual({ exam_ref:null })
      }
    } finally {
      await client.query('ROLLBACK')
    }
    expect((await client.query(`SELECT
      has_function_privilege('authenticated','public.resolve_question_curriculum_validation_scope(text,text)','EXECUTE') AS authenticated_resolver,
      has_function_privilege('service_role','public.resolve_question_curriculum_validation_scope(text,text)','EXECUTE') AS service_resolver,
      has_function_privilege('authenticated','public.question_outcome_scope_valid(uuid,uuid)','EXECUTE') AS authenticated_scope,
      has_function_privilege('service_role','public.question_outcome_scope_valid(uuid,uuid)','EXECUTE') AS service_scope`)).rows[0]).toEqual({
      authenticated_resolver:false,service_resolver:false,authenticated_scope:false,service_scope:false,
    })
  })
  it('guards old publish bodies that cross the migration commit', async () => {
    const wrongBase = (await client.query(
      'SELECT published_revision_id FROM public.questions WHERE id=$1', [ydtQuestion],
    )).rows[0].published_revision_id
    const wrongDraft = await rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)', [
      author,ydtQuestion,wrongBase,
      JSON.stringify(ydtPayload({
        examRef:'TYT',outcomes:[{ outcomeId:ydtWrongOutcome,weight:1,primary:true }],
        summary:'Self-contained pre-cutover wrong-scope fixture',
      })),randomUUID(),
    ])
    await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [
      reviewer1,wrongDraft.revisionId,1,'approved','Pre-cutover wrong stage one.',randomUUID(),
    ])
    await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [
      reviewer2,wrongDraft.revisionId,2,'approved','Pre-cutover wrong stage two.',randomUUID(),
    ])
    const wrongRevision = wrongDraft.revisionId

    const validBase = (await client.query(
      'SELECT published_revision_id FROM public.questions WHERE id=$1', [ydtLegacyNullQuestion],
    )).rows[0].published_revision_id
    const validDraft = await rpc('public.create_question_content_revision($1,$2,$3,$4::jsonb,$5)', [
      author,ydtLegacyNullQuestion,validBase,
      JSON.stringify(ydtPayload({ summary:'Valid pre-cutover publish must remain compatible' })),
      randomUUID(),
    ])
    await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [
      reviewer1,validDraft.revisionId,1,'approved','Pre-cutover valid stage one.',randomUUID(),
    ])
    await rpc('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)', [
      reviewer2,validDraft.revisionId,2,'approved','Pre-cutover valid stage two.',randomUUID(),
    ])

    const beforeWrongQuestion = (await client.query(`SELECT published_revision_id,content,exam_ref
      FROM public.questions WHERE id=$1`, [ydtQuestion])).rows[0]
    const beforeWrongMappings = (await client.query(`SELECT outcome_id,weight,is_primary,mapping_source
      FROM public.question_outcomes WHERE question_id=$1 ORDER BY outcome_id`, [ydtQuestion])).rows

    // Recreate the pre-187 publish body and remove only the new DB-boundary
    // triggers. The migration client below installs 187 while both calls are
    // already executing that old function body.
    await client.query(`
      DROP TRIGGER IF EXISTS trg_question_outcomes_split_scope_row_guard ON public.question_outcomes;
      DROP TRIGGER IF EXISTS trg_question_outcomes_split_scope_integrity ON public.question_outcomes;
      DROP TRIGGER IF EXISTS trg_questions_split_scope_integrity ON public.questions;
    `)
    await client.query(outcomeScopeMigration)
    expect((await client.query(`SELECT pg_get_functiondef(
      'public.publish_question_content_revision(uuid,uuid,uuid)'::regprocedure
    ) AS definition`)).rows[0].definition).not.toContain('active split curriculum scope')

    const blocker = new pg.Client({ connectionString:url })
    const wrongPublisher = new pg.Client({ connectionString:url })
    const validPublisher = new pg.Client({ connectionString:url })
    const migrator = new pg.Client({ connectionString:url })
    let blockerOpen = false
    let wrongPending
    let validPending
    await Promise.all([blocker.connect(),wrongPublisher.connect(),validPublisher.connect(),migrator.connect()])
    try {
      await blocker.query('BEGIN')
      blockerOpen = true
      for (const questionId of [ydtQuestion,ydtLegacyNullQuestion].sort()) {
        await blocker.query(`SELECT pg_advisory_xact_lock(
          hashtextextended('content-publish:'||$1::text,0)
        )`, [questionId])
      }
      for (const publisherClient of [wrongPublisher,validPublisher]) {
        await publisherClient.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role:'service_role' })])
        await publisherClient.query("SET ROLE service_role; SET statement_timeout='45s'")
      }
      const wrongPid = (await wrongPublisher.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      const validPid = (await validPublisher.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      const wrongRequest = randomUUID()
      const validRequest = randomUUID()
      wrongPending = wrongPublisher.query(
        'SELECT public.publish_question_content_revision($1,$2,$3) AS result',
        [publisher,wrongRevision,wrongRequest],
      ).then((result) => ({ result }), (error) => ({ error }))
      validPending = validPublisher.query(
        'SELECT public.publish_question_content_revision($1,$2,$3) AS result',
        [publisher,validDraft.revisionId,validRequest],
      ).then((result) => ({ result }), (error) => ({ error }))

      let blocked = false
      for (let attempt=0; attempt<120; attempt+=1) {
        const waits = (await client.query(`SELECT pid,wait_event_type,
          cardinality(pg_blocking_pids(pid))::integer AS blocker_count
          FROM pg_stat_activity WHERE pid=ANY($1::integer[])`, [[wrongPid,validPid]])).rows
        if (waits.length===2 && waits.every((row) => row.wait_event_type==='Lock' && row.blocker_count>0)) {
          blocked = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve,25))
      }
      expect(blocked).toBe(true)

      await migrator.query(ydtEnglishReleaseMigration)
      expect((await client.query(`SELECT tgname,tgdeferrable,tginitdeferred
        FROM pg_trigger
        WHERE tgrelid IN ('public.questions'::regclass,'public.question_outcomes'::regclass)
          AND tgname IN (
            'trg_question_outcomes_split_scope_row_guard',
            'trg_question_outcomes_split_scope_integrity',
            'trg_questions_split_scope_integrity'
          ) ORDER BY tgname`)).rows).toEqual([
        { tgname:'trg_question_outcomes_split_scope_integrity',tgdeferrable:true,tginitdeferred:true },
        { tgname:'trg_question_outcomes_split_scope_row_guard',tgdeferrable:false,tginitdeferred:false },
        { tgname:'trg_questions_split_scope_integrity',tgdeferrable:true,tginitdeferred:true },
      ])

      await blocker.query('COMMIT')
      blockerOpen = false
      const [wrongResult,validResult] = await Promise.all([wrongPending,validPending])
      expect({ code:wrongResult.error?.code,message:wrongResult.error?.message }).toEqual({
        code:'22023',message:'question outcome is outside the active split curriculum scope',
      })
      expect(validResult.error).toBeUndefined()
      expect(validResult.result?.rows[0].result).toEqual(expect.objectContaining({
        questionId:ydtLegacyNullQuestion,revisionId:validDraft.revisionId,status:'published',
      }))
      expect((await client.query(`SELECT published_revision_id,content,exam_ref
        FROM public.questions WHERE id=$1`, [ydtQuestion])).rows[0]).toEqual(beforeWrongQuestion)
      expect((await client.query(`SELECT outcome_id,weight,is_primary,mapping_source
        FROM public.question_outcomes WHERE question_id=$1 ORDER BY outcome_id`, [ydtQuestion])).rows).toEqual(beforeWrongMappings)
      expect((await client.query(
        'SELECT status FROM public.question_content_revisions WHERE id=$1', [wrongRevision],
      )).rows[0]).toEqual({ status:'stage2_approved' })
      expect((await client.query(`SELECT count(*)::integer AS count
        FROM public.content_governance_requests
        WHERE request_id=$1`, [wrongRequest])).rows[0]).toEqual({ count:0 })
      expect((await client.query(
        'SELECT public.question_active_outcome_mapping_valid($1) AS valid', [ydtLegacyNullQuestion],
      )).rows[0]).toEqual({ valid:true })
    } finally {
      if (blockerOpen) await blocker.query('ROLLBACK')
      await Promise.allSettled([wrongPending,validPending].filter(Boolean))
      await Promise.allSettled([blocker.end(),wrongPublisher.end(),validPublisher.end(),migrator.end()])
    }
  }, 30_000)
  it('reapplies the outcome-scope migration over populated governed data', async () => {
    await client.query(outcomeScopeMigration)
    expect((await client.query("SELECT convalidated FROM pg_constraint WHERE conrelid='public.questions'::regclass AND conname='questions_published_revision_question_fkey'")).rows[0]).toEqual({ convalidated:true })
    expect((await client.query("SELECT has_function_privilege('authenticated','public.set_question_revision_outcomes(uuid,uuid,jsonb,uuid)','EXECUTE') AS client_exec,has_function_privilege('service_role','public.set_question_revision_outcomes(uuid,uuid,jsonb,uuid)','EXECUTE') AS server_exec")).rows[0]).toEqual({ client_exec:false,server_exec:true })
  })
})
