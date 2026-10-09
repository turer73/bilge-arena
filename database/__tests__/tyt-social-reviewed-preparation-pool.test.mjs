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
function table(name) {
  const text = read('205_tyt_social_candidate_policy_foundation.sql')
  const start = text.indexOf(`CREATE TABLE IF NOT EXISTS public.${name} (`)
  return text.slice(start, text.indexOf('\n);', start) + 3)
}
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const owner = id(900), other = id(901)
const roles = ['common_history','common_geography','common_philosophy','standard_religion','alternate_philosophy']
const categories = ['tarih','cografya','felsefe','din_kulturu','felsefe']
const policy = 'tyt-social-2027-v1'
suite('reviewed TYT preparation pool and truthful owner roles', () => {
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
    await db.exec(sql); await db.exec(sql)
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
    pins=[]
    for(let n=1;n<=25;n++){
      const content={question:`Synthetic fixture question ${n}?`,options:['one','two','three','four','five'],answer:1,solution:'Synthetic answer explanation.'}
      const hash=await scalar('SELECT content_governance_hash($1::jsonb) AS result',[JSON.stringify(content)])
      await db.query(`INSERT INTO questions VALUES($1,$2,true,'sosyal','TYT',$3,3,$4)`,[id(n),id(n+100),categories[Math.floor((n-1)/5)],content])
      await db.query(`INSERT INTO question_content_revisions VALUES($1,$2,$3,$4,'sosyal','TYT',$5,3,'published',now())`,[id(n+100),id(n),hash,content,categories[Math.floor((n-1)/5)]])
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
  it('registers exact 25 pins but does not accept or activate anything',async()=>{
    const c=await check(); expect(c.contentReadyCount).toBe(25);expect(c.eligibleCount).toBe(0)
    expect(c.poolEvidenceReady).toBe(false);expect(c.activationSupported).toBe(false);expect(c.publicationAuthorized).toBe(false)
    expect(c.items.every(i=>i.issues.join()==='ROLE_ACCEPTANCE_MISSING')).toBe(true)
    expect(await scalar('SELECT count(*)::integer AS result FROM question_revision_exam_roles')).toBe(0)
  })
  it('stores one accountable reviewer, never a second account or independent-human claim',async()=>{
    const result=await accept();expect(result.acceptedRoleCount).toBe(25);expect(result.independentHumanReview).toBe(false)
    await db.exec('SET CONSTRAINTS ALL IMMEDIATE')
    const c=await check();expect(c.eligibleCount).toBe(25);expect(c.poolEvidenceReady).toBe(true);expect(c.activationSupported).toBe(false)
    expect(await scalar('SELECT count(*)::integer AS result FROM question_revision_exam_role_reviews WHERE stage=2')).toBe(0)
    expect(await scalar('SELECT count(*)::integer AS result FROM question_revision_exam_roles WHERE stage2_reviewer_id IS NULL')).toBe(25)
  })
  it('replays exact acceptance and rejects changed payload with same request id',async()=>{
    const request=randomUUID();await accept(prep,request);expect((await accept(prep,request)).replayed).toBe(true)
    await expect(accept({...prep,agent:'Different claimed agent'},request)).rejects.toMatchObject({code:'22023'})
    expect(await scalar('SELECT count(*)::integer AS result FROM question_revision_exam_role_reviews')).toBe(25)
  })
  it('cannot enlarge the frozen pool by registering another manifest under the same policy',async()=>{
    await expect(prepare()).rejects.toMatchObject({code:'23505'})
    expect(await scalar('SELECT count(*)::integer AS result FROM tyt_social_reviewed_preparation_pools')).toBe(1)
  })
  it('reports policy rules drift after registration even with a newly valid rules hash',async()=>{
    await db.exec("UPDATE exam_candidate_policy_versions SET rules=rules||'{\"newScope\":true}',rules_sha256=content_governance_hash(rules||'{\"newScope\":true}')")
    expect((await check()).items.every(i=>i.issues.includes('POLICY_UNAVAILABLE'))).toBe(true)
    await expect(accept()).rejects.toMatchObject({code:'23514'})
  })
  it('replays pool registration independent of input ordering but not changed rationale',async()=>{
    // Reuse the real initial request and payload, not a second insert.
    const request=(await db.query('SELECT request_id FROM tyt_social_reviewed_preparation_pools')).rows[0].request_id
    expect((await prepare([...pins].reverse(),request)).replayed).toBe(true)
    await expect(rpc('public.prepare_tyt_social_reviewed_pool($1,$2,$3,$4::jsonb,$5,$6)',[owner,policy,2027,JSON.stringify(pins),'Changed rationale differs',request])).rejects.toMatchObject({code:'22023'})
  })
  for(const [name,statement,issue] of [
    ['quarantine',`UPDATE questions SET is_active=false WHERE id='${id(1)}'`,'NOT_ACTIVE_PUBLICATION'],
    ['changed revision pointer',`UPDATE questions SET published_revision_id=NULL WHERE id='${id(1)}'`,'NOT_ACTIVE_PUBLICATION'],
    ['wrong content hash',`UPDATE question_content_revisions SET content_sha256=repeat('f',64) WHERE id='${id(101)}'`,'CONTENT_HASH_MISMATCH'],
    ['stale quality hash',`UPDATE question_validation_decisions SET content_sha256=repeat('b',64) WHERE revision_id='${id(101)}'`,'QUALITY_DECISION_MISSING'],
    ['disabled quality gate','UPDATE question_validation_runtime SET enforce_publish_gate=false','QUALITY_DECISION_MISSING'],
    ['wrong quality policy',"UPDATE question_validation_runtime SET required_policy_version='question-quality@3'",'QUALITY_DECISION_MISSING'],
    ['missing source acceptance',`DELETE FROM question_revision_source_reviews WHERE revision_id='${id(101)}'`,'EXAM_YEAR_ACCEPTANCE_MISSING'],
    ['2026 is not 2027',`UPDATE question_revision_source_reviews SET report=jsonb_set(report,'{curriculumBinding,examYear}','2026'),report_sha256=content_governance_hash(jsonb_set(report,'{curriculumBinding,examYear}','2026'))`,'EXAM_YEAR_ACCEPTANCE_MISSING'],
    ['unaccepted canonical binding','UPDATE test_deps SET year_binding=false','EXAM_YEAR_ACCEPTANCE_MISSING'],
    ['invalid outcomes','UPDATE test_deps SET outcomes=false','OUTCOME_SCOPE_INVALID'],
    ['source gate refusal','UPDATE test_deps SET source=false','SOURCE_ACCEPTANCE_MISSING'],
    ['expired preparation policy','UPDATE exam_candidate_policy_versions SET valid_until=current_date','POLICY_UNAVAILABLE'],
    ['sociology excluded',`UPDATE question_content_revisions SET category='sosyoloji' WHERE id='${id(101)}'`,'REVISION_SCOPE_DRIFT'],
    ['four options forbidden',`UPDATE question_content_revisions SET content=jsonb_set(content,'{options}','["a","b","c","d"]') WHERE id='${id(101)}'`,'INVALID_CONTENT'],
  ])it(`fails closed before any role write: ${name}`,async()=>{
    await db.exec(statement);const c=await check();expect(c.items.some(i=>i.issues.includes(issue))).toBe(true)
    await expect(accept()).rejects.toMatchObject({code:'23514'})
    expect(await scalar('SELECT count(*)::integer AS result FROM question_revision_exam_roles')).toBe(0)
  })
  it('does not keep readiness after quarantine following acceptance',async()=>{await accept();await db.exec(`UPDATE questions SET is_active=false WHERE id='${id(1)}'`);expect((await check()).poolEvidenceReady).toBe(false)})
  it('cannot use a stale evidence fingerprint',async()=>{await db.exec("UPDATE test_deps SET fingerprint=repeat('c',64)");await expect(accept()).rejects.toMatchObject({code:'23514'})})
  for(const [name,modify] of [
    ['24 pins',p=>p.slice(0,24)],['26 pins',p=>[...p,p[0]]],['same question twice',p=>[p[0],...p.slice(0,24)]],
    ['same revision twice',p=>p.map((x,n)=>n===1?{...x,revisionId:p[0].revisionId}:x)],
    ['role imbalance',p=>p.map((x,n)=>n===0?{...x,examRole:'common_geography'}:x)],
    ['forged approval property',p=>p.map((x,n)=>n===0?{...x,approved:true}:x)],
    ['sociology role',p=>p.map((x,n)=>n===0?{...x,examRole:'sociology'}:x)],
    ['null pin',p=>[null,...p.slice(1)]],['null manifest',()=>null],
  ])it(`rejects malformed manifest: ${name}`,async()=>{await expect(prepare(modify(pins))).rejects.toMatchObject({code:'22023'})})
  it('cannot register a 2026 policy or mismatch target year',async()=>{await expect(prepare(pins,randomUUID(),owner,policy,2026)).rejects.toMatchObject({code:'22023'})})
  for(const key of ['acknowledgesNonIndependentReview','acceptsResponsibility'])it(`requires explicit ${key}`,async()=>{await expect(accept({...prep,[key]:false})).rejects.toMatchObject({code:'22023'})})
  it('binds the actor to JWT subject and requires all owner permissions',async()=>{
    await expect(accept(prep,randomUUID(),other)).rejects.toMatchObject({code:'42501'})
    await db.exec('UPDATE test_deps SET permission=false');await expect(accept()).rejects.toMatchObject({code:'42501'})
  })
  it('requires AAL2 for actual user context',async()=>{await db.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:owner,aal:'aal1'})]);await expect(accept()).rejects.toMatchObject({code:'42501'})})
  it('cannot reinterpret old two-review roles as one-review approvals',async()=>{
    await db.query(`INSERT INTO question_revision_exam_role_candidates(id,policy_version,revision_id,proposed_role,rationale,status,prepared_by) VALUES($1,$2,$3,'common_history','Old path fixture','approved',$4)`,[id(500),policy,id(101),owner])
    await db.query(`INSERT INTO question_revision_exam_role_reviews VALUES($1,1,$2,'approved','First actual reviewer',$3,now())`,[id(500),other,randomUUID()])
    await db.query(`INSERT INTO question_revision_exam_roles(policy_version,revision_id,exam_role,candidate_id,stage1_reviewer_id,stage2_reviewer_id) VALUES($1,$2,'common_history',$3,$4,$5)`,[policy,id(101),id(500),other,id(902)])
    await expect(rpc('public.get_tyt_social_preparation_pool($1,$2)',[owner,pool.poolId])).resolves.toBeDefined()
    await expect(scalar('SELECT public.assert_tyt_social_exam_role_approval($1,$2) AS result',[policy,id(101)])).rejects.toMatchObject({code:'23514'})
  })
  it('preserves a genuine two-review role approval without adding a pool owner declaration',async()=>{
    await db.query(`INSERT INTO question_revision_exam_role_candidates(id,policy_version,revision_id,proposed_role,rationale,status,prepared_by) VALUES($1,$2,$3,'common_history','Old path fixture','approved',$4)`,[id(500),policy,id(101),owner])
    await db.query(`INSERT INTO question_revision_exam_role_reviews VALUES($1,1,$2,'approved','First actual reviewer',$3,now()),($1,2,$4,'approved','Second actual reviewer',$5,now())`,[id(500),other,randomUUID(),id(902),randomUUID()])
    await db.query(`INSERT INTO question_revision_exam_roles(policy_version,revision_id,exam_role,candidate_id,stage1_reviewer_id,stage2_reviewer_id) VALUES($1,$2,'common_history',$3,$4,$5)`,[policy,id(101),id(500),other,id(902)])
    await db.exec('SET CONSTRAINTS ALL IMMEDIATE')
    await expect(scalar('SELECT public.assert_tyt_social_exam_role_approval($1,$2) AS result',[policy,id(101)])).resolves.toBeDefined()
    expect((await check()).eligibleCount).toBe(0) // not silently adopted as new owner-mode approval
  })
  it('keeps pool immutable and direct client reads/writes revoked',async()=>{
    for(const role of ['anon','authenticated','service_role']) expect(await scalar(`SELECT has_table_privilege($1,'public.tyt_social_reviewed_preparation_pools','SELECT,INSERT,UPDATE,DELETE') AS result`,[role])).toBe(false)
    expect(await scalar("SELECT has_function_privilege('authenticated','public.accept_tyt_social_preparation_pool_roles(uuid,uuid,text,text,jsonb,text,uuid)','EXECUTE') AS result")).toBe(false)
    await expect(db.exec('UPDATE tyt_social_reviewed_preparation_pools SET exam_year=2028')).rejects.toMatchObject({code:'55000'})
  })
})
