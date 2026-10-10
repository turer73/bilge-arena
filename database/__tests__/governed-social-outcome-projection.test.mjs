// Disposable native PostgreSQL. Real 217 publisher, 142 private write context,
// 164 revision outcome validator and 220 legacy auto mapper. RBAC and source
// acceptance are explicit fixture seams; this is not the complete DB chain.
import {afterAll,afterEach,beforeAll,beforeEach,describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {startSourceReviewPostgres} from './helpers/isolated-source-review-postgres.mjs'
const bin=process.env.SOURCE_REVIEW_PG_BIN
if(process.env.SOURCE_REVIEW_PG_REQUIRED==='1'&&!bin) throw Error('SOURCE_REVIEW_PG_BIN required')
const suite=bin?describe:describe.skip
const read=n=>readFileSync(new URL(`../migrations/${n}`,import.meta.url),'utf8')
const migration=read('20261010045907_governed_social_outcome_projection.sql')
function func(file,name){
 const text=read(file),start=text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
 if(start<0) throw Error(name)
 const tail=text.slice(start),tag=tail.match(/AS (\$[a-z_]*\$)/i)[1]
 return tail.slice(0,tail.indexOf(tag,tail.indexOf(tag)+tag.length)+tag.length)+';'
}
function table(file,name){const text=read(file),start=text.indexOf(`CREATE TABLE IF NOT EXISTS public.${name} (`);if(start<0)throw Error(name);return text.slice(start,text.indexOf('\n);',start)+3)}
suite('private-context Social publication keeps exact reviewed outcomes',()=>{
 let db,q,r,old,owner,outcomes,request
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
   CREATE TABLE public.curriculum_scope_releases(game text,display_exam_ref text,question_exam_ref text,release_status text,taxonomy_version text,mapping_mode text);
   INSERT INTO public.curriculum_scope_releases VALUES('sosyal','TYT','TYT','validating','test-v1','taxonomy_auto');
   CREATE TABLE public.question_outcomes(question_id uuid,outcome_id uuid,weight numeric,is_primary boolean,mapping_source text DEFAULT 'manual',PRIMARY KEY(question_id,outcome_id));
   CREATE TABLE public.test_permissions(allowed boolean); INSERT INTO public.test_permissions VALUES(true);
   CREATE FUNCTION public.content_governance_has_permission(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT allowed FROM public.test_permissions$$;
   CREATE TABLE public.test_source(accepted boolean); INSERT INTO public.test_source VALUES(true);
   CREATE TABLE public.question_validation_runtime(singleton boolean PRIMARY KEY,required_policy_version text);
   INSERT INTO public.question_validation_runtime VALUES(true,'question-quality@2');
   CREATE TABLE public.question_validation_decisions(revision_id uuid,question_id uuid,content_sha256 text,policy_version text,verdict text);
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
  await db.exec(migration);await db.exec(migration)
 },60000)
 afterAll(async()=>{await db?.close()})
 afterEach(async()=>{await db.exec('ROLLBACK')})
 beforeEach(async()=>{
  await db.exec('BEGIN');q=randomUUID();r=randomUUID();old=randomUUID();owner=randomUUID();outcomes=[];request=randomUUID()
  await db.query('INSERT INTO public.profiles VALUES($1)',[owner])
  for(let n=0;n<2;n++){
   let parent=null
   for(const kind of ['course','unit','topic','outcome']){
    const id=randomUUID();await db.query("INSERT INTO public.curriculum_nodes(id,parent_id,node_type,game,category,exam_ref,taxonomy_version) VALUES($1,$2,$3,'sosyal','din_kulturu','TYT','test-v1')",[id,parent,kind]);parent=id
   }
   const id=randomUUID();outcomes.push(id);await db.query("INSERT INTO public.curriculum_outcomes(id,node_id,game,category,exam_ref,taxonomy_version) VALUES($1,$2,'sosyal','din_kulturu','TYT','test-v1')",[id,parent])
  }
  const content={question:'Synthetic fixture',options:['a','b','c','d','e'],answer:1,solution:'b'}
  await db.query("INSERT INTO public.questions VALUES($1,$2,'sosyal','din_kulturu',NULL,NULL,2,NULL,'TYT',false,false,$3)",[q,content,old])
  for(const [id,status,base] of [[old,'published',null],[r,'stage1_approved',old]])await db.query(`INSERT INTO public.question_content_revisions(id,question_id,revision_no,base_revision_id,game,category,difficulty,exam_ref,content,content_sha256,change_kind,change_summary,status,prepared_by)
   VALUES($1,$2,$3,$4,'sosyal','din_kulturu',2,'TYT',$5,encode(extensions.digest($5::jsonb::text,'sha256'),'hex'),'edit','Synthetic fixture',$6,$7)`,[id,q,id===old?1:2,base,content,status,owner])
  await db.query('INSERT INTO public.question_revision_outcomes VALUES($1,$2,0.7,true),($1,$3,0.3,false)',[r,...outcomes])
  await db.query("INSERT INTO public.question_revision_sources(revision_id,source_kind,source_title,license_code) VALUES($1,'original','Synthetic','INTERNAL')",[r])
  await db.query("INSERT INTO public.question_validation_decisions SELECT id,question_id,content_sha256,'question-quality@2','APPROVED' FROM public.question_content_revisions WHERE id=$1",[r])
 })
 it('reproduces old publication failure and passes with exact two-outcome projection',async()=>{
  await db.exec(func('096_curriculum_graph_v1.sql','trg_sync_taxonomy_auto_question_outcomes'))
  await expect(publish()).rejects.toMatchObject({code:'22023',message:expect.stringContaining('not uniquely mapped')})
  expect(await scalar('SELECT count(*)::int AS result FROM public.question_governance_events')).toBe(0)
  // Function only, so the test transaction is not committed by migration BEGIN/COMMIT.
  await db.exec(func('20261010045907_governed_social_outcome_projection.sql','trg_sync_taxonomy_auto_question_outcomes'))
  expect(await publish()).toMatchObject({status:'published',replayed:false})
  expect(await scalar('SELECT count(*)::int AS result FROM public.question_outcomes WHERE question_id=$1',[q])).toBe(2)
  expect(await scalar("SELECT bool_and(mapping_source='manual') AS result FROM public.question_outcomes")).toBe(true)
  expect(await scalar('SELECT status AS result FROM public.question_content_revisions WHERE id=$1',[old])).toBe('superseded')
  expect(await scalar('SELECT count(*)::int AS result FROM public.content_governance_write_context')).toBe(0)
  expect(await publish()).toMatchObject({replayed:true})
 })
 it.each(['source','quality','permission','outcomes'])('does not bypass missing %s',async kind=>{
  if(kind==='source')await db.exec('UPDATE public.test_source SET accepted=false')
  if(kind==='quality')await db.exec("UPDATE public.question_validation_decisions SET verdict='REJECTED'")
  if(kind==='permission')await db.exec('UPDATE public.test_permissions SET allowed=false')
  if(kind==='outcomes')await db.exec('UPDATE public.curriculum_outcomes SET is_active=false')
  await expect(publish()).rejects.toThrow()
  expect(await scalar('SELECT published_revision_id AS result FROM public.questions WHERE id=$1',[q])).toBe(old)
 })
 it('does not accept forged GUC context or ungoverned activation',async()=>{
  await db.exec("SET LOCAL app.content_governance_write='publish'")
  await expect(update()).rejects.toMatchObject({code:'42501'})
  await db.exec('UPDATE public.content_governance_runtime SET enforce_direct_mutation=false')
  await expect(update()).rejects.toMatchObject({code:'22023'})
 })
 it.each(['pid','transaction','question','operation'])('binds private context to %s',async field=>{
  await context();await db.exec('UPDATE public.content_governance_runtime SET enforce_direct_mutation=false')
  const patches={pid:'backend_pid=backend_pid+1',transaction:'transaction_id=transaction_id+1',question:"question_id='00000000-0000-4000-8000-000000000001'",operation:"operation='quarantine'"}
  await db.exec('UPDATE public.content_governance_write_context SET '+patches[field]);await expect(update()).rejects.toMatchObject({code:'22023'})
 })
 it.each(['draft','hash','content','category','outcomes'])('rejects mismatched approved revision %s even with private context',async field=>{
  await context()
  const patches={draft:"status='draft'",hash:"content_sha256=repeat('a',64)",content:"content=jsonb_set(content,'{question}','\"changed\"')",category:"category='tarih'"}
  if(field==='outcomes')await db.exec('UPDATE public.curriculum_outcomes SET is_active=false')
  else await db.query('UPDATE public.question_content_revisions SET '+patches[field]+' WHERE id=$1',[r])
  await expect(update()).rejects.toMatchObject({code:'23514'})
 })
 it('keeps quarantine taxonomy cleanup and manual mappings',async()=>{
  await db.query("INSERT INTO public.question_outcomes VALUES($1,$2,1,true,'taxonomy_auto'),($1,$3,0.3,false,'manual')",[q,...outcomes])
  await context(q,'quarantine');await db.query('UPDATE public.questions SET is_active=false WHERE id=$1',[q])
  expect(await scalar('SELECT count(*)::int AS result FROM public.question_outcomes')).toBe(1)
  expect(await scalar('SELECT mapping_source AS result FROM public.question_outcomes')).toBe('manual')
 })
 it.each(['anon','authenticated','service_role'])('keeps context and trigger inaccessible to %s',async role=>{
  expect(await scalar("SELECT has_function_privilege($1,'public.trg_sync_taxonomy_auto_question_outcomes()','EXECUTE') AS result",[role])).toBe(false)
  expect(await scalar("SELECT has_function_privilege($1,'public.content_governance_authorize_question_write(uuid,text)','EXECUTE') AS result",[role])).toBe(false)
  expect(await scalar("SELECT has_table_privilege($1,'public.content_governance_write_context','INSERT') AS result",[role])).toBe(false)
 })
})
