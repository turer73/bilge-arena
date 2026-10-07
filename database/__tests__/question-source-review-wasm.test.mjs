import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Isolated optional PostgreSQL WASM engine, never a production database.
// npm install --prefix secure/sql-test-runtime --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.5.8
const runtime = resolve(process.env.PGLITE_RUNTIME_PATH ?? 'secure/sql-test-runtime/node_modules/@electric-sql/pglite/dist')
const suite = existsSync(resolve(runtime, 'index.js')) ? describe : describe.skip
const migration = name => readFileSync(resolve('database/migrations', name), 'utf8')
const base = migration('106_question_content_governance.sql')
const scope = migration('164_question_revision_outcome_scope.sql')
const sql217 = migration('217_question_source_review_single_approval.sql')
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

suite('217 source review PostgreSQL WASM acceptance (not a concurrent/native rehearsal)', () => {
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
    const { PGlite } = await import(pathToFileURL(resolve(runtime, 'index.js')).href)
    const { pgcrypto } = await import(pathToFileURL(resolve(runtime, 'contrib/pgcrypto.js')).href)
    db = new PGlite({ extensions: { pgcrypto } })
    await db.exec(`CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY);
      CREATE TABLE public.fixture_permissions(user_id uuid,permission text);
      CREATE FUNCTION public.has_permission(uuid,text) RETURNS boolean LANGUAGE sql AS $$
        SELECT EXISTS(SELECT 1 FROM public.fixture_permissions WHERE user_id=$1 AND permission=$2) $$;
      CREATE TABLE public.curriculum_nodes(id uuid PRIMARY KEY,parent_id uuid,node_type text,game text,category text,exam_ref text,taxonomy_version text,is_active boolean DEFAULT true);
      CREATE TABLE public.curriculum_outcomes(id uuid PRIMARY KEY,node_id uuid,game text,category text,exam_ref text,taxonomy_version text,is_active boolean DEFAULT true);
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
  it('does not grant clients evidence access or an acceptance RPC', async () => {
    for(const role of ['anon','authenticated','service_role']) expect(await scalar('SELECT has_table_privilege($1,\'public.question_revision_source_reviews\',\'SELECT\') AS result',[role])).toBe(false)
    for(const role of ['anon','authenticated']) expect(await scalar("SELECT has_function_privilege($1,'public.accept_question_revision_source_review(uuid,uuid,jsonb,text,uuid)','EXECUTE') AS result",[role])).toBe(false)
    expect(await scalar("SELECT has_function_privilege('service_role','public.accept_question_revision_source_review(uuid,uuid,jsonb,text,uuid)','EXECUTE') AS result")).toBe(true)
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
