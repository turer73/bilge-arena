// Isolated native fixture: real publisher, source-readiness predicate and quality trigger.
// Source report/actor validation and RBAC are fixture seams, not the full migration chain.
import {afterAll,afterEach,beforeAll,beforeEach,describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {startSourceReviewPostgres} from './helpers/isolated-source-review-postgres.mjs'
const bin=process.env.SOURCE_REVIEW_PG_BIN
if(process.env.SOURCE_REVIEW_PG_REQUIRED==='1'&&!bin) throw Error('SOURCE_REVIEW_PG_BIN required')
const suite=bin?describe:describe.skip
const read=n=>readFileSync(new URL(`../migrations/${n}`,import.meta.url),'utf8')
const migration=read('20261011203500_revision_bound_fen_quality_policy.sql')
function func(file,name){
 const text=read(file),start=text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
 if(start<0) throw Error(name)
 const tail=text.slice(start),tag=tail.match(/AS (\$[a-z_]*\$)/i)[1]
 return tail.slice(0,tail.indexOf(tag,tail.indexOf(tag)+tag.length)+tag.length)+';'
}
function table(file,name){const text=read(file),start=text.indexOf(`CREATE TABLE IF NOT EXISTS public.${name} (`);if(start<0)throw Error(name);return text.slice(start,text.indexOf('\n);',start)+3)}
suite('revision-bound Fen quality policy',()=>{
 let db,q,r,old,owner,outcomes,request,committedFixture=false
 const scalar=async(sql,values=[])=>(await db.query(sql,values)).rows[0].result
 const call=async(sql,values=[])=>{
  await db.exec('SAVEPOINT call')
  try{const v=await scalar(sql,values);await db.exec('RELEASE SAVEPOINT call');return v}
  catch(e){await db.exec('ROLLBACK TO SAVEPOINT call; RELEASE SAVEPOINT call');throw e}
 }
 const publish=()=>call('SELECT public.publish_question_content_revision($1,$2,$3) AS result',[owner,r,request])
 const context=(question=q,op='publish')=>db.query('SELECT public.content_governance_authorize_question_write($1,$2)',[question,op])
 const update=()=>call('UPDATE public.questions SET is_active=true,published_revision_id=$1 WHERE id=$2 RETURNING is_active AS result',[r,q])
 beforeAll(async()=>{
  db=await startSourceReviewPostgres(bin)
  await db.exec(`CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
   CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE TABLE public.profiles(id uuid PRIMARY KEY);
   CREATE TABLE public.questions(id uuid PRIMARY KEY,content jsonb,game text,category text,subcategory text,topic text,difficulty smallint,level_tag text,exam_ref text,is_boss boolean,is_active boolean,published_revision_id uuid);
   CREATE TABLE public.curriculum_nodes(id uuid PRIMARY KEY,parent_id uuid,node_type text,game text,category text,exam_ref text,taxonomy_version text,is_active boolean DEFAULT true);
   CREATE TABLE public.curriculum_outcomes(id uuid PRIMARY KEY,node_id uuid,game text,category text,exam_ref text,taxonomy_version text,is_active boolean DEFAULT true);
   CREATE TABLE public.curriculum_outcome_canonical_links(outcome_id uuid PRIMARY KEY,canonical_id text);
   CREATE TABLE public.curriculum_scope_releases(game text,display_exam_ref text,question_exam_ref text,release_status text,taxonomy_version text,mapping_mode text);
   INSERT INTO public.curriculum_scope_releases VALUES('fen','LGS','LGS','validating','test-v1','canonical_reviewed');
   CREATE TABLE public.question_outcomes(question_id uuid,outcome_id uuid,weight numeric,is_primary boolean,mapping_source text DEFAULT 'manual',PRIMARY KEY(question_id,outcome_id));
   CREATE TABLE public.test_permissions(allowed boolean); INSERT INTO public.test_permissions VALUES(true);
   CREATE FUNCTION public.content_governance_has_permission(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT allowed FROM public.test_permissions$$;
   CREATE TABLE public.test_source(accepted boolean); INSERT INTO public.test_source VALUES(true);
   CREATE TABLE public.question_validation_runtime(singleton boolean PRIMARY KEY,required_policy_version text,enforce_publish_gate boolean DEFAULT true);
   INSERT INTO public.question_validation_runtime(singleton,required_policy_version) VALUES(true,'question-quality@2');
   CREATE TABLE public.question_validation_decisions(revision_id uuid,question_id uuid,content_sha256 text,policy_version text,verdict text,run_id uuid DEFAULT gen_random_uuid());
   CREATE TABLE public.question_validation_runs(run_id uuid,question_id uuid,revision_id uuid,content_sha256 text,agent text,sample_index int,provider_id text,model_id text,prompt_version text,policy_version text,generation_config jsonb,generation_config_sha256 text,input_snapshot jsonb,status text,error_kind text,skip_reason text,raw_output text,parsed_output jsonb);
   CREATE FUNCTION public.question_revision_single_review_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT accepted AND EXISTS(SELECT 1 FROM public.question_validation_decisions WHERE revision_id=$1 AND verdict='APPROVED' AND policy_version='question-quality@2') FROM public.test_source$$;
   CREATE FUNCTION public.resolve_question_curriculum_validation_scope(text,text) RETURNS TABLE(taxonomy_version text,release_status text) LANGUAGE sql STABLE AS $$SELECT NULL::text,NULL::text$$;
   CREATE FUNCTION public.question_active_outcome_mapping_valid(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;`)
  for(const name of ['content_governance_runtime','content_governance_requests','question_content_revisions','question_revision_outcomes','question_revision_sources','question_revision_approvals','question_governance_events'])await db.exec(table('106_question_content_governance.sql',name))
  await db.exec('ALTER TABLE public.question_content_revisions ADD COLUMN outcomes_prepared_by uuid; INSERT INTO public.content_governance_runtime(singleton,enforce_direct_mutation) VALUES(true,true)')
  await db.exec(table('142_question_governance_write_context.sql','content_governance_write_context'))
  await db.exec('ALTER TABLE public.content_governance_write_context ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.content_governance_write_context FROM PUBLIC,anon,authenticated,service_role')
  for(const [file,names] of [
   ['106_question_content_governance.sql',['content_governance_hash','content_governance_lock_request']],
   ['142_question_governance_write_context.sql',['content_governance_authorize_question_write','content_governance_clear_question_write','tg_question_content_direct_mutation_guard']],
   ['164_question_revision_outcome_scope.sql',['curriculum_outcome_scope_valid','question_revision_outcomes_valid','lock_question_revision_outcome_scope']],
   ['220_canonical_mastery_read.sql',['sync_taxonomy_auto_question_outcomes']],
   ['096_curriculum_graph_v1.sql',['trg_sync_taxonomy_auto_question_outcomes']],
   ['217_question_source_review_single_approval.sql',['publish_question_content_revision']],
  ])for(const name of names)await db.exec(func(file,name))
  await db.exec(`REVOKE ALL ON FUNCTION public.content_governance_authorize_question_write(uuid,text),public.content_governance_clear_question_write(uuid) FROM PUBLIC,anon,authenticated,service_role;
   CREATE TRIGGER direct_guard BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.tg_question_content_direct_mutation_guard();
   CREATE TRIGGER trg_sync_taxonomy_auto_question_outcomes AFTER INSERT OR UPDATE OF game,exam_ref,category,is_active ON public.questions FOR EACH ROW EXECUTE FUNCTION public.trg_sync_taxonomy_auto_question_outcomes();`)
  await db.exec(`CREATE TABLE public.question_revision_source_reviews(id uuid DEFAULT gen_random_uuid(),revision_id uuid,reviewer_id uuid,reviewed_at timestamptz,content_sha256 text,evidence_fingerprint text,report jsonb,report_sha256 text);
   CREATE FUNCTION public.question_source_review_actor_valid(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
   CREATE FUNCTION public.question_source_review_fingerprint(uuid) RETURNS text LANGUAGE sql STABLE AS $$SELECT repeat('a',64)$$;
   CREATE FUNCTION public.question_source_report_valid(uuid,jsonb) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT accepted FROM public.test_source$$;`)
  await db.exec(func('136_question_validation_pipeline.sql','tg_require_question_validation_decision'))
  await db.exec('CREATE TRIGGER validation BEFORE UPDATE OF published_revision_id ON public.questions FOR EACH ROW EXECUTE FUNCTION public.tg_require_question_validation_decision()')
  await db.exec(migration);await db.exec(migration)
 },60000)
 afterAll(async()=>{await db?.close()})
 afterEach(async()=>{
  await db.exec('ROLLBACK')
  if(committedFixture){
   // This runtime is always a fresh, disposable local cluster, never production.
   await db.exec('TRUNCATE public.profiles,public.questions,public.question_content_revisions,public.question_validation_decisions,public.question_validation_runs,public.question_validation_revision_policies,public.question_revision_sources,public.question_revision_approvals,public.question_revision_source_reviews,public.question_revision_outcomes,public.question_outcomes,public.question_governance_events,public.content_governance_requests,public.content_governance_write_context,public.curriculum_nodes,public.curriculum_outcomes,public.curriculum_outcome_canonical_links CASCADE')
   committedFixture=false
  }
 })
 beforeEach(async()=>{
  await db.exec('BEGIN');q=randomUUID();r=randomUUID();old=randomUUID();owner=randomUUID();outcomes=[];request=randomUUID()
  await db.query('INSERT INTO public.profiles VALUES($1)',[owner])
  for(let n=0;n<2;n++){
   let parent=null
   for(const kind of ['course','unit','topic','outcome']){
    const id=randomUUID();await db.query("INSERT INTO public.curriculum_nodes(id,parent_id,node_type,game,category,exam_ref,taxonomy_version) VALUES($1,$2,$3,'fen','denklemler','LGS','test-v1')",[id,parent,kind]);parent=id
   }
   const id=randomUUID();outcomes.push(id);await db.query("INSERT INTO public.curriculum_outcomes(id,node_id,game,category,exam_ref,taxonomy_version) VALUES($1,$2,'fen','denklemler','LGS','test-v1')",[id,parent])
  }
  await db.query("INSERT INTO public.curriculum_outcome_canonical_links VALUES($1,'fixture@2018:grade9:TYT:9.3.3.4')",[outcomes[1]])
  const content={question:'Synthetic fixture',options:['a','b','c','d','e'],answer:1,solution:'b'}
  await db.query("INSERT INTO public.questions VALUES($1,$2,'fen','denklemler',NULL,NULL,2,NULL,'LGS',false,false,$3)",[q,content,old])
  for(const [id,status,base] of [[old,'published',null],[r,'stage1_approved',old]])await db.query(`INSERT INTO public.question_content_revisions(id,question_id,revision_no,base_revision_id,game,category,difficulty,exam_ref,content,content_sha256,change_kind,change_summary,status,prepared_by)
   VALUES($1,$2,$3,$4,'fen','denklemler',2,'LGS',$5,encode(extensions.digest($5::jsonb::text,'sha256'),'hex'),'edit','Synthetic fixture',$6,$7)`,[id,q,id===old?1:2,base,content,status,owner])
  await db.query('INSERT INTO public.question_revision_outcomes VALUES($1,$2,0.7,true),($1,$3,0.3,false)',[r,...outcomes])
  await db.query("INSERT INTO public.question_revision_sources(revision_id,source_kind,source_title,license_code,provenance_ref) VALUES($1,'original','Synthetic','INTERNAL','original:fixture')",[r])
  await db.query("INSERT INTO public.question_validation_decisions(revision_id,question_id,content_sha256,policy_version,verdict) SELECT id,question_id,content_sha256,'question-quality@2','APPROVED' FROM public.question_content_revisions WHERE id=$1",[r])
  await db.query(`INSERT INTO public.question_validation_runs
    SELECT d.run_id,d.question_id,d.revision_id,d.content_sha256,v.agent,v.sample,'fixture','fixture',v.prompt,'question-quality@4',
    '{"blindSamples":3}',repeat('a',64),jsonb_build_object('questionId',d.question_id,'revisionId',d.revision_id,'contentSha256',d.content_sha256),
    'ok',NULL,NULL,'{}','{}'::jsonb FROM public.question_validation_decisions d CROSS JOIN
    (VALUES ('blind_solver',0,'blind-solver@4'),('blind_solver',1,'blind-solver@4'),('blind_solver',2,'blind-solver@4'),('adversarial',0,'adversarial@3'),('solution_verifier',0,'solution-verifier@7')) v(agent,sample,prompt) WHERE d.revision_id=$1`,[r])
  await db.query("INSERT INTO public.question_revision_approvals(revision_id,stage,reviewer_id,decision,rationale,decided_at) VALUES($1,1,$2,'approved','fixture',now())",[r,owner])
  await db.query("INSERT INTO public.question_revision_source_reviews(revision_id,reviewer_id,reviewed_at,content_sha256,evidence_fingerprint,report,report_sha256) SELECT id,$2,now(),content_sha256,repeat('a',64),'{}'::jsonb,public.content_governance_hash('{}'::jsonb) FROM public.question_content_revisions WHERE id=$1",[r,owner])
 })

 const policy=()=>scalar('SELECT public.question_revision_validation_policy($1) AS result',[r])
 const ready=()=>scalar('SELECT public.question_revision_single_review_ready($1) AS result',[r])
 const v5=()=>db.query("UPDATE public.question_validation_decisions SET policy_version='question-quality@5' WHERE revision_id=$1",[r])
 const bind=()=>call(`INSERT INTO public.question_validation_revision_policies
 (revision_id,question_id,content_sha256,base_policy_version,policy_version,audit_policy_version,audit_execution,audit_code_commit,run_id,benchmark_ref,benchmark_sha256,evidence_ref,evidence_sha256,code_commit)
 SELECT r.id,r.question_id,r.content_sha256,'question-quality@2','question-quality@5','question-quality@4',
 '{"policyVersion":"question-quality@4","generationConfig":{"blindSamples":3},"generationConfigSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","providerIds":{"blind":"fixture","adversarial":"fixture","verifier":"fixture"},"modelIds":{"blind":"fixture","adversarial":"fixture","verifier":"fixture"},"promptVersions":{"blind":"blind-solver@4","adversarial":"adversarial@3","verifier":"solution-verifier@7"}}',repeat('e',40),
 d.run_id,'private/benchmark',repeat('b',64),'private/evidence',repeat('c',64),repeat('d',40)
 FROM public.question_content_revisions r JOIN public.question_validation_decisions d ON d.revision_id=r.id WHERE r.id=$1 RETURNING policy_version AS result`,[r])
 it('does not seed bindings or change the global policy',async()=>{
  expect(await scalar('SELECT count(*)::int AS result FROM public.question_validation_revision_policies')).toBe(0)
  expect(await policy()).toBe('question-quality@2');expect(await ready()).toBe(true)
 })
 const damage=[
  "DELETE FROM public.question_validation_runs WHERE agent='solution_verifier'",
  "DELETE FROM public.question_validation_runs",
  "UPDATE public.question_validation_runs SET status='failed',error_kind='transport' WHERE agent='adversarial'",
  "UPDATE public.question_validation_runs SET raw_output=NULL WHERE agent='adversarial'",
  "UPDATE public.question_validation_runs SET parsed_output='null' WHERE agent='adversarial'",
  "UPDATE public.question_validation_runs SET sample_index=0 WHERE agent='blind_solver'",
  "UPDATE public.question_validation_runs SET run_id=gen_random_uuid() WHERE agent='adversarial'",
  "UPDATE public.question_validation_runs SET revision_id=gen_random_uuid() WHERE agent='adversarial'",
  "UPDATE public.question_validation_runs SET content_sha256=repeat('f',64) WHERE agent='adversarial'",
  "UPDATE public.question_validation_runs SET provider_id='other' WHERE agent='adversarial'",
  "UPDATE public.question_validation_runs SET model_id='other' WHERE agent='adversarial'",
  "UPDATE public.question_validation_runs SET prompt_version='other' WHERE agent='adversarial'",
  "UPDATE public.question_validation_runs SET policy_version='question-quality@5' WHERE agent='adversarial'",
  "UPDATE public.question_validation_runs SET generation_config='{}' WHERE agent='adversarial'",
  "UPDATE public.question_validation_runs SET generation_config_sha256=repeat('f',64) WHERE agent='adversarial'",
  "UPDATE public.question_validation_runs SET input_snapshot='{}' WHERE agent='adversarial'",
  "INSERT INTO public.question_validation_runs SELECT * FROM public.question_validation_runs LIMIT 1",
 ]
 it.each(damage)('rejects damaged raw run at binding: %s',async(sql)=>{
  await v5();await db.exec(sql);await expect(bind()).rejects.toMatchObject({code:'22023'})
 })
 it.each(damage)('closes publication if raw run changes later: %s',async(sql)=>{
  await v5();await bind();await db.exec(sql)
  expect(await policy()).toBe(null);expect(await ready()).toBe(false)
  await expect(publish()).rejects.toMatchObject({code:'22023'})
  await context();await expect(update()).rejects.toMatchObject({code:'22023'})
 })
 it('does not permit unbound @5 to replace @2',async()=>{
  await v5();expect(await ready()).toBe(false);await expect(publish()).rejects.toMatchObject({code:'22023'})
 })
 it('publishes the exact bound @5 run and retains previous revision',async()=>{
  await v5();await bind();expect(await ready()).toBe(true)
  expect(await publish()).toMatchObject({status:'published'})
  expect(await scalar('SELECT status AS result FROM public.question_content_revisions WHERE id=$1',[old])).toBe('superseded')
  expect(await scalar('SELECT required_policy_version AS result FROM public.question_validation_runtime')).toBe('question-quality@2')
 })
 it('keeps source validation required',async()=>{
  await v5();await bind();await db.exec('UPDATE public.test_source SET accepted=false')
  expect(await ready()).toBe(false);await expect(publish()).rejects.toMatchObject({code:'22023'})
 })
 it('keeps source fingerprint required',async()=>{
  await v5();await bind();await db.exec("UPDATE public.question_revision_source_reviews SET evidence_fingerprint=repeat('e',64)")
  expect(await ready()).toBe(false);await expect(publish()).rejects.toMatchObject({code:'22023'})
 })
 it.each(['REJECTED','NEEDS_REVIEW','INCONCLUSIVE'])('rejects %s at binding creation',async(verdict)=>{
  await v5();await db.query('UPDATE public.question_validation_decisions SET verdict=$1',[verdict])
  await expect(bind()).rejects.toMatchObject({code:'22023'})
 })
 it.each(['REJECTED','NEEDS_REVIEW','INCONCLUSIVE'])('fails closed for a later %s even with legacy @2 approval',async(verdict)=>{
  await v5();await bind()
  await db.query("INSERT INTO public.question_validation_decisions(revision_id,question_id,content_sha256,policy_version,verdict) SELECT revision_id,question_id,content_sha256,'question-quality@2','APPROVED' FROM public.question_validation_decisions")
  await db.query("UPDATE public.question_validation_decisions SET verdict=$1 WHERE policy_version='question-quality@5'",[verdict])
  expect(await policy()).toBe(null);expect(await ready()).toBe(false)
  await expect(publish()).rejects.toMatchObject({code:'22023'})
 })
 it('rejects an overwritten decision from another run',async()=>{
  await v5();await bind();await db.exec('UPDATE public.question_validation_decisions SET run_id=gen_random_uuid()')
  expect(await policy()).toBe(null);await expect(publish()).rejects.toMatchObject({code:'22023'})
 })
 it('does not reuse the binding when global policy advances',async()=>{
  await v5();await bind();await db.exec("UPDATE public.question_validation_runtime SET required_policy_version='question-quality@6'")
  expect(await policy()).toBe('question-quality@6');expect(await ready()).toBe(false)
 })
 it.each(["game='matematik'","exam_ref='TYT'","status='published'"])('rejects ineligible revision %s',async(change)=>{
  await v5();await db.exec('UPDATE public.question_content_revisions SET '+change)
  await expect(bind()).rejects.toMatchObject({code:'22023'})
 })
 it.each(["enforce_publish_gate=false","required_policy_version='question-quality@3'"])('rejects runtime drift %s',async(change)=>{
  await v5();await db.exec('UPDATE public.question_validation_runtime SET '+change)
  await expect(bind()).rejects.toMatchObject({code:'22023'})
 })
 it('does not affect an unbound revision',async()=>{
  await v5();await bind()
  expect(await scalar('SELECT public.question_revision_validation_policy($1) AS result',[old])).toBe('question-quality@2')
 })
 it('does not let a stale content hash fall back to @2',async()=>{
  await v5();await bind();await db.query("UPDATE public.question_content_revisions SET content_sha256=repeat('f',64) WHERE id=$1",[r])
  expect(await policy()).toBe(null);expect(await ready()).toBe(false)
 })
 it('enforces the quality trigger even when invoked outside the publisher',async()=>{
  await v5();await bind();await db.exec("UPDATE public.question_validation_decisions SET verdict='REJECTED'")
  await context();await expect(update()).rejects.toMatchObject({code:'22023'})
 })
 it.each(['UPDATE public.question_validation_revision_policies SET benchmark_ref=benchmark_ref','DELETE FROM public.question_validation_revision_policies'])('prevents changing binding: %s',async(sql)=>{
  await v5();await bind();await expect(call(sql+' RETURNING true AS result')).rejects.toMatchObject({code:'22023'})
 })
 it.each(['anon','authenticated','service_role'])('does not allow %s to create bindings or invoke helpers',async(role)=>{
  expect(await scalar("SELECT has_table_privilege($1,'public.question_validation_revision_policies','INSERT') AS result",[role])).toBe(false)
  expect(await scalar("SELECT has_table_privilege($1,'public.question_validation_revision_policies','UPDATE') AS result",[role])).toBe(false)
  expect(await scalar("SELECT has_table_privilege($1,'public.question_validation_revision_policies','DELETE') AS result",[role])).toBe(false)
  expect(await scalar("SELECT has_function_privilege($1,'public.question_revision_validation_policy(uuid)','EXECUTE') AS result",[role])).toBe(false)
 })
 it.each(['stage1_approved','stage2_approved'])('locks decision and raw agents until %s publication commits',async(status)=>{
  await v5();await bind()
  if(status==='stage2_approved'){
   const a=randomUUID(),b=randomUUID()
   await db.query('INSERT INTO public.profiles VALUES($1),($2)',[a,b])
   await db.query('DELETE FROM public.question_revision_approvals WHERE revision_id=$1',[r])
   await db.query("INSERT INTO public.question_revision_approvals(revision_id,stage,reviewer_id,decision,rationale) VALUES($1,1,$2,'approved','fixture'),($1,2,$3,'approved','fixture')",[r,a,b])
   await db.query("UPDATE public.question_content_revisions SET status='stage2_approved' WHERE id=$1",[r])
  }
  // Commit setup so a second real connection can see these rows. The publisher
  // itself remains in a fresh transaction; setup locks cannot make this pass.
  await db.exec('COMMIT');committedFixture=true;await db.exec('BEGIN')
  expect(await publish()).toMatchObject({status:'published'})
  const port=Number((await db.query('SHOW port')).rows[0].port)
  const other=new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',connectionTimeoutMillis:3000})
  await other.connect()
  try{
   await other.query("SET lock_timeout='200ms'")
   await expect(other.query("UPDATE public.question_validation_decisions SET verdict='REJECTED' WHERE revision_id=$1",[r])).rejects.toMatchObject({code:'55P03'})
   await expect(other.query("UPDATE public.question_validation_runs SET raw_output=NULL WHERE revision_id=$1",[r])).rejects.toMatchObject({code:'55P03'})
  }finally{await other.end()}
 })
})
