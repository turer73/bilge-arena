import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { startSourceReviewPostgres } from './helpers/isolated-source-review-postgres.mjs'

// Isolated optional PostgreSQL WASM engine, never a production database.
// npm install --prefix secure/sql-test-runtime --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.5.8
const runtime = resolve(process.env.PGLITE_RUNTIME_PATH ?? 'secure/sql-test-runtime/node_modules/@electric-sql/pglite/dist')
const nativeBin = process.env.SOURCE_REVIEW_PG_BIN
if (process.env.SOURCE_REVIEW_PG_REQUIRED === '1' && !nativeBin) throw new Error('SOURCE_REVIEW_PG_BIN is required; native acceptance may not skip')
const suite = nativeBin || existsSync(resolve(runtime, 'index.js')) ? describe : describe.skip
const migration = name => readFileSync(resolve('database/migrations', name), 'utf8')
const base = migration('106_question_content_governance.sql')
const scope = migration('164_question_revision_outcome_scope.sql')
const sql217 = migration('217_question_source_review_single_approval.sql')
const sql219 = migration('219_curriculum_canonical_identity.sql')
const sqlV2 = migration('20261008183619_question_source_curriculum_v2.sql')
const sqlAiOwner = migration('20261008200746_question_source_ai_owner_acceptance.sql')
const sqlExceptions = migration('20261009200000_question_source_evidence_exceptions.sql')
const basicGuard = migration('079_questions_content_basic_guard.sql')
const examGuard = migration('20261009063101_question_content_exam_option_guard.sql')
function sqlFunction(sql, name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  if (start < 0) throw new Error('Missing function ' + name)
  const tail = sql.slice(start)
  const tag = tail.match(/AS (\$[a-z_]*\$)/i)?.[1]
  if (!tag) throw new Error('Missing dollar quote ' + name)
  return tail.slice(0, tail.indexOf(tag, tail.indexOf(tag) + tag.length) + tag.length) + ';'
}
function table(name) {
  const start = base.indexOf(`CREATE TABLE IF NOT EXISTS public.${name} (`)
  return base.slice(start, base.indexOf('\n);', start) + 3)
}

