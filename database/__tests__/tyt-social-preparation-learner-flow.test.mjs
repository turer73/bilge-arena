// Native disposable PostgreSQL; no production URL accepted. Real new migration,
// role tables/trigger, actor binding, declaration and content guard run here.
// Source/curriculum and RBAC dependencies are explicit fixture seams, not proof
// that actual questions have accepted academic evidence.
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { startSourceReviewPostgres } from './helpers/isolated-source-review-postgres.mjs'

const nativeBin = process.env.SOURCE_REVIEW_PG_BIN
if (process.env.SOURCE_REVIEW_PG_REQUIRED === '1' && !nativeBin) throw new Error('SOURCE_REVIEW_PG_BIN required')
const suite = nativeBin ? describe : describe.skip
const read = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
const sql = read('20261009183145_tyt_social_reviewed_preparation_pool.sql')
function func(file, name) {
  const text = read(file), start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  if (start < 0) throw new Error(name)
  const tail = text.slice(start), tag = tail.match(/AS (\$[a-z_]*\$)/i)[1]
  return tail.slice(0, tail.indexOf(tag, tail.indexOf(tag) + tag.length) + tag.length) + ';'
}
function table(name,file='205_tyt_social_candidate_policy_foundation.sql') {
  const text = read(file)
  const start = text.indexOf(`CREATE TABLE IF NOT EXISTS public.${name} (`)
  return text.slice(start, text.indexOf('\n);', start) + 3)
}
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const owner = id(900), other = id(901)
const roles = ['common_history','common_geography','common_philosophy','standard_religion','alternate_philosophy']
const categories = ['tarih','cografya','felsefe','din_kulturu','felsefe']
const policy = 'tyt-social-2027-v1'
suite('bounded preparation learner issuance through real snapshot boundary', () => {
  let db, pins, pool, prep
  const scalar = async (query, values=[]) => (await db.query(query,values)).rows[0].result
  const rpc = async (query, values=[]) => {
    await db.exec('SAVEPOINT call; SET ROLE service_role')
    try {
      const r=await scalar(`SELECT ${query} AS result`,values)
      await db.exec('RESET ROLE; RELEASE SAVEPOINT call')
      return r
    } catch (e) { await db.exec('ROLLBACK TO SAVEPOINT call; RESET ROLE; RELEASE SAVEPOINT call'); throw e }
  }
  const prepare = (items=pins, request=randomUUID(), actor=owner, p=policy, year=2027) =>
    rpc('public.prepare_tyt_social_reviewed_pool($1,$2,$3,$4::jsonb,$5,$6)',[actor,p,year,JSON.stringify(items),'Reviewed preparation candidate manifest',request])
  const check = (actor=owner) => rpc('public.get_tyt_social_preparation_pool($1,$2)',[actor,pool.poolId])
  const accept = (decl=prep,request=randomUUID(),actor=owner) =>
    rpc('public.accept_tyt_social_preparation_pool_roles($1,$2,$3,$4,$5::jsonb,$6,$7)',
      [actor,pool.poolId,pool.manifestSha256,prep.revisionEvidenceFingerprint,JSON.stringify(decl),'Accountable owner role acceptance; not independent review',request])
  beforeAll(async () => {
    db=await startSourceReviewPostgres(nativeBin)
    await db.exec(`CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role NOINHERIT;
      CREATE SCHEMA auth; CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
      CREATE TABLE profiles(id uuid PRIMARY KEY); INSERT INTO profiles VALUES('${owner}'),('${other}'),('${id(902)}');
      CREATE TABLE questions(id uuid PRIMARY KEY,published_revision_id uuid,is_active boolean,game text,exam_ref text,category text,difficulty integer,content jsonb);
      CREATE TABLE question_content_revisions(id uuid PRIMARY KEY,question_id uuid REFERENCES questions(id),content_sha256 text,content jsonb,game text,exam_ref text,category text,difficulty integer,status text,published_at timestamptz);
      CREATE TABLE content_governance_requests(user_id uuid,operation text,request_id uuid,payload_hash text,result jsonb,created_at timestamptz,PRIMARY KEY(user_id,operation,request_id));
      CREATE TABLE test_deps(permission boolean,outcomes boolean,source boolean,year_binding boolean,fingerprint text);
      INSERT INTO test_deps VALUES(true,true,true,true,repeat('a',64));
      CREATE FUNCTION content_governance_has_permission(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT permission FROM public.test_deps$$;
      CREATE FUNCTION content_governance_hash(jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT encode(extensions.digest($1::text,'sha256'),'hex')$$;
      CREATE FUNCTION content_governance_lock_request(uuid,text,uuid) RETURNS void LANGUAGE sql AS $$SELECT pg_advisory_xact_lock(hashtextextended($1::text||$2||$3::text,17))$$;
      CREATE FUNCTION lock_question_revision_outcome_scope(uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN; END$$;
      CREATE FUNCTION question_revision_outcomes_valid(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT outcomes FROM public.test_deps$$;
      CREATE FUNCTION tyt_social_revision_source_policy_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT source FROM public.test_deps$$;
      CREATE FUNCTION question_source_review_fingerprint(uuid) RETURNS text LANGUAGE sql STABLE AS $$SELECT fingerprint FROM public.test_deps$$;
      CREATE FUNCTION question_source_report_valid(uuid,jsonb) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT source FROM public.test_deps$$;
      CREATE FUNCTION question_source_curriculum_binding_valid(uuid,jsonb) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT year_binding FROM public.test_deps$$;
      CREATE TABLE question_revision_sources(revision_id uuid);
      CREATE TABLE question_revision_source_reviews(revision_id uuid,content_sha256 text,evidence_fingerprint text,report jsonb,report_sha256 text);
      CREATE TABLE curriculum_canonical_exam_scopes(canonical_id text);
      CREATE TABLE question_validation_runtime(singleton boolean,required_policy_version text,enforce_publish_gate boolean);
      INSERT INTO question_validation_runtime VALUES(true,'question-quality@2',true);
      CREATE TABLE question_validation_decisions(question_id uuid,revision_id uuid,content_sha256 text,policy_version text,verdict text);
    `)
    await db.exec(`CREATE TABLE verified_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES profiles(id),game text,mode text,question_ids uuid[],duration_sec integer,started_at timestamptz,expires_at timestamptz,completed_at timestamptz,session_id uuid,UNIQUE(id,user_id));
      CREATE TABLE daily_plan(id uuid PRIMARY KEY,user_id uuid,question_ids uuid[]);
      CREATE TABLE daily_plan_candidate_policy_snapshots(plan_id uuid,user_id uuid,policy_version text,variant_code text,selection_event_id uuid);
      CREATE TABLE curriculum_scope_releases(game text,display_exam_ref text,question_exam_ref text,taxonomy_version text,release_status text);
      CREATE TABLE question_revision_outcomes(revision_id uuid);
      CREATE TABLE curriculum_outcomes(id uuid);
      CREATE TABLE curriculum_nodes(id uuid);
      ALTER TABLE question_content_revisions ADD COLUMN subcategory text,ADD COLUMN topic text,ADD COLUMN level_tag text;
      CREATE UNIQUE INDEX question_content_revisions_id_question_uidx ON question_content_revisions(id,question_id);`)
    for(const name of ['exam_candidate_policy_versions','question_revision_exam_role_candidates','question_revision_exam_role_reviews','question_revision_exam_roles']) await db.exec(table(name))
    await db.exec(`CREATE UNIQUE INDEX question_revision_exam_role_candidate_open_uidx ON question_revision_exam_role_candidates(policy_version,revision_id) WHERE status IN ('pending','stage1_approved','approved')`)
    for(const [file,name] of [
      ['166_question_outcome_mapping_candidates.sql','question_outcome_mapping_actor_has_aal2'],
      ['221_formal_tyt_social_scope.sql','tyt_social_exam_role_compatible'],
      ['205_tyt_social_candidate_policy_foundation.sql','tg_tyt_social_append_only'],
      ['205_tyt_social_candidate_policy_foundation.sql','tg_assert_tyt_social_exam_role_approval'],
      ['205_tyt_social_candidate_policy_foundation.sql','tg_exam_candidate_policy_version_guard'],
      ['20261008200746_question_source_ai_owner_acceptance.sql','question_ai_preparation_declaration_valid'],
      ['20261009063101_question_content_exam_option_guard.sql','question_content_basic_guard_for_exam'],
    ]) await db.exec(func(file,name))
    for(const name of ['exam_candidate_policy_variants','candidate_exam_policy_events','verified_attempt_candidate_policy_snapshots','verified_attempt_question_exam_role_snapshots','tyt_social_policy_capabilities']) await db.exec(table(name))
    await db.exec(table('verified_attempt_question_revisions','106_question_content_governance.sql'))
    for(const name of ['trg_snapshot_verified_attempt_revisions','verified_attempt_private_snapshot']) await db.exec(func('106_question_content_governance.sql',name))
    for(const name of ['assert_tyt_social_attempt_snapshot_integrity','tg_assert_tyt_social_attempt_snapshot_integrity','issue_verified_tyt_social_attempt_with_event','tg_guard_tyt_social_attempt_parent_update']) await db.exec(func('206_tyt_social_snapshot_issuance_boundary.sql',name))
    await db.exec(`CREATE TRIGGER snapshot_attempt AFTER INSERT ON verified_attempts FOR EACH ROW EXECUTE FUNCTION trg_snapshot_verified_attempt_revisions();
      CREATE CONSTRAINT TRIGGER snapshot_integrity AFTER INSERT ON verified_attempts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tg_assert_tyt_social_attempt_snapshot_integrity();
      CREATE TRIGGER snapshot_parent BEFORE UPDATE ON verified_attempts FOR EACH ROW EXECUTE FUNCTION tg_guard_tyt_social_attempt_parent_update();
      REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated,service_role;`)
    await db.exec(sql)
    const flow=read('20261010050615_tyt_social_preparation_learner_flow.sql')
    await db.exec(flow); await db.exec(flow)
    await db.exec(`CREATE CONSTRAINT TRIGGER trg_tyt_social_exam_role_approval AFTER INSERT OR UPDATE ON question_revision_exam_roles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tg_assert_tyt_social_exam_role_approval();
      CREATE TRIGGER trg_exam_candidate_policy_version_guard BEFORE INSERT OR UPDATE ON exam_candidate_policy_versions FOR EACH ROW EXECUTE FUNCTION tg_exam_candidate_policy_version_guard();
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated,service_role;`)
  },60000)
  beforeEach(async () => {
    await db.exec('BEGIN')
    await db.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:owner,aal:'aal2',role:'authenticated'})])
    const rules={purpose:'reviewed_preparation',targetExamYear:2027,officialExamCertification:false,wholeCurriculumMeasurement:false,candidateQuestionCount:20,bookletQuestionCount:25,roleAcceptance:'ai_assisted_owner',privacy:{storeReason:false,storeReligion:false,storeDocument:false}}
    await db.query(`INSERT INTO exam_candidate_policy_versions(policy_version,game,display_exam_ref,question_exam_ref,taxonomy_version,valid_from,valid_until,status,rules,rules_sha256,official_source_url)
      VALUES($1,'sosyal','TYT','TYT','ba-tyt-sosyal-v1',current_date-1,current_date+1,'validating',$2,content_governance_hash($2),'https://example.test/historical-format')`,[policy,rules])
    await db.query(`INSERT INTO exam_candidate_policy_variants(policy_version,variant_code,question_range,allowed_roles) VALUES
      ($1,'questions_16_20','[16,21)',ARRAY['common_history','common_geography','common_philosophy','standard_religion']),
      ($1,'questions_21_25','[21,26)',ARRAY['common_history','common_geography','common_philosophy','alternate_philosophy'])`,[policy])
    pins=[]
    for(let n=1;n<=25;n++){
      const content={question:`Synthetic fixture question ${n}?`,options:['one','two','three','four','five'],answer:1,solution:'Synthetic answer explanation.'}
      const hash=await scalar('SELECT content_governance_hash($1::jsonb) AS result',[JSON.stringify(content)])
      await db.query(`INSERT INTO questions VALUES($1,$2,true,'sosyal','TYT',$3,3,$4)`,[id(n),id(n+100),categories[Math.floor((n-1)/5)],content])
      await db.query(`INSERT INTO question_content_revisions(id,question_id,content_sha256,content,game,exam_ref,category,difficulty,status,published_at) VALUES($1,$2,$3,$4,'sosyal','TYT',$5,3,'published',now())`,[id(n+100),id(n),hash,content,categories[Math.floor((n-1)/5)]])
      const report={format:'source-comparison@2',curriculumBinding:{examRef:'TYT',examYear:2027}}
      await db.query(`INSERT INTO question_revision_source_reviews VALUES($1,$2,repeat('a',64),$3,content_governance_hash($3))`,[id(n+100),hash,report])
      await db.query(`INSERT INTO question_validation_decisions VALUES($1,$2,$3,'question-quality@2','APPROVED')`,[id(n),id(n+100),hash])
      pins.push({questionId:id(n),revisionId:id(n+100),contentSha256:hash,examRole:roles[Math.floor((n-1)/5)]})
    }
    pool=await prepare()
    const c=await check()
    prep={version:'ai-preparation-declaration@1',agent:'Synthetic fixture agent',evidenceRef:'fixture:review-report',evidenceSha256:'b'.repeat(64),revisionEvidenceFingerprint:c.evidenceFingerprint,acknowledgesNonIndependentReview:true,acceptsResponsibility:true}
  })
  afterEach(async()=>{await db.exec('ROLLBACK')})
  afterAll(async()=>{await db?.close()})

  const release=(request=randomUUID())=>rpc('public.release_tyt_social_preparation_pool($1,$2,$3,$4,$5)',[owner,pool.poolId,pool.manifestSha256,'Bounded reviewed preparation; no official certification',request])
  const context=()=>rpc('public.get_tyt_social_preparation_context($1)',[owner])
  const issue=(variant='questions_16_20',request=randomUUID(),actor=owner)=>rpc('public.compose_and_issue_tyt_social_preparation($1,$2,$3)',[actor,variant,request])
  const ready=async()=>{await accept();await release()}
  it('stays unavailable until role acceptance AND explicit release',async()=>{
    expect(await context()).toEqual({available:false});await accept()
    expect(await context()).toEqual({available:false});await release()
    expect(await context()).toMatchObject({available:true,examYear:2027,candidateQuestionCount:20,officialExamCertification:false})
  })
  it('cannot release without evidence and does not auto-publish or accept roles',async()=>{
    await expect(release()).rejects.toMatchObject({code:'55000'})
    expect(await scalar('SELECT count(*)::int AS result FROM question_revision_exam_roles')).toBe(0)
  })
  it('replays exact release without duplicate activation',async()=>{
    await accept();const request=randomUUID();await release(request)
    expect((await release(request)).replayed).toBe(true)
    expect(await scalar('SELECT count(*)::int AS result FROM tyt_social_policy_capabilities')).toBe(1)
  })
  for(const variant of ['questions_16_20','questions_21_25'])it('issues exact pinned 20 with private snapshots: '+variant,async()=>{
    await ready();const r=await issue(variant);expect(r.snapshot.items).toHaveLength(20)
    expect(r).toMatchObject({artifactKind:'practice',composerVersion:'tyt-social-preparation-v1',examYear:2027,replayed:false})
    const last=variant==='questions_16_20'?'standard_religion':'alternate_philosophy'
    const counts=(await db.query('SELECT exam_role,count(*)::int n FROM verified_attempt_question_exam_role_snapshots GROUP BY exam_role')).rows
    expect(Object.fromEntries(counts.map(x=>[x.exam_role,x.n]))).toEqual({common_history:5,common_geography:5,common_philosophy:5,[last]:5})
    expect(r.snapshot.items.every((x,n)=>x.position===n+1 && x.correctOption===1 && x.content.answer===1)).toBe(true)
    await db.exec('SET CONSTRAINTS ALL IMMEDIATE')
  })
  it('same request produces one attempt; changed variant is rejected',async()=>{
    await ready();const key=randomUUID(),a=await issue('questions_16_20',key),b=await issue('questions_16_20',key)
    expect(a.attemptId).toBe(b.attemptId);expect(b.replayed).toBe(true)
    await expect(issue('questions_21_25',key)).rejects.toMatchObject({code:'22023'})
    expect(await scalar('SELECT count(*)::int AS result FROM verified_attempts')).toBe(1)
  })
  it('later quarantine stops new issuance but preserves existing snapshot replay',async()=>{
    await ready();const key=randomUUID(),a=await issue('questions_16_20',key)
    await db.exec("UPDATE questions SET is_active=false WHERE id='"+id(1)+"'")
    expect(await context()).toEqual({available:false})
    await expect(issue()).rejects.toMatchObject({code:'55000'})
    const b=await issue('questions_16_20',key);expect(b.snapshot).toEqual(a.snapshot)
    await db.exec('SET CONSTRAINTS ALL IMMEDIATE')
  })
  it('permission drift in executable boundary closes new issuance',async()=>{
    await ready();await db.exec('GRANT EXECUTE ON FUNCTION verified_attempt_private_snapshot(uuid) TO authenticated')
    expect(await context()).toEqual({available:false})
    await expect(issue()).rejects.toMatchObject({code:'55000'})
  })
  it('snapshot function drift invalidates the exact capability receipt',async()=>{
    await ready();await db.exec("CREATE OR REPLACE FUNCTION verified_attempt_private_snapshot(p_attempt_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT '{}'::jsonb$$")
    expect(await context()).toEqual({available:false})
  })
  for(const [name,sql] of [
    ['quality withdrawal',"UPDATE question_validation_decisions SET verdict='NEEDS_REVIEW'"],
    ['source withdrawn','UPDATE test_deps SET source=false'],
    ['year withdrawn','UPDATE test_deps SET year_binding=false'],
    ['role missing','DELETE FROM question_revision_exam_roles'],
    ['wrong variant range',"UPDATE exam_candidate_policy_variants SET question_range='[15,20)' WHERE variant_code='questions_16_20'"],
    ['quality gate disabled','UPDATE question_validation_runtime SET enforce_publish_gate=false']
  ])it('fails closed: '+name,async()=>{await ready();await db.exec(sql);expect(await context()).toEqual({available:false});await expect(issue()).rejects.toMatchObject({code:'55000'});expect(await scalar('SELECT count(*)::int AS result FROM verified_attempts')).toBe(0)})
  it('official resolver ignores the released preparation policy',async()=>{
    await ready();expect(await scalar('SELECT count(*)::int AS result FROM resolve_current_tyt_social_candidate_policy()')).toBe(0)
    await db.exec("INSERT INTO exam_candidate_policy_versions(policy_version,game,display_exam_ref,question_exam_ref,taxonomy_version,valid_from,valid_until,status,rules,rules_sha256,official_source_url,released_at) VALUES('tyt-social-2026-v1','sosyal','TYT','TYT','ba-tyt-sosyal-v1',current_date-1,current_date+1,'released','{}',content_governance_hash('{}'),'https://example.test/official',now())")
    expect(await scalar('SELECT policy_version AS result FROM resolve_current_tyt_social_candidate_policy()')).toBe('tyt-social-2026-v1')
  })
  it('limits branch changes without recording a religion/reason/document',async()=>{
    await ready();await issue()
    await expect(issue('questions_21_25')).rejects.toMatchObject({code:'55000'})
    expect(await scalar('SELECT count(*)::int AS result FROM candidate_exam_policy_events')).toBe(1)
  })
  it('binds cookie actor and exposes no direct client or private issuer privilege',async()=>{
    await ready();await expect(issue('questions_16_20',randomUUID(),other)).rejects.toMatchObject({code:'22023'})
    for(const role of ['anon','authenticated'])for(const signature of ['get_tyt_social_preparation_context(uuid)','compose_and_issue_tyt_social_preparation(uuid,text,uuid)','release_tyt_social_preparation_pool(uuid,uuid,text,text,uuid)']){
      expect(await scalar("SELECT has_function_privilege($1,$2,'EXECUTE') AS result",[role,signature])).toBe(false)
    }
    expect(await scalar("SELECT has_function_privilege('service_role','issue_verified_tyt_social_attempt_with_event(uuid,text,uuid[],integer,uuid,text,uuid,text,uuid)','EXECUTE') AS result")).toBe(false)
  })
})
