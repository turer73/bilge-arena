import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startSourceReviewPostgres } from './helpers/isolated-source-review-postgres.mjs'

const migration = readFileSync(new URL('../migrations/20261011062902_controlled_measurement.sql', import.meta.url), 'utf8')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const user=id(100), other=id(101), form=id(200), request=id(300)
const bin=process.env.SOURCE_REVIEW_PG_BIN
if(process.env.SOURCE_REVIEW_PG_REQUIRED==='1'&&!bin) throw new Error('Native PG required')
// Actual migration + RPCs. Existing immutable revision/source governance is an
// explicit minimal fixture seam here; this is NOT full migration-chain coverage.
;(bin?describe:describe.skip)('controlled measurement native PostgreSQL',()=>{
 let db
 const scalar=async(sql,args)=>(await db.query(sql,args)).rows[0].result
 const call=async(name,args)=>scalar(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args)
 const start=()=>call('start_measurement',[user,form,request])
 const event=(sid,action='acknowledge',position=1,choice=null,overrides={})=>call('record_measurement_event',[
   user,sid,action,position,id(400+position),choice,overrides.renderOk??true,overrides.assistance??false,
   overrides.interrupted??false,overrides.version??'measurement-text@1',
 ])
 const answer=async(sid,p,selected=0)=>{await event(sid,'acknowledge',p);return event(sid,'answer',p,selected)}
 beforeAll(async()=>{
  db=await startSourceReviewPostgres(bin)
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
   CREATE TABLE public.profiles(id uuid PRIMARY KEY);
   CREATE TABLE public.questions(id uuid PRIMARY KEY,published_revision_id uuid,is_active boolean,content jsonb,game text,exam_ref text);
   CREATE TABLE public.question_content_revisions(id uuid PRIMARY KEY,question_id uuid,game text,exam_ref text,status text,content_sha256 text,content jsonb,accepted boolean);
   CREATE TABLE public.question_revision_source_reviews(revision_id uuid,content_sha256 text,report jsonb);
   CREATE TABLE public.session_answers(user_id uuid,question_id uuid,answered_at timestamptz DEFAULT clock_timestamp());
   CREATE TABLE public.adaptive_diagnostic_answers(user_id uuid,question_id uuid,created_at timestamptz DEFAULT clock_timestamp());
   CREATE TABLE public.verified_attempts(user_id uuid,question_ids uuid[],started_at timestamptz DEFAULT clock_timestamp());
   CREATE FUNCTION public.question_source_review_immutable() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'immutable'; END$$;
   CREATE FUNCTION public.question_revision_single_review_ready(rid uuid) RETURNS boolean LANGUAGE sql AS $$SELECT accepted FROM public.question_content_revisions WHERE id=rid$$;
   CREATE FUNCTION public.question_source_curriculum_binding_valid(rid uuid,report jsonb) RETURNS boolean LANGUAGE sql AS $$SELECT report->>'valid'='true'$$;`)
  await db.exec(migration)
 },60000)
 afterAll(async()=>{await db?.close()})
 beforeEach(async()=>{
  await db.exec('TRUNCATE measurement_items,measurement_sessions,measurement_form_releases,measurement_forms,question_revision_source_reviews,question_content_revisions,questions,profiles,session_answers,adaptive_diagnostic_answers,verified_attempts CASCADE')
  await db.query('INSERT INTO profiles VALUES($1),($2)',[user,other])
  const pins=[]
  for(let n=1;n<=5;n++){
   const content={question:`Soru ${n}`,options:['Bir','İki','Üç','Dört','Beş'],answer:0,solution:'Çözüm',passage:'Öncül'}
   const hash=await scalar("SELECT encode(extensions.digest($1::jsonb::text,'sha256'),'hex') result",[JSON.stringify(content)])
   await db.query('INSERT INTO question_content_revisions VALUES($1,$2,$3,$4,$5,$6,$7,true)',[id(n+10),id(n),'matematik','TYT','published',hash,content])
   await db.query('INSERT INTO questions VALUES($1,$2,true,$3,$4,$5)',[id(n),id(n+10),content,'matematik','TYT'])
   pins.push({questionId:id(n),revisionId:id(n+10),contentSha256:hash})
  }
  const hash=await scalar("SELECT encode(extensions.digest(jsonb_build_object('game','matematik','examRef','TYT','examYear',2027,'protocol','closed-measurement@1','pins',$1::jsonb)::text,'sha256'),'hex') result",[JSON.stringify(pins)])
  await db.query('INSERT INTO measurement_forms(id,game,exam_ref,exam_year,pins,form_sha256,acceptance_ref,accepted_by) VALUES($1,$2,$3,2027,$4,$5,$6,$7)',[form,'matematik','TYT',JSON.stringify(pins),hash,'fixture-only reviewed form',user])
  await db.query('INSERT INTO measurement_form_releases VALUES($1,true)',[form])
 })
 it('can apply migration twice',async()=>{await db.exec(migration);expect(await call('measurement_form_ready',[form])).toBe(true)})
 it('denies direct tables and RPCs to browser roles; service cannot import forms',async()=>{
  for(const role of ['anon','authenticated','service_role']){
   expect(await scalar("SELECT has_table_privilege($1,'measurement_forms','INSERT') result",[role])).toBe(false)
   expect(await scalar("SELECT has_table_privilege($1,'measurement_items','SELECT') result",[role])).toBe(false)
  }
  for(const role of ['anon','authenticated']) expect(await scalar("SELECT has_function_privilege($1,'start_measurement(uuid,uuid,uuid)','EXECUTE') result",[role])).toBe(false)
  expect(await scalar("SELECT has_function_privilege('service_role','start_measurement(uuid,uuid,uuid)','EXECUTE') result")).toBe(true)
 })
 it('returns only public first question, never options key/solution until last answer',async()=>{
  let s=await start()
  expect(s.question.passage).toBe('Öncül');expect(s.feedback).toBeNull();expect(s.calibrated).toBe(false)
  expect(Object.keys(s.question).sort()).toEqual(['id','options','passage','position','text'])
  for(let p=1;p<=5;p++){
   s=await answer(s.id,p)
   if(p<5){expect(s.feedback).toBeNull();expect(s.question.position).toBe(p+1)}
  }
  expect(s.status).toBe('completed');expect(s.feedback).toHaveLength(5)
  expect(s.feedback[0].correctText).toBe('Bir');expect(s.question).toBeNull()
 })
 it('service role executes the flow without direct private-table privileges',async()=>{
  await db.exec('SET ROLE service_role')
  try {
   const s=await start();expect(s.question.position).toBe(1)
   await expect(db.query('SELECT * FROM measurement_items')).rejects.toThrow(/permission denied/)
   await answer(s.id,1)
  } finally {await db.exec('RESET ROLE')}
 })
 it('pins revisions; fails closed after replacement or withdrawal',async()=>{
  const s=await start();await db.query('UPDATE questions SET published_revision_id=$1 WHERE id=$2',[id(80),id(1)])
  expect((await call('measurement_public_session',[user,s.id])).status).toBe('withdrawn')
  await expect(answer(s.id,1)).rejects.toThrow(/not active/)
  expect((await event(s.id,'abandon')).status).toBe('abandoned')
 })
 it('requires acknowledged render before answering, not client correctness',async()=>{
  const s=await start();await expect(event(s.id,'answer',1,0)).rejects.toThrow(/acknowledge before answer/)
  expect((await answer(s.id,1,1)).feedback).toBeNull()
  expect(await scalar('SELECT selected_option result FROM measurement_items WHERE session_id=$1 AND position=1',[s.id])).toBe(1)
 })
 it('locks first choice and accepts exact idempotent replay only',async()=>{
  const s=await start();const first=await answer(s.id,1)
  expect(await event(s.id,'answer',1,0)).toEqual(first)
  await expect(event(s.id,'answer',1,1)).rejects.toThrow(/locked/)
  expect(await scalar('SELECT answered result FROM measurement_sessions WHERE id=$1',[s.id])).toBe(1)
 })
 it('replays issuance and forbids concurrent active sessions',async()=>{
  const s=await start();expect((await start()).id).toBe(s.id)
  await expect(call('start_measurement',[user,form,id(301)])).rejects.toThrow(/resume or abandon/)
 })
 it('denies another user read and answer',async()=>{
  const s=await start();await expect(call('measurement_public_session',[other,s.id])).rejects.toThrow(/not found/)
  await expect(call('record_measurement_event',[other,s.id,'abandon',null,null,null,null,null,null,null])).rejects.toThrow(/not found/)
 })
 it('does not reveal feedback on expiry or abandon',async()=>{
  const s=await start();await answer(s.id,1)
  await db.query("UPDATE measurement_sessions SET expires_at=now()-interval '1 second' WHERE id=$1",[s.id])
  const expired=await call('measurement_public_session',[user,s.id]);expect(expired.status).toBe('expired');expect(expired.feedback).toBeNull()
  expect((await event(s.id,'abandon')).feedback).toBeNull()
 })
 it('blocks grade and coach even for unseen items until finish or abandonment',async()=>{
  const s=await start();expect(await call('measurement_feedback_blocked',[user,id(5)])).toBe(true)
  expect(await call('measurement_feedback_blocked',[other,id(5)])).toBe(false)
  await event(s.id,'abandon');expect(await call('measurement_feedback_blocked',[user,id(5)])).toBe(false)
 })
 it.each([null,5,-2])('rejects invalid option %s',async choice=>{const s=await start();await event(s.id);await expect(event(s.id,'answer',1,choice)).rejects.toThrow(/invalid option/)})
 it('does not accept out-of-sequence answers',async()=>{const s=await start();await expect(event(s.id,'acknowledge',2)).rejects.toThrow(/not active/)})
 it('records skip, but excludes it from candidate measurement evidence',async()=>{
  const s=await start();await answer(s.id,1,-1)
  expect(await scalar('SELECT exclusion_reasons result FROM measurement_evidence_v1 WHERE session_id=$1 AND position=1',[s.id])).toContain('unanswered')
 })
 it('keeps assistance/render/interruption flags sticky',async()=>{
  const s=await start();await event(s.id,'acknowledge',1,null,{renderOk:false,assistance:true,interrupted:true})
  await event(s.id);await event(s.id,'answer',1,0)
  const row=(await db.query('SELECT * FROM measurement_items WHERE session_id=$1 AND position=1',[s.id])).rows[0]
  expect(row.render_ok).toBe(false);expect(row.assistance_used).toBe(true);expect(row.interrupted).toBe(true)
 })
 it.each(['session_answers','adaptive_diagnostic_answers','verified_attempts'])('detects prior %s evidence',async table=>{
  await db.query(`INSERT INTO ${table} VALUES($1,$2)`,[user,table==='verified_attempts'?[id(1)]:id(1)])
  const s=await start();expect(await scalar('SELECT prior_recorded_exposure result FROM measurement_items WHERE session_id=$1 AND position=1',[s.id])).toBe(true)
 })
 it('earlier issued measurement counts even if unanswered and across a revision',async()=>{
  const s=await start();await event(s.id,'abandon')
  const next=await call('start_measurement',[user,form,id(301)])
  expect(await scalar('SELECT prior_recorded_exposure result FROM measurement_items WHERE session_id=$1 AND position=1',[next.id])).toBe(true)
  expect(await scalar('SELECT prior_recorded_exposure result FROM measurement_items WHERE session_id=$1 AND position=2',[next.id])).toBe(false)
 })
 it('practice issuance during measurement excludes the evidence',async()=>{
  const s=await start();await answer(s.id,1)
  await db.query('INSERT INTO verified_attempts VALUES($1,$2)',[user,[id(1)]])
  expect(await scalar('SELECT exclusion_reasons result FROM measurement_evidence_v1 WHERE session_id=$1 AND position=1',[s.id])).toContain('practice_issuance_recorded')
 })
 it('uses elapsed server receipt interval and never client supplied timing',async()=>{
  const s=await start();await event(s.id)
  await db.query("UPDATE measurement_items SET issued_at=now()-interval '3 seconds' WHERE session_id=$1 AND position=1",[s.id])
  await event(s.id,'answer',1,0)
  expect(Number(await scalar('SELECT server_elapsed_ms result FROM measurement_items WHERE session_id=$1 AND position=1',[s.id]))).toBeGreaterThanOrEqual(2900)
 })
 it('future practice does not retroactively contaminate a completed measurement',async()=>{
  const s=await start();for(let p=1;p<=5;p++) await answer(s.id,p)
  await db.exec("UPDATE measurement_items SET server_elapsed_ms=3000")
  await db.query('INSERT INTO verified_attempts VALUES($1,$2)',[user,[id(1)]])
  expect(await scalar('SELECT exclusion_reasons result FROM measurement_evidence_v1 WHERE session_id=$1 AND position=1',[s.id])).toEqual([])
 })
 it('unsupported math markup cannot silently pass through the text renderer',async()=>{
  await db.exec(`UPDATE question_content_revisions SET content=jsonb_set(content,'{question}',to_jsonb('$x^2$'::text));
    UPDATE question_content_revisions SET content_sha256=encode(extensions.digest(content::text,'sha256'),'hex');
    UPDATE questions q SET content=r.content FROM question_content_revisions r WHERE r.question_id=q.id;
    ALTER TABLE measurement_forms DISABLE TRIGGER measurement_form_immutable;
    UPDATE measurement_forms SET pins=(SELECT jsonb_agg(jsonb_build_object('questionId',question_id,'revisionId',id,'contentSha256',content_sha256) ORDER BY question_id) FROM question_content_revisions);
    UPDATE measurement_forms SET form_sha256=encode(extensions.digest(jsonb_build_object('game',game,'examRef',exam_ref,'examYear',exam_year,'protocol',protocol,'pins',pins)::text,'sha256'),'hex');
    ALTER TABLE measurement_forms ENABLE TRIGGER measurement_form_immutable;`)
  expect(await call('measurement_form_ready',[form])).toBe(false)
 })
 it('cannot edit immutable form pins',async()=>{await expect(db.query('UPDATE measurement_forms SET exam_year=2028 WHERE id=$1',[form])).rejects.toThrow(/immutable/)})
 it.each([
  "UPDATE question_content_revisions SET accepted=false",
  "UPDATE questions SET is_active=false",
  "UPDATE question_content_revisions SET status='superseded'",
  "UPDATE question_content_revisions SET content_sha256=repeat('a',64)",
  'UPDATE measurement_form_releases SET enabled=false',
 ])('requires live authority: %s',async sql=>{await db.exec(sql);expect(await call('measurement_form_ready',[form])).toBe(false);await expect(start()).rejects.toThrow(/unavailable/)})
 it('LGS requires four options AND accepted year binding',async()=>{
  await db.exec(`ALTER TABLE measurement_forms DISABLE TRIGGER measurement_form_immutable;
    UPDATE questions SET exam_ref='LGS';UPDATE question_content_revisions SET exam_ref='LGS';
    UPDATE measurement_forms SET exam_ref='LGS',form_sha256=encode(extensions.digest(jsonb_build_object(
     'game',game,'examRef','LGS','examYear',exam_year,'protocol',protocol,'pins',pins)::text,'sha256'),'hex');`)
  await db.exec(`INSERT INTO question_revision_source_reviews SELECT id,content_sha256,'{"valid":true,"curriculumBinding":{"examYear":2027}}' FROM question_content_revisions`)
  expect(await call('measurement_form_ready',[form])).toBe(false)
  await db.exec('TRUNCATE question_revision_source_reviews')
  await db.exec(`UPDATE question_content_revisions SET content=jsonb_set(content,'{options}',(content->'options')-4);
    UPDATE question_content_revisions SET content_sha256=encode(extensions.digest(content::text,'sha256'),'hex');
    UPDATE questions q SET content=r.content FROM question_content_revisions r WHERE r.question_id=q.id;
    UPDATE measurement_forms SET pins=(SELECT jsonb_agg(jsonb_build_object('questionId',question_id,'revisionId',id,'contentSha256',content_sha256) ORDER BY question_id) FROM question_content_revisions);
    UPDATE measurement_forms SET form_sha256=encode(extensions.digest(jsonb_build_object('game',game,'examRef',exam_ref,'examYear',exam_year,'protocol',protocol,'pins',pins)::text,'sha256'),'hex');
    ALTER TABLE measurement_forms ENABLE TRIGGER measurement_form_immutable;`)
  expect(await call('measurement_form_ready',[form])).toBe(false)
  await db.exec(`INSERT INTO question_revision_source_reviews SELECT id,content_sha256,'{"valid":true,"curriculumBinding":{"examYear":2026}}' FROM question_content_revisions`)
  expect(await call('measurement_form_ready',[form])).toBe(false)
  await db.exec(`INSERT INTO question_revision_source_reviews SELECT id,content_sha256,'{"valid":true,"curriculumBinding":{"examYear":2027}}' FROM question_content_revisions`)
  expect(await call('measurement_form_ready',[form])).toBe(true)
  const s=await start();expect(s.question.options).toHaveLength(4)
  await event(s.id);await expect(event(s.id,'answer',1,4)).rejects.toThrow(/invalid option/)
 })
})