suite(`217/219/v2 source review PostgreSQL ${nativeBin ? 'native' : 'WASM'} acceptance (isolated fixture)`, () => {
  let db, qid, rid, oldRid, author, reviewer, reviewer2, publisher, outcome, report
  const scalar = async (sql, values = []) => (await db.query(sql, values)).rows[0].result
  const rpc = async (sql, values = []) => {
    await db.exec('SAVEPOINT rpc_call')
    await db.exec('SET ROLE service_role')
    try {
      const result = await scalar(`SELECT ${sql} AS result`, values)
      await db.exec('RESET ROLE; RELEASE SAVEPOINT rpc_call')
      return result
    } catch (error) {
      await db.exec('ROLLBACK TO SAVEPOINT rpc_call; RESET ROLE; RELEASE SAVEPOINT rpc_call')
      throw error
    }
  }
  const accept = (input = report, user = reviewer, request = randomUUID(), rationale = 'Sources and each option inspected') =>
    rpc('public.accept_question_revision_source_review($1,$2,$3::jsonb,$4,$5)', [user,rid,JSON.stringify(input),rationale,request])
  const publish = () => rpc('public.publish_question_content_revision($1,$2,$3)', [publisher,rid,randomUUID()])
  const status = () => rpc('public.get_question_revision_source_review($1,$2)', [reviewer,rid])
  const decision = () => db.query("INSERT INTO public.question_validation_decisions VALUES($1,$2,$3,'question-quality@2','APPROVED')", [rid,qid,'a'.repeat(64)])
  const invalidReport = async input => {
    expect(await scalar('SELECT public.question_source_report_valid($1,$2::jsonb) AS result', [rid,JSON.stringify(input)])).toBe(false)
    await expect(accept(input)).rejects.toMatchObject({ code:'22023' })
    expect(await scalar('SELECT count(*)::int AS result FROM public.question_revision_approvals')).toBe(0)
  }
  beforeAll(async () => {
    if (nativeBin) db = await startSourceReviewPostgres(nativeBin)
    else {
      const { PGlite } = await import(pathToFileURL(resolve(runtime, 'index.js')).href)
      const { pgcrypto } = await import(pathToFileURL(resolve(runtime, 'contrib/pgcrypto.js')).href)
      db = new PGlite({ extensions: { pgcrypto } })
    }
    await db.exec(`CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
      GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY);
      CREATE TABLE public.fixture_permissions(user_id uuid,permission text);
      CREATE FUNCTION public.has_permission(uuid,text) RETURNS boolean LANGUAGE sql AS $$
        SELECT EXISTS(SELECT 1 FROM public.fixture_permissions WHERE user_id=$1 AND permission=$2) $$;
      CREATE TABLE public.curriculum_nodes(id uuid PRIMARY KEY,parent_id uuid,node_type text,game text,category text,exam_ref text,taxonomy_version text,is_active boolean DEFAULT true);
      CREATE TABLE public.curriculum_outcomes(id uuid PRIMARY KEY,node_id uuid,game text,category text,exam_ref text,taxonomy_version text,is_active boolean DEFAULT true,title text DEFAULT 'Fixture',code text DEFAULT 'F.1');
      CREATE TABLE public.questions(id uuid PRIMARY KEY,content jsonb,game text,category text,subcategory text,topic text,difficulty smallint,level_tag text,exam_ref text,is_boss boolean,is_active boolean,published_revision_id uuid);
      CREATE TABLE public.question_outcomes(question_id uuid,outcome_id uuid,weight numeric,is_primary boolean);`)
    for (const name of ['content_governance_requests','question_content_revisions','question_revision_sources','question_revision_approvals','question_revision_outcomes','question_governance_events']) await db.exec(table(name))
    await db.exec('ALTER TABLE public.question_content_revisions ADD COLUMN outcomes_prepared_by uuid;')
    for (const name of ['content_governance_hash','content_governance_lock_request','content_governance_has_permission']) await db.exec(sqlFunction(base,name))
    for (const name of ['curriculum_outcome_scope_valid','question_revision_outcomes_valid','lock_question_revision_outcome_scope','review_question_content_revision']) await db.exec(sqlFunction(scope,name))
    // The unchanged publisher's existing write-context + split-reader implementations
    // are exercised by the native governance suite, not replaced in production.
    await db.exec(`CREATE FUNCTION public.content_governance_authorize_question_write(uuid,text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
      CREATE FUNCTION public.content_governance_clear_question_write(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
      CREATE FUNCTION public.resolve_question_curriculum_validation_scope(text,text) RETURNS TABLE(taxonomy_version text,release_status text) LANGUAGE sql AS $$ SELECT NULL::text,NULL::text $$;
      CREATE FUNCTION public.question_active_outcome_mapping_valid(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE TABLE public.question_validation_runtime(singleton boolean PRIMARY KEY,required_policy_version text);
      CREATE TABLE public.question_validation_decisions(revision_id uuid,question_id uuid,content_sha256 text,policy_version text,verdict text);
      GRANT EXECUTE ON FUNCTION public.review_question_content_revision(uuid,uuid,smallint,text,text,uuid) TO service_role;`)
    await db.exec(sql217)
    await db.exec(sql219)
    await db.exec(sqlV2)
    await db.exec(sqlAiOwner)
    await db.exec(sqlFunction(migration('166_question_outcome_mapping_candidates.sql'),'question_outcome_mapping_actor_has_aal2'))
    await db.exec(sqlExceptions)
    // Publication must exercise the real table trigger, not just source/quality gates.
    await db.exec(basicGuard)
    await db.exec(examGuard)
    await db.exec('REVOKE ALL ON FUNCTION public.publish_question_content_revision(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.publish_question_content_revision(uuid,uuid,uuid) TO service_role;')
  }, 60_000)
  afterAll(async () => { await db?.close() })
  afterEach(async () => { await db.exec('ROLLBACK') })
  beforeEach(async () => {
    await db.exec('BEGIN') // Roll back each fixture; append-only evidence is never deleted.
    qid=randomUUID(); rid=randomUUID(); oldRid=randomUUID(); author=randomUUID(); reviewer=randomUUID(); reviewer2=randomUUID(); publisher=randomUUID(); outcome=randomUUID()
    for (const id of [author,reviewer,reviewer2,publisher]) await db.query('INSERT INTO public.profiles VALUES($1)',[id])
    for (const [id,perm] of [[author,'content.review.stage1'],[reviewer,'content.review.stage1'],[reviewer2,'content.review.stage2'],[publisher,'content.publish']]) await db.query('INSERT INTO public.fixture_permissions VALUES($1,$2)',[id,perm])
    let parent=null
    for (const kind of ['course','unit','topic','outcome']) {
      const id=randomUUID()
      await db.query("INSERT INTO public.curriculum_nodes(id,parent_id,node_type,game,category,exam_ref,taxonomy_version) VALUES($1,$2,$3,'sosyal','tarih','TYT','fixture-v1')", [id,parent,kind]); parent=id
    }
    await db.query("INSERT INTO public.curriculum_outcomes(id,node_id,game,category,exam_ref,taxonomy_version) VALUES($1,$2,'sosyal','tarih','TYT','fixture-v1')", [outcome,parent])
    const content={question:'TEST ONLY: 2+3?',options:['3','4','5','6','7'],answer:2,solution:'2+3=5'}
    await db.query("INSERT INTO public.questions VALUES($1,$2,'sosyal','tarih',NULL,NULL,2,NULL,'TYT',false,true,$3)",[qid,JSON.stringify(content),oldRid])
    for (const [id,baseId,state] of [[oldRid,null,'published'],[rid,oldRid,'draft']]) await db.query(`INSERT INTO public.question_content_revisions
      (id,question_id,revision_no,base_revision_id,game,category,difficulty,exam_ref,content,content_sha256,change_kind,change_summary,status,prepared_by,published_at)
      VALUES($1,$2,$3,$4,'sosyal','tarih',2,'TYT',$5,$6,'edit','Fixture only',$7,$8,CASE WHEN $7='published' THEN clock_timestamp() ELSE NULL END)`,[id,qid,id===rid?2:1,baseId,JSON.stringify(content),'a'.repeat(64),state,author])
    await db.query("INSERT INTO public.question_revision_sources(revision_id,source_kind,source_title,license_code,provenance_ref) VALUES($1,'original','Fixture own content','INTERNAL','fixture:original')",[rid])
    await db.query('INSERT INTO public.question_revision_outcomes VALUES($1,$2,1,true)',[rid,outcome])
    await db.exec("INSERT INTO public.question_validation_runtime VALUES(true,'question-quality@2')")
    report={format:'source-comparison@1',questionId:qid,revisionId:rid,contentSha256:'a'.repeat(64),
      sources:[0,1].map(i=>({id:'s'+i,title:'TEST FIXTURE',institutionOrAuthor:'Fixture '+i,editionOrDate:'2026',language:'tr',kind:i===0?'official_curriculum':'textbook',url:'https://example.org/book'+i,workId:'w'+i,independenceGroup:'g'+i,independenceRationale:'Fixture',access:'inspected_section',locator:'Section 1',accessedAt:'2026-10-01T00:00:00Z',retrievalRef:'fixture:'+i,retrievedTextSha256:String(i+1).repeat(64),license:{code:'UNKNOWN',url:null,checked:false,usage:'reference_only'}})),
      claims:['stem','solution','curriculum','option0','option1','option2','option3','option4'].map(target=>({id:target,target:target.startsWith('option')?'option':target,optionIndex:target.startsWith('option')?Number(target.at(-1)):null,statement:'Fixture',reasoningSummary:'Fixture',evidence:[0,1].map(i=>({sourceId:'s'+i,relation:'supports',locator:'Section',scopeMatch:true,scopeNote:'Fixture',explanation:'Fixture'}))})),
      optionChecks:content.options.map((_,index)=>({index,assessment:index===2?'supported':'excluded',claimIds:['option'+index],explanation:'Fixture'})),
      examComparison:{status:'not_found',sourceIds:[],reference:null,comparison:'Fixture',optionOrderChecked:false,answerKeyTransfer:false},terminology:[],limitations:['TEST ONLY']}
  })
  it('publishes with exactly ONE real approval, retains old revision and Social readiness', async () => {
    await decision(); expect(await accept()).toMatchObject({status:'stage1_approved'})
    expect(await status()).toMatchObject({accepted:true,readyToPublish:true})
    expect(await publish()).toMatchObject({status:'published'})
    expect(await scalar('SELECT count(*)::int AS result FROM public.question_revision_approvals WHERE revision_id=$1',[rid])).toBe(1)
    expect(await scalar('SELECT status AS result FROM public.question_content_revisions WHERE id=$1',[oldRid])).toBe('superseded')
    expect(await scalar('SELECT public.tyt_social_revision_source_policy_ready($1) AS result',[rid])).toBe(true)
  })
  it('does not treat acceptance as automatic publication or bypass the required quality policy', async () => {
    await accept(); expect(await status()).toMatchObject({accepted:true,readyToPublish:false})
    await expect(publish()).rejects.toMatchObject({code:'22023'})
  })
  it.each(['REJECTED','NEEDS_REVIEW','INCONCLUSIVE'])('blocks %s quality decision', async verdict => {
    await decision(); await db.query('UPDATE public.question_validation_decisions SET verdict=$1',[verdict]); await accept()
    await expect(publish()).rejects.toMatchObject({code:'22023'})
  })
  it('blocks stale policy, scope and source evidence after acceptance', async () => {
    await decision(); await accept()
    await db.exec("UPDATE public.question_validation_runtime SET required_policy_version='question-quality@3'")
    expect((await status()).readyToPublish).toBe(false)
  })
  it.each(['outcome','source','approval','content'])('invalidates altered %s binding', async kind => {
    await decision(); await accept()
    if(kind==='outcome') await db.exec('UPDATE public.question_revision_outcomes SET weight=0.5')
    if(kind==='source') await db.exec("UPDATE public.question_revision_sources SET provenance_ref='changed'")
    if(kind==='approval') await db.exec("UPDATE public.question_revision_approvals SET decided_at=decided_at+interval '1 second'")
    if(kind==='content') await db.query('UPDATE public.question_content_revisions SET content_sha256=$1 WHERE id=$2',['b'.repeat(64),rid])
    expect((await status()).readyToPublish).toBe(false)
    await expect(publish()).rejects.toMatchObject({code:'22023'})
  })
  it('rejects the author and an actor without review permission', async () => {
    await expect(accept(report,author)).rejects.toMatchObject({code:'22023'})
    await expect(accept(report,publisher)).rejects.toMatchObject({code:'42501'})
  })
  async function ownerPreparation() {
    for (const permission of ['content.prepare','content.publish']) await db.query('INSERT INTO public.fixture_permissions VALUES($1,$2)',[author,permission])
    return {version:'ai-preparation-declaration@1',agent:'TEST ONLY AI',evidenceRef:'fixture:ai-preparation',evidenceSha256:'9'.repeat(64),
      revisionEvidenceFingerprint:await scalar('SELECT public.question_source_review_fingerprint($1) AS result',[rid]),acknowledgesNonIndependentReview:true,acceptsResponsibility:true}
  }
  const acceptAi = (preparation, input=report, user=author, request=randomUUID()) => rpc(
    'public.accept_question_revision_ai_source_review($1,$2,$3,$4,$5,$6)',[user,rid,JSON.stringify(input),'TEST ONLY accountable owner review',request,JSON.stringify(preparation)])
  it('records explicit AI-owner mode, publishes only after exact quality, and preserves history',async()=>{
    const preparation=await ownerPreparation()
    expect(await status()).toMatchObject({canAcceptAiPrepared:false,acceptanceMode:null})
    expect(await rpc('public.get_question_revision_source_review($1,$2)',[author,rid])).toMatchObject({canAcceptAiPrepared:true,evidenceFingerprint:preparation.revisionEvidenceFingerprint})
    await expect(accept(report,author)).rejects.toMatchObject({code:'22023'})
    expect(await acceptAi(preparation)).toMatchObject({status:'stage1_approved',acceptanceMode:'ai_assisted_owner'})
    expect(await status()).toMatchObject({accepted:true,acceptanceMode:'ai_assisted_owner',readyToPublish:false})
    await expect(publish()).rejects.toMatchObject({code:'22023'})
    await decision(); expect(await status()).toMatchObject({readyToPublish:true})
    expect(await publish()).toMatchObject({status:'published'})
    expect(await scalar('SELECT count(*)::int AS result FROM public.question_revision_approvals')).toBe(1)
    expect(await scalar('SELECT status AS result FROM public.question_content_revisions WHERE id=$1',[oldRid])).toBe('superseded')
    expect(await scalar('SELECT policy_version AS result FROM public.question_revision_source_reviews')).toBe('source-review-ai-owner@1')
  })
  it.each(['content.prepare','content.review.stage1','content.publish'])('requires owner permission %s conjunctively',async permission=>{
    const preparation=await ownerPreparation()
    await db.query('DELETE FROM public.fixture_permissions WHERE user_id=$1 AND permission=$2',[author,permission])
    await expect(acceptAi(preparation)).rejects.toMatchObject({code:'42501'})
    expect(await scalar('SELECT count(*)::int AS result FROM public.question_revision_approvals')).toBe(0)
  })
  it.each(['agent','evidenceRef','evidenceSha256','revisionEvidenceFingerprint','acknowledgesNonIndependentReview','acceptsResponsibility','version'])('rejects missing AI declaration field %s',async field=>{
    const preparation=await ownerPreparation();delete preparation[field]
    await expect(acceptAi(preparation)).rejects.toMatchObject({code:'22023'})
  })
  it.each([null,[],{}, {version:'ai-preparation-declaration@1'},false])('rejects invalid AI preparation %j',async invalid=>{
    await ownerPreparation();await expect(acceptAi(invalid)).rejects.toMatchObject({code:'22023'})
  })
  it('requires current fingerprint and rejects extra/self-certified independent fields',async()=>{
    const preparation=await ownerPreparation()
    await expect(acceptAi({...preparation,independent:true})).rejects.toMatchObject({code:'22023'})
    await expect(acceptAi({...preparation,acceptsResponsibility:false})).rejects.toMatchObject({code:'22023'})
    await expect(acceptAi({...preparation,acknowledgesNonIndependentReview:'true'})).rejects.toMatchObject({code:'22023'})
    await db.query("UPDATE public.question_revision_sources SET source_title='Changed source' WHERE revision_id=$1",[rid])
    await expect(acceptAi(preparation)).rejects.toMatchObject({code:'22023'})
  })
  it('does not turn another preparer or mapper into this owner',async()=>{
    const preparation=await ownerPreparation()
    await db.query('UPDATE public.question_content_revisions SET outcomes_prepared_by=$1 WHERE id=$2',[reviewer,rid])
    await expect(acceptAi(preparation)).rejects.toMatchObject({code:'22023'})
    await db.query('UPDATE public.question_content_revisions SET outcomes_prepared_by=NULL,prepared_by=$1 WHERE id=$2',[reviewer,rid])
    await expect(acceptAi(preparation)).rejects.toMatchObject({code:'22023'})
  })
  it('keeps report, provenance and new LGS v2 gates on the AI path',async()=>{
    const preparation=await ownerPreparation(),bad=structuredClone(report)
    bad.optionChecks.pop(); await expect(acceptAi(preparation,bad)).rejects.toMatchObject({code:'22023'})
    await db.query("UPDATE public.question_revision_sources SET provenance_ref='legacy:unknown' WHERE revision_id=$1",[rid])
    preparation.revisionEvidenceFingerprint=await scalar('SELECT public.question_source_review_fingerprint($1) AS result',[rid])
    await expect(acceptAi(preparation)).rejects.toMatchObject({code:'22023'})
    await db.query("UPDATE public.question_content_revisions SET exam_ref='LGS' WHERE id=$1",[rid])
    await expect(acceptAi(preparation)).rejects.toMatchObject({code:'22023'})
  })
  it('AI replay is exact, does not overwrite evidence and cannot be replayed as independent',async()=>{
    const preparation=await ownerPreparation(),request=randomUUID()
    await acceptAi(preparation,report,author,request)
    expect(await acceptAi(preparation,report,author,request)).toMatchObject({replayed:true,acceptanceMode:'ai_assisted_owner'})
    await expect(acceptAi({...preparation,agent:'changed'},report,author,request)).rejects.toMatchObject({code:'22023'})
    await expect(accept(report,author,request)).rejects.toMatchObject({code:'22023'})
    await db.exec('SAVEPOINT immutable_ai')
    await expect(db.exec("UPDATE public.question_revision_source_reviews SET acceptance_mode='separate_reviewer'")).rejects.toMatchObject({code:'42501'})
    await db.exec('ROLLBACK TO SAVEPOINT immutable_ai')
  })
  it('stale policy and changed scope invalidate AI readiness without rewriting acceptance',async()=>{
    await acceptAi(await ownerPreparation());await decision()
    await db.exec("UPDATE public.question_validation_runtime SET required_policy_version='question-quality@next'")
    expect(await status()).toMatchObject({accepted:true,readyToPublish:false})
    await db.exec("UPDATE public.question_validation_runtime SET required_policy_version='question-quality@2'")
    await db.query('UPDATE public.curriculum_outcomes SET is_active=false WHERE id=$1',[outcome])
    expect(await status()).toMatchObject({readyToPublish:false})
    await expect(publish()).rejects.toMatchObject({code:'22023'})
  })
  it('reapplying the AI migration preserves an accepted declaration, approval and readiness',async()=>{
    await acceptAi(await ownerPreparation());await decision()
    const before=(await db.query('SELECT * FROM public.question_revision_source_reviews WHERE revision_id=$1',[rid])).rows
    const inTransaction=sql=>sql.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
    await db.exec(inTransaction(sqlAiOwner));await db.exec(inTransaction(sqlAiOwner))
    expect((await db.query('SELECT * FROM public.question_revision_source_reviews WHERE revision_id=$1',[rid])).rows).toEqual(before)
    expect(await status()).toMatchObject({accepted:true,acceptanceMode:'ai_assisted_owner',readyToPublish:true})
    expect(await scalar('SELECT count(*)::int AS result FROM public.question_revision_approvals')).toBe(1)
  })
  it('rejects the outcome preparer even when different from the content author', async () => {
    await db.query('UPDATE public.question_content_revisions SET outcomes_prepared_by=$1 WHERE id=$2',[reviewer,rid])
    await expect(accept()).rejects.toMatchObject({code:'22023'})
  })
  it('does not accept a legacy ownership marker as new source evidence', async () => {
    await db.exec("UPDATE public.question_revision_sources SET license_code='legacy-import',provenance_ref='legacy:fixture'")
    await expect(accept()).rejects.toMatchObject({code:'22023'})
  })
  it('does not publish an ordinary first-stage approval without its source attestation', async () => {
    await decision()
    await rpc('public.review_question_content_revision($1,$2,1::smallint,\'approved\',\'Fixture\',$3)',[reviewer,rid,randomUUID()])
    await expect(publish()).rejects.toMatchObject({code:'22023'})
  })
  it('invalidates inactive curriculum ancestry without modifying the report', async () => {
    await decision(); await accept()
    await db.exec("UPDATE public.curriculum_nodes SET is_active=false WHERE node_type='topic'")
    expect((await status()).readyToPublish).toBe(false)
    await expect(publish()).rejects.toMatchObject({code:'22023'})
  })
  it('rejects a competing publication pointer and a quality decision for another question', async () => {
    await decision(); await accept()
    await db.query('UPDATE public.questions SET published_revision_id=$1 WHERE id=$2',[rid,qid])
    await expect(publish()).rejects.toMatchObject({code:'22023'})
    await db.query('UPDATE public.questions SET published_revision_id=$1 WHERE id=$2',[oldRid,qid])
    await db.query('UPDATE public.question_validation_decisions SET question_id=$1',[randomUUID()])
    expect((await status()).readyToPublish).toBe(false)
  })
  it('replays exact requests, rejects changed payloads, and keeps evidence immutable', async () => {
    const request=randomUUID(); await accept(report,reviewer,request)
    expect(await accept(report,reviewer,request)).toMatchObject({replayed:true})
    await expect(accept(report,reviewer,request,'Different rationale')).rejects.toMatchObject({code:'22023'})
    await expect(db.exec("UPDATE public.question_revision_source_reviews SET report='{}'")).rejects.toMatchObject({code:'42501'})
  })
  it('migration replay and rollback retain the real evidence and disable the new write path',async()=>{
    await decision(); await accept()
    const inTransaction=sql=>sql.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
    await db.exec(inTransaction(sql217))
    expect((await status()).readyToPublish).toBe(true)
    await db.exec(inTransaction(readFileSync(resolve('database/rollback/217_question_source_review_single_approval.sql'),'utf8')))
    expect((await status()).readyToPublish).toBe(false)
    expect(await scalar('SELECT count(*)::int AS result FROM public.question_revision_source_reviews')).toBe(1)
    expect(await scalar('SELECT count(*)::int AS result FROM public.question_revision_approvals')).toBe(1)
    await expect(publish()).rejects.toMatchObject({code:'22023'})
    await expect(accept()).rejects.toMatchObject({code:'42501'})
  })
  it('keeps the previous two independent approval publication path', async () => {
    await rpc('public.review_question_content_revision($1,$2,1::smallint,\'approved\',\'Fixture\',$3)',[reviewer,rid,randomUUID()])
    await rpc('public.review_question_content_revision($1,$2,2::smallint,\'approved\',\'Fixture\',$3)',[reviewer2,rid,randomUUID()])
    expect(await publish()).toMatchObject({status:'published'})
  })
  async function lgsFixture() {
    await db.exec("UPDATE public.questions SET exam_ref='LGS',content=jsonb_set(content,'{options}',(content->'options')-4); UPDATE public.question_content_revisions SET exam_ref='LGS',content=jsonb_set(content,'{options}',(content->'options')-4); UPDATE public.curriculum_nodes SET exam_ref='LGS'; UPDATE public.curriculum_outcomes SET exam_ref='LGS'")
    report.claims=report.claims.filter(c=>c.id!=='option4'); report.optionChecks.pop()
  }
  async function v2Fixture({catalog=true,year=true,examRef='LGS',examYear=2026}={}) {
    if(examRef==='LGS') await lgsFixture()
    report.format='source-comparison@2'
    report.sources.push({...report.sources[1],id:'exam',kind:'official_exam',url:'https://example.org/2026-guide',retrievedTextSha256:'3'.repeat(64),retrievalRef:'fixture:exam-year'})
    report.claims.find(c=>c.target==='curriculum').evidence=report.claims.find(c=>c.target==='curriculum').evidence.slice(0,1)
    const canonicalId=`fixture@2018:grade8:${examRef}:8.2.2`
    report.curriculumBinding={examRef,examYear,mappings:[{claimId:'curriculum',outcomeId:outcome,canonicalId,programKey:'fixture',programEdition:'2018',grade:8,officialCode:'8.2.2',programSourceId:'s0',programPageTextSha256:'1'.repeat(64),examScopeSourceId:'exam',examScopeLocator:'Table 1'}]}
    if(catalog) {
      await db.query(`INSERT INTO public.curriculum_canonical_outcomes(canonical_id,program_key,program_edition,grade,exam_ref,game,official_code,title,official_path,source_receipt)
        VALUES($1,'fixture','2018',8,$4,'sosyal','8.2.2','Fixture',$2,$3)`,[canonicalId,JSON.stringify([{nodeType:'course',title:'Fixture course'},{nodeType:'outcome',title:'Fixture',officialCode:'8.2.2'}]),JSON.stringify({reviewedCanonicalId:canonicalId,url:report.sources[0].url,responseSha256:'4'.repeat(64),pageTextSha256:'1'.repeat(64),pdfPage:44,extractor:'fixture',extractorVersion:'1',packageSha256:'5'.repeat(64)}),examRef])
      await db.query('INSERT INTO public.curriculum_outcome_canonical_links(outcome_id,canonical_id,taxonomy_version,package_sha256) VALUES($1,$2,\'fixture-v1\',$3)',[outcome,canonicalId,'5'.repeat(64)])
      if(year) await db.query('INSERT INTO public.curriculum_canonical_exam_scopes(canonical_id,exam_year,source_receipt,reviewed_by) VALUES($1,$4,$2,$3)',[canonicalId,JSON.stringify({kind:'official_exam',url:report.sources[2].url,retrievedTextSha256:'3'.repeat(64),retrievalRef:'fixture:exam-year',locator:'Table 1',acceptanceRef:'fixture:owner-reviewed',acceptancePurpose:'preparation_only',officialExamCertification:false}),reviewer2,examYear])
    }
  }
  async function exceptionFixture(kind='dataset') {
    await v2Fixture({examRef:'TYT',examYear:2027})
    await db.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:author,role:'authenticated',aal:'aal2'})])
    let basis
    if(kind==='dataset') {
      await db.exec("UPDATE public.questions SET category='cografya'; UPDATE public.question_content_revisions SET category='cografya'; UPDATE public.curriculum_nodes SET category='cografya'; UPDATE public.curriculum_outcomes SET category='cografya'")
      const regions=['Karadeniz Bölgesi','Akdeniz Bölgesi','Marmara Bölgesi','Ege Bölgesi','Doğu Anadolu Bölgesi','İç Anadolu Bölgesi','Güneydoğu Anadolu Bölgesi']
      await db.query("UPDATE public.question_content_revisions SET content=jsonb_set(jsonb_set(content,'{options}',$1),'{answer}','0') WHERE id=$2",[JSON.stringify(regions.slice(0,5)),rid])
      report.optionChecks.forEach(o=>{o.assessment=o.index===0?'supported':'excluded'})
      report.sources[1].url='https://www.mgm.gov.tr/TEST-ONLY'
      for(const c of report.claims) if(c.target!=='curriculum') c.evidence=c.evidence.filter(e=>e.sourceId==='s1')
      basis={kind:'mgm_regional_normal_maximum@1',sourceId:'s1',claimIds:report.claims.filter(c=>c.target!=='curriculum').map(c=>c.id),periodStart:1991,periodEnd:2020,statistic:'annual_areal_precipitation_mean',unit:'tenths_mm',values:regions.map((region,i)=>({region,value:7000-i*100}))}
    } else {
      const c=report.claims.find(c=>c.target==='solution')
      report.sources.push({...report.sources[1],id:'early',url:'https://history.state.gov/TEST-ONLY',workId:'early',independenceGroup:'early',retrievedTextSha256:'4'.repeat(64)},
        {...report.sources[1],id:'late',url:'https://www.icj-cij.org/TEST-ONLY',workId:'late',independenceGroup:'late',retrievedTextSha256:'5'.repeat(64)})
      c.evidence[0].relation='contradicts'
      for(const id of ['early','late']) c.evidence.push({...c.evidence[1],sourceId:id})
      basis={kind:'dated_record_order@1',claimIds:[c.id],contradictingSourceIds:['s0'],calendar:'gregorian',earlier:{name:'TEST ONLY earlier event',date:'1856-02-18',sourceIds:['early']},later:{name:'TEST ONLY later event',date:'1856-02-25',sourceIds:['late']},conclusion:'earlier_precedes_later'}
    }
    const preparation=await ownerPreparation()
    const exception={version:'source-evidence-exception@1',reportSnapshot:structuredClone(report),revisionEvidenceFingerprint:preparation.revisionEvidenceFingerprint,rationale:'TEST ONLY explicit accountable exception',basis}
    return {exception,preparation}
  }
  const acceptException = ({exception,preparation},user=author,request=randomUUID()) => rpc(
    'public.accept_question_revision_source_exception_review($1,$2,$3,$4,$5,$6,$7)',[user,rid,JSON.stringify(report),JSON.stringify(exception),'TEST ONLY explicit owner responsibility',request,JSON.stringify(preparation)])
  it.each(['dataset','chronology'])('exception %s is denied until a real owner receipt; does not publish or skip quality',async kind=>{
    const input=await exceptionFixture(kind)
    expect(await scalar('SELECT public.question_source_report_valid($1,$2) AS result',[rid,JSON.stringify(report)])).toBe(false)
    await expect(acceptAi(input.preparation)).rejects.toMatchObject({code:'22023'})
    expect(await acceptException(input)).toMatchObject({status:'stage1_approved',publicationAuthorized:false})
    expect(await scalar('SELECT public.question_source_report_valid($1,$2) AS result',[rid,JSON.stringify(report)])).toBe(true)
    expect(await status()).toMatchObject({accepted:true,readyToPublish:false})
    await expect(publish()).rejects.toMatchObject({code:'22023'})
    const saved=await scalar('SELECT declaration AS result FROM public.question_revision_source_exceptions')
    expect(saved).toEqual(input.exception)
    expect(await scalar('SELECT count(*)::int AS result FROM public.question_revision_approvals')).toBe(1)
    await decision();expect(await publish()).toMatchObject({status:'published'})
    expect(await scalar('SELECT status AS result FROM public.question_content_revisions WHERE id=$1',[oldRid])).toBe('superseded')
  })
  it('keeps stem conflicts blocked until explicitly bound to the same dated records',async()=>{
    const input=await exceptionFixture('chronology')
    const solution=report.claims.find(c=>c.target==='solution'),stem=report.claims.find(c=>c.target==='stem')
    stem.evidence=structuredClone(solution.evidence)
    input.exception.reportSnapshot=structuredClone(report)
    await expect(acceptException(input)).rejects.toMatchObject({code:'22023'})
    input.exception.basis.claimIds.push('stem')
    expect(await acceptException(input)).toMatchObject({status:'stage1_approved'})
  })
  it.each(['aal1','missing-jwt','wrong-sub','permission','null-user'])('exception rejects unauthorized %s',async kind=>{
    const input=await exceptionFixture()
    if(kind==='aal1')await db.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:author,aal:'aal1',role:'authenticated'})])
    if(kind==='missing-jwt')await db.exec("SELECT set_config('request.jwt.claims','{}',true)")
    if(kind==='wrong-sub')await db.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:reviewer,aal:'aal2',role:'authenticated'})])
    if(kind==='permission')await db.query("DELETE FROM public.fixture_permissions WHERE user_id=$1 AND permission='content.publish'",[author])
    await expect(acceptException(input,kind==='null-user'?null:author)).rejects.toMatchObject({code:'42501'})
  })
  it.each(['tie','wrong-key','missing-region','duplicate-region','negative','fraction','period','unknown-field','curriculum','hash','report-drift','year','contradiction','unread','fake-host','missing-claim','source-drift','missing-option'])('dataset exception fails closed for %s',async kind=>{
    const input=await exceptionFixture(),b=input.exception.basis
    if(kind==='tie')b.values[1].value=b.values[0].value
    if(kind==='wrong-key')b.values[1].value=b.values[0].value+1
    if(kind==='missing-region')b.values.pop()
    if(kind==='duplicate-region')b.values[1].region=b.values[0].region
    if(kind==='negative')b.values[1].value=-1
    if(kind==='fraction')b.values[1].value=1.5
    if(kind==='period')b.periodEnd=2021
    if(kind==='unknown-field')input.exception.approved=true
    if(kind==='curriculum')b.claimIds.push('curriculum')
    if(kind==='hash')input.exception.revisionEvidenceFingerprint='0'.repeat(64)
    if(kind==='report-drift')input.exception.reportSnapshot.limitations.push('changed')
    if(kind==='year')report.curriculumBinding.examYear=2028
    if(kind==='contradiction')report.claims[0].evidence.push({...report.claims[0].evidence[0],sourceId:'s0',relation:'contradicts'})
    if(kind==='unread')report.sources[1].access='abstract_only'
    if(kind==='fake-host')report.sources[1].url='https://www.mgm.gov.tr.example.com/TEST-ONLY'
    if(kind==='missing-claim')b.claimIds.push('not-found')
    if(kind==='source-drift')await db.exec("UPDATE public.question_revision_sources SET source_title='changed'")
    if(kind==='missing-option')report.optionChecks.pop()
    if(kind!=='report-drift')input.exception.reportSnapshot=structuredClone(report)
    await expect(acceptException(input)).rejects.toMatchObject({code:'22023'})
    expect(await scalar('SELECT count(*)::int AS result FROM public.question_revision_source_exceptions')).toBe(0)
    expect(await scalar('SELECT count(*)::int AS result FROM public.question_revision_approvals')).toBe(0)
  })
  it.each(['reversed','equal','invalid-date','calendar','non-solution','remove-contrary','unread-contrary','not-archive','duplicate','new-conflict','one-content-source'])('chronology exception rejects %s',async kind=>{
    const input=await exceptionFixture('chronology'),b=input.exception.basis
    if(kind==='reversed')b.earlier.date='1856-03-01'
    if(kind==='equal')b.earlier.date=b.later.date
    if(kind==='invalid-date')b.later.date='1856-02-31'
    if(kind==='calendar')b.calendar='julian'
    if(kind==='non-solution')b.claimIds=['curriculum']
    if(kind==='remove-contrary')report.claims.find(c=>c.target==='solution').evidence.shift()
    if(kind==='unread-contrary')report.sources[0].access='abstract_only'
    if(kind==='not-archive')report.sources.find(s=>s.id==='early').url='https://example.org/TEST-ONLY'
    if(kind==='duplicate')b.later.sourceIds=['early']
    if(kind==='new-conflict')report.claims[0].evidence[0].relation='contradicts'
    if(kind==='one-content-source')report.claims[0].evidence.pop()
    input.exception.reportSnapshot=structuredClone(report)
    await expect(acceptException(input)).rejects.toMatchObject({code:'22023'})
  })
  it('exception fails atomically when ordinary source provenance fails',async()=>{
    const input=await exceptionFixture()
    await db.exec("UPDATE public.question_revision_sources SET provenance_ref='legacy:missing'")
    input.preparation.revisionEvidenceFingerprint=await scalar('SELECT public.question_source_review_fingerprint($1) AS result',[rid])
    input.exception.revisionEvidenceFingerprint=input.preparation.revisionEvidenceFingerprint
    await expect(acceptException(input)).rejects.toMatchObject({code:'22023'})
    expect(await scalar('SELECT count(*)::int AS result FROM public.question_revision_source_exceptions')).toBe(0)
  })
  it('exception replay retains original contrary evidence and immutable receipt; migration replay is idempotent',async()=>{
    const input=await exceptionFixture('chronology'),request=randomUUID()
    await acceptException(input,author,request)
    expect(await acceptException(input,author,request)).toMatchObject({replayed:true})
    await expect(acceptException({...input,exception:{...input.exception,rationale:'Changed exception rationale'}},author,request)).rejects.toMatchObject({code:'22023'})
    const original=(await db.query('SELECT * FROM public.question_revision_source_exceptions')).rows
    for(let i=0;i<2;i++)await db.exec(sqlExceptions.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''))
    expect((await db.query('SELECT * FROM public.question_revision_source_exceptions')).rows).toEqual(original)
    expect(await scalar('SELECT report AS result FROM public.question_revision_source_reviews')).toEqual(report)
    for(const role of ['anon','authenticated','service_role']) {
      for(const priv of ['INSERT','UPDATE','DELETE','SELECT'])expect(await scalar("SELECT has_table_privilege($1,'public.question_revision_source_exceptions',$2) AS result",[role,priv])).toBe(false)
      expect(await scalar("SELECT has_function_privilege($1,'public.question_source_report_evidence_valid(uuid,jsonb,jsonb)','EXECUTE') AS result",[role])).toBe(false)
    }
    for(const role of ['anon','authenticated'])expect(await scalar("SELECT has_function_privilege($1,'public.accept_question_revision_source_exception_review(uuid,uuid,jsonb,jsonb,text,uuid,jsonb)','EXECUTE') AS result",[role])).toBe(false)
    expect(await scalar("SELECT relrowsecurity AS result FROM pg_class WHERE oid='public.question_revision_source_exceptions'::regclass")).toBe(true)
    await db.exec('SAVEPOINT mutation')
    await expect(db.exec("UPDATE public.question_revision_source_exceptions SET declaration='{}'")).rejects.toMatchObject({code:'42501'})
    await db.exec('ROLLBACK TO SAVEPOINT mutation')
    report.limitations.push('Drift after acceptance')
    expect(await scalar('SELECT public.question_source_report_valid($1,$2) AS result',[rid,JSON.stringify(report)])).toBe(false)
  })
  it('v2 accepts one official program for curriculum, still requiring content corroboration and an authorized reviewer',async()=>{
    await v2Fixture(); await decision()
    await expect(accept(report,author)).rejects.toMatchObject({code:'22023'})
    expect(await accept()).toMatchObject({status:'stage1_approved'})
    expect((await status()).readyToPublish).toBe(true)
    expect(await publish()).toMatchObject({status:'published'})
  })
  it.each(['missing-catalog','missing-year'])('v2 rejects fabricated declarations with %s',async kind=>{
    await v2Fixture({catalog:kind!=='missing-catalog',year:kind!=='missing-year'}); await invalidReport(report)
  })
  it('publishes a changed four-option LGS revision via AI-owner mode with the real basic guard',async()=>{
    await v2Fixture()
    // Publish must change content, so a legacy content-only trigger would run too.
    await db.query("UPDATE public.question_content_revisions SET content=jsonb_set(content,'{solution}',to_jsonb('TEST ONLY: 2 + 3 equals 5.'::text)) WHERE id=$1",[rid])
    const previous=await scalar('SELECT content AS result FROM public.questions WHERE id=$1',[qid])
    const preparation=await ownerPreparation()
    await expect(acceptAi(preparation)).resolves.toMatchObject({status:'stage1_approved'})
    await expect(publish()).rejects.toMatchObject({code:'22023'})
    await decision()
    await expect(publish()).resolves.toMatchObject({status:'published'})
    const current=await scalar('SELECT content AS result FROM public.questions WHERE id=$1',[qid])
    expect(current.options).toHaveLength(4)
    expect(current.solution).toBe('TEST ONLY: 2 + 3 equals 5.')
    expect(await scalar('SELECT content AS result FROM public.question_content_revisions WHERE id=$1',[oldRid])).toEqual(previous)
    expect(await scalar('SELECT status AS result FROM public.question_content_revisions WHERE id=$1',[oldRid])).toBe('superseded')
  })
  it.each(['examRef','examYear','outcomeId','canonicalId','programKey','programEdition','grade','officialCode','programPageTextSha256','program-url','program-hash','scope-url','scope-hash','scope-ref','scope-kind','scope-locator','claim','scopeMatch','duplicate','null','unmapped'])('v2 rejects %s drift',async kind=>{
    await v2Fixture()
    const b=report.curriculumBinding,m=b.mappings[0]
    if(kind==='examRef') b.examRef='TYT'
    else if(kind==='examYear') b.examYear=2027
    else if(kind==='outcomeId') m.outcomeId=randomUUID()
    else if(['canonicalId','programKey','programEdition','officialCode'].includes(kind)) m[kind]='changed'
    else if(kind==='grade') m.grade=7
    else if(kind==='programPageTextSha256') m.programPageTextSha256='e'.repeat(64)
    else if(kind==='program-url') report.sources[0].url='https://example.org/wrong'
    else if(kind==='program-hash') report.sources[0].retrievedTextSha256='e'.repeat(64)
    else if(kind==='scope-url') report.sources[2].url='https://example.org/wrong'
    else if(kind==='scope-hash') report.sources[2].retrievedTextSha256='e'.repeat(64)
    else if(kind==='scope-ref') report.sources[2].retrievalRef='wrong'
    else if(kind==='scope-kind') report.sources[2].kind='textbook'
    else if(kind==='scope-locator') m.examScopeLocator='Wrong table'
    else if(kind==='claim') m.claimId='stem'
    else if(kind==='scopeMatch') report.claims.find(c=>c.id==='curriculum').evidence[0].scopeMatch=false
    else if(kind==='duplicate') b.mappings.push({...m})
    else if(kind==='null') report.curriculumBinding=null
    else if(kind==='unmapped') report.claims.push({...report.claims.find(c=>c.id==='curriculum'),id:'unmapped'})
    await invalidReport(report)
  })
  it.each(['one-content-source','contradiction','inactive','taxonomy','title'])('v2 preserves %s guard',async kind=>{
    await v2Fixture()
    if(kind==='one-content-source') report.claims[0].evidence.pop()
    if(kind==='contradiction') report.claims[0].evidence[0].relation='contradicts'
    if(kind==='inactive') await db.exec('UPDATE public.curriculum_nodes SET is_active=false')
    if(kind==='taxonomy') await db.exec("UPDATE public.curriculum_outcomes SET taxonomy_version='changed'")
    if(kind==='title') await db.exec("UPDATE public.curriculum_outcomes SET title='changed'")
    await invalidReport(report)
  })
  it('requires v2 for new LGS acceptance but preserves already accepted v1 and exact replay',async()=>{
    await lgsFixture()
    await expect(accept()).rejects.toThrow('source-comparison@2 required')
    const inTransaction=sql=>sql.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
    await db.exec(inTransaction(sql217)) // Simulate pre-upgrade accepted history, not a production rollback.
    await decision(); const request=randomUUID(); await accept(report,reviewer,request)
    await db.exec(inTransaction(sqlV2)); await db.exec(inTransaction(sqlV2))
    expect((await status()).readyToPublish).toBe(true)
    expect(await accept(report,reviewer,request)).toMatchObject({replayed:true})
    expect(await publish()).toMatchObject({status:'published'})
  })
  it('keeps exam-year records immutable and denies all application writes/helper execution',async()=>{
    await v2Fixture()
    for(const role of ['anon','authenticated','service_role']) {
      for(const privilege of ['INSERT','UPDATE','DELETE']) expect(await scalar("SELECT has_table_privilege($1,'public.curriculum_canonical_exam_scopes',$2) AS result",[role,privilege])).toBe(false)
      expect(await scalar("SELECT has_function_privilege($1,'public.question_source_curriculum_binding_valid(uuid,jsonb)','EXECUTE') AS result",[role])).toBe(false)
    }
    expect(await scalar("SELECT relrowsecurity AS result FROM pg_class WHERE oid='public.curriculum_canonical_exam_scopes'::regclass")).toBe(true)
    await expect(db.exec('UPDATE public.curriculum_canonical_exam_scopes SET exam_year=2027')).rejects.toMatchObject({code:'42501'})
  })
  it.each(['kind','url','retrievedTextSha256','retrievalRef','locator','acceptanceRef'])('requires a non-null owner receipt %s',async key=>{
    await v2Fixture({year:false})
    const receipt={kind:'official_exam',url:'https://example.org/guide',retrievedTextSha256:'3'.repeat(64),retrievalRef:'fixture:exam',locator:'Table 1',acceptanceRef:'fixture:review'}
    receipt[key]=null
    await expect(db.query('INSERT INTO public.curriculum_canonical_exam_scopes(canonical_id,exam_year,source_receipt,reviewed_by) VALUES($1,2026,$2,$3)',[report.curriculumBinding.mappings[0].canonicalId,JSON.stringify(receipt),reviewer])).rejects.toMatchObject({code:'23514'})
  })
  it('does not grant clients evidence access or an acceptance RPC', async () => {
    for(const role of ['anon','authenticated','service_role']) expect(await scalar('SELECT has_table_privilege($1,\'public.question_revision_source_reviews\',\'SELECT\') AS result',[role])).toBe(false)
    for(const role of ['anon','authenticated']) expect(await scalar("SELECT has_function_privilege($1,'public.accept_question_revision_source_review(uuid,uuid,jsonb,text,uuid)','EXECUTE') AS result",[role])).toBe(false)
    expect(await scalar("SELECT has_function_privilege('service_role','public.accept_question_revision_source_review(uuid,uuid,jsonb,text,uuid)','EXECUTE') AS result")).toBe(true)
    for(const role of ['anon','authenticated']) expect(await scalar("SELECT has_function_privilege($1,'public.accept_question_revision_ai_source_review(uuid,uuid,jsonb,text,uuid,jsonb)','EXECUTE') AS result",[role])).toBe(false)
    expect(await scalar("SELECT has_function_privilege('service_role','public.accept_question_revision_ai_source_review(uuid,uuid,jsonb,text,uuid,jsonb)','EXECUTE') AS result")).toBe(true)
    for(const role of ['anon','authenticated','service_role']) for(const signature of ['public.question_ai_preparation_declaration_valid(jsonb)','public.question_source_review_actor_valid(uuid,uuid)']) {
      expect(await scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS result',[role,signature])).toBe(false)
    }
  })
  it.each(['revisionId','questionId','contentSha256'])('rejects wrong %s', async key => {
    report[key]=key==='contentSha256'?'b'.repeat(64):randomUUID(); await invalidReport(report)
  })
  it.each(['workId','independenceGroup','url','retrievedTextSha256'])('does not count repeated %s twice', async key => {
    report.sources[1][key]=report.sources[0][key]; await invalidReport(report)
  })
  it('collapses transitive source ancestry rather than counting group labels',async()=>{
    const third={...report.sources[1],id:'s2',url:'https://example.org/book2',workId:'w2',retrievedTextSha256:'3'.repeat(64)}
    report.sources[1].workId=report.sources[0].workId // A--B share work, B--C share group.
    report.sources.push(third)
    for(const claim of report.claims) claim.evidence.push({...claim.evidence[1],sourceId:'s2'})
    await invalidReport(report)
  })
  it.each(['missing-option','wrong-key','contradiction','missing-target','unread','missing-trace','no-curriculum','null'])('rejects %s evidence', async kind => {
    if(kind==='missing-option') report.optionChecks.pop()
    if(kind==='wrong-key') {report.optionChecks[2].assessment='excluded';report.optionChecks[1].assessment='supported'}
    if(kind==='contradiction') report.claims[0].evidence[0].relation='contradicts'
    if(kind==='missing-target') report.claims=report.claims.filter(c=>c.target!=='solution')
    if(kind==='unread') report.sources[1].access='abstract_only'
    if(kind==='missing-trace') report.sources[1].retrievalRef=null
    if(kind==='no-curriculum') report.sources[0].kind='university_material'
    await invalidReport(kind==='null'?null:report)
  })
})
