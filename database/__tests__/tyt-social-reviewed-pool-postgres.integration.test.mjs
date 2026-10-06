// Narrow disposable-cluster acceptance, NOT the complete migration chain.
// Actual 166 actor, 205 role/policy, 216 content, 217 source and 222 code run.
// Permission/outcome/single-review dependencies are controlled fixture seams.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, isAbsolute } from 'node:path'
import pg from 'pg'
import { describe, it, before, after, beforeEach } from 'node:test'

const bin = process.env.CANONICAL_PG_BIN
if (bin) assert.ok(isAbsolute(bin))
const sql = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
const migration = sql('222_tyt_social_reviewed_pool_preflight.sql')
const extract = (file, name, delimiter = '$fn$') => {
  const text = sql(file), start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  const body = text.indexOf(`AS ${delimiter}`, start), end = text.indexOf(delimiter, body + delimiter.length + 3)
  assert.ok(start >= 0 && body >= start && end > body)
  return `${text.slice(start, end + delimiter.length)};`
}
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const roles = ['common_history','common_geography','common_philosophy','standard_religion','alternate_philosophy']
const categories = ['tarih','cografya','felsefe','din_kulturu','felsefe']
const run = (name, args) => execFileSync(join(bin, name + (process.platform === 'win32' ? '.exe' : '')), args,
  { windowsHide: true, encoding: 'utf8', timeout: 60000, stdio: name === 'pg_ctl' ? 'ignore' : 'pipe' })

;(bin ? describe : describe.skip)('reviewed pool on isolated PostgreSQL', () => {
  let db, cluster, data, started = false, pins
  const check = async (items = pins, policy = 'tyt-social-2026-v1', actor = id(900)) =>
    (await db.query('SELECT public.get_tyt_social_reviewed_pool_preflight($1,$2,$3::jsonb) AS result',
      [actor, policy, JSON.stringify(items)])).rows[0].result
  const blocked = async code => {
    const result = await check()
    assert.equal(result.poolEvidenceReady, false)
    assert.ok(result.items[0].issues.includes(code), JSON.stringify(result.items[0]))
    assert.equal(result.roleDeficits.common_history, 1)
    assert.equal(result.publicationAuthorized, false)
  }
  before(async () => {
    cluster = mkdtempSync(join(tmpdir(), 'bilge-reviewed-pool-pg-')); data = join(cluster, 'data')
    run('initdb', ['-D', data, '-U', 'postgres', '--auth-local=trust', '--auth-host=trust', '--no-locale', '-E', 'UTF8'])
    const port = await new Promise((resolve, reject) => {
      const socket = createServer(); socket.once('error', reject)
      socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(e => e ? reject(e) : resolve(port)) })
    })
    started = true
    run('pg_ctl', ['-D', data, '-l', join(cluster, 'postgres.log'), '-w', '-t', '30', '-o', `-F -h 127.0.0.1 -p ${port} -c unix_socket_directories=`, 'start'])
    db = new pg.Client({ host: '127.0.0.1', port, database: 'postgres', user: 'postgres', connectionTimeoutMillis: 5000 })
    await db.connect()
    assert.equal(realpathSync((await db.query('SHOW data_directory')).rows[0].data_directory).toLowerCase(), realpathSync(data).toLowerCase())
    await db.query(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
      CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT COALESCE(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
      CREATE TABLE public.test_dependencies(permission boolean, outcomes boolean, single_review boolean);
      INSERT INTO public.test_dependencies VALUES(true,true,false);
      CREATE FUNCTION public.content_governance_has_permission(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT permission FROM public.test_dependencies$$;
      CREATE FUNCTION public.question_revision_outcomes_valid(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT outcomes FROM public.test_dependencies$$;
      CREATE FUNCTION public.question_revision_single_review_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT single_review FROM public.test_dependencies$$;
      CREATE TABLE public.exam_candidate_policy_versions(policy_version text PRIMARY KEY,game text,display_exam_ref text,status text,valid_from date,valid_until date);
      INSERT INTO public.exam_candidate_policy_versions VALUES('tyt-social-2026-v1','sosyal','TYT','released',current_date-1,current_date+1);
      CREATE TABLE public.questions(id uuid PRIMARY KEY,published_revision_id uuid,is_active boolean,game text,exam_ref text,category text,difficulty integer,content jsonb);
      CREATE TABLE public.question_content_revisions(id uuid PRIMARY KEY,question_id uuid,status text,published_at timestamptz,content_sha256 text,content jsonb,game text,exam_ref text,category text,difficulty integer,change_kind text,prepared_by uuid,outcomes_prepared_by uuid);
      CREATE TABLE public.question_revision_sources(revision_id uuid PRIMARY KEY,source_kind text,license_code text,provenance_ref text);
      CREATE TABLE public.question_revision_approvals(revision_id uuid,stage integer,decision text,reviewer_id uuid);
      CREATE TABLE public.question_revision_exam_roles(policy_version text,revision_id uuid,exam_role text,candidate_id uuid,stage1_reviewer_id uuid,stage2_reviewer_id uuid);
      CREATE TABLE public.question_revision_exam_role_candidates(id uuid,status text,policy_version text,revision_id uuid,proposed_role text,prepared_by uuid);
      CREATE TABLE public.question_revision_exam_role_reviews(candidate_id uuid,stage integer,decision text,reviewer_id uuid);
      CREATE TABLE public.question_validation_runtime(singleton boolean,required_policy_version text,enforce_publish_gate boolean);
      INSERT INTO public.question_validation_runtime VALUES(true,'question-quality@2',true);
      CREATE TABLE public.question_validation_decisions(question_id uuid,revision_id uuid,content_sha256 text,policy_version text,verdict text);`)
    for (const [file, name, delimiter] of [
      ['166_question_outcome_mapping_candidates.sql','question_outcome_mapping_actor_has_aal2'],
      ['205_tyt_social_candidate_policy_foundation.sql','resolve_current_tyt_social_candidate_policy'],
      ['205_tyt_social_candidate_policy_foundation.sql','assert_tyt_social_exam_role_approval'],
      ['221_formal_tyt_social_scope.sql','tyt_social_exam_role_compatible'],
      ['216_social_discovery_pilot.sql','social_discovery_valid_content'],
      ['217_question_source_review_single_approval.sql','tyt_social_revision_source_policy_ready','$function$'],
    ]) await db.query(extract(file, name, delimiter))
    await db.query(migration); await db.query(migration)
    await db.query(`SELECT set_config('request.jwt.claims',$1,false)`, [JSON.stringify({ sub: id(900), aal: 'aal2', role: 'authenticated' })])
    pins = []
    for (let n = 1; n <= 25; n++) {
      const role = roles[Math.floor((n - 1) / 5)], category = categories[Math.floor((n - 1) / 5)]
      const content = { question: `Synthetic ${n}`, options: ['one','two','three','four','five'], answer: 1 }
      const hash = (await db.query("SELECT encode(extensions.digest($1::jsonb::text,'sha256'),'hex') AS hash", [JSON.stringify(content)])).rows[0].hash
      await db.query(`INSERT INTO public.questions VALUES($1,$2,true,'sosyal','TYT',$3,3,$4);
      `.trim(), [id(n),id(n+100),category,content])
      await db.query(`INSERT INTO public.question_content_revisions VALUES($1,$2,'published',now(),$3,$4,'sosyal','TYT',$5,3,'correction',$6,NULL)`, [id(n+100),id(n),hash,content,category,id(800)])
      await db.query("INSERT INTO public.question_revision_sources VALUES($1,'original','INTERNAL','owner:test')", [id(n+100)])
      await db.query("INSERT INTO public.question_revision_approvals VALUES($1,1,'approved',$2),($1,2,'approved',$3)", [id(n+100),id(801),id(802)])
      await db.query("INSERT INTO public.question_revision_exam_roles VALUES('tyt-social-2026-v1',$1,$2,$3,$4,$5)", [id(n+100),role,id(n+200),id(803),id(804)])
      await db.query("INSERT INTO public.question_revision_exam_role_candidates VALUES($1,'approved','tyt-social-2026-v1',$2,$3,$4)", [id(n+200),id(n+100),role,id(805)])
      await db.query("INSERT INTO public.question_revision_exam_role_reviews VALUES($1,1,'approved',$2),($1,2,'approved',$3)", [id(n+200),id(803),id(804)])
      await db.query("INSERT INTO public.question_validation_decisions VALUES($1,$2,$3,'question-quality@2','APPROVED')", [id(n),id(n+100),hash])
      pins.push({ questionId:id(n),revisionId:id(n+100),contentSha256:hash,examRole:role })
    }
  })
  beforeEach(async () => { await db.query('BEGIN') })
  after(async () => {
    try { if (db) await db.end() } finally {
      if (started) {
        let running = false
        try { run('pg_ctl', ['-D',data,'status']); running=true } catch (e) { if (e.status !== 3) throw e }
        if (running) run('pg_ctl', ['-D',data,'-m','fast','-w','stop'])
      }
      console.log(`Own test cluster stopped; evidence retained: ${cluster}`)
    }
  })
  // Individual tests may intentionally abort their transaction; always roll back.
  // Registered here to keep fixture state independent without reseeding 25 pins.
  it('runs in a read-only transaction, preserves pins and never authorizes release', async t => {
    t.after(() => db.query('ROLLBACK'))
    await db.query('SET TRANSACTION READ ONLY')
    const result = await check()
    assert.equal(result.poolEvidenceReady,true); assert.equal(result.eligibleCount,25)
    assert.equal(result.publicationAuthorized,false); assert.equal(result.activationSupported,false)
    assert.equal(result.databaseWrites,0); assert.equal(result.globalGateUnchanged,true)
    assert.equal((await check([...pins].reverse())).manifestSha256,result.manifestSha256)
    assert.deepEqual(result.roleCounts,Object.fromEntries(roles.map(role => [role,5])))
    assert.ok(!JSON.stringify(result).includes('Synthetic'))
  })
  for (const [name, statement, code] of [
    ['inactive',`UPDATE public.questions SET is_active=false WHERE id='${id(1)}'`,'QUESTION_INACTIVE'],
    ['superseded pointer',`UPDATE public.questions SET published_revision_id=NULL WHERE id='${id(1)}'`,'NOT_CURRENT_PUBLICATION'],
    ['hash drift',`UPDATE public.question_content_revisions SET content_sha256=repeat('a',64) WHERE id='${id(101)}'`,'CONTENT_HASH_MISMATCH'],
    ['live content drift',`UPDATE public.questions SET content='{}' WHERE id='${id(1)}'`,'LIVE_REVISION_DRIFT'],
    ['sociology',`UPDATE public.question_content_revisions SET category='sosyoloji' WHERE id='${id(101)}'`,'ROLE_SCOPE_MISMATCH'],
    ['wrong exam',`UPDATE public.question_content_revisions SET exam_ref='AYT' WHERE id='${id(101)}'`,'ROLE_SCOPE_MISMATCH'],
    ['bad options',`UPDATE public.question_content_revisions SET content=jsonb_set(content,'{options}','["a","b"]') WHERE id='${id(101)}'`,'INVALID_CONTENT'],
    ['legacy provenance',`UPDATE public.question_revision_sources SET license_code='legacy-import' WHERE revision_id='${id(101)}'`,'SOURCE_ACCEPTANCE_MISSING'],
    ['missing content review',`DELETE FROM public.question_revision_approvals WHERE revision_id='${id(101)}'`,'SOURCE_ACCEPTANCE_MISSING'],
    ['missing quality',`DELETE FROM public.question_validation_decisions WHERE revision_id='${id(101)}'`,'QUALITY_DECISION_MISSING'],
    ['quality policy drift',`UPDATE public.question_validation_decisions SET policy_version='question-quality@1' WHERE revision_id='${id(101)}'`,'QUALITY_DECISION_MISSING'],
    ['role declaration is not acceptance',`DELETE FROM public.question_revision_exam_roles WHERE revision_id='${id(101)}'`,'ROLE_ACCEPTANCE_MISSING'],
    ['revoked role review',`UPDATE public.question_revision_exam_role_reviews SET decision='rejected' WHERE candidate_id='${id(201)}' AND stage=2`,'ROLE_ACCEPTANCE_MISSING'],
  ]) it(`fails closed: ${name}`, async t => { t.after(() => db.query('ROLLBACK')); await db.query(statement); await blocked(code) })
  it('uses the existing single-review helper instead of requiring stage 2 universally', async t => {
    t.after(() => db.query('ROLLBACK'))
    await db.query('DELETE FROM public.question_revision_approvals; UPDATE public.test_dependencies SET single_review=true')
    assert.equal((await check()).poolEvidenceReady,true)
  })
  for (const [statement, code] of [
    ['UPDATE public.test_dependencies SET outcomes=false','OUTCOME_SCOPE_INVALID'],
    ['UPDATE public.question_validation_runtime SET enforce_publish_gate=false','QUALITY_DECISION_MISSING'],
    ["UPDATE public.exam_candidate_policy_versions SET valid_until=current_date",'POLICY_UNAVAILABLE'],
  ]) it(`refuses unavailable authority: ${code}`, async t => {
    t.after(() => db.query('ROLLBACK')); await db.query(statement)
    const result = await check(); assert.equal(result.eligibleCount,0); assert.ok(result.items.every(i => i.issues.includes(code)))
  })
  it('never counts duplicate identities or forged approval fields', async t => {
    t.after(() => db.query('ROLLBACK'))
    await assert.rejects(check([pins[0],pins[0]]), e => e.code==='22023')
  })
  it('rejects the same revision under two question IDs', async t => {
    t.after(() => db.query('ROLLBACK'))
    await assert.rejects(check([pins[0],{...pins[0],questionId:id(99)}]),e=>e.code==='22023')
  })
  it('rejects more than 100 pins before database lookup', async t => {
    t.after(() => db.query('ROLLBACK'))
    await assert.rejects(check(Array.from({length:101},(_,n)=>({...pins[0],questionId:id(n+1),revisionId:id(n+101)}))),e=>e.code==='22023')
  })
  it('does not promote future policy years', async t => {
    t.after(() => db.query('ROLLBACK')); await assert.rejects(check(pins,'tyt-social-2027-v1'),e=>e.code==='22023')
  })
  it('reports nonexistent pins without exposing content', async t => {
    t.after(() => db.query('ROLLBACK'))
    const result=await check([{...pins[0],revisionId:id(999)}])
    assert.deepEqual(result.items[0].issues,['PIN_NOT_FOUND']); assert.equal(result.eligibleCount,0)
  })
  it('does not reuse one philosophy role as the other', async t => {
    t.after(() => db.query('ROLLBACK'))
    const result=await check(pins.map(pin=>({...pin,examRole:pin.examRole==='alternate_philosophy'?'common_philosophy':pin.examRole})))
    assert.equal(result.roleCounts.common_philosophy,5); assert.equal(result.roleDeficits.alternate_philosophy,5)
    assert.ok(result.items.slice(20).every(item=>item.issues.includes('ROLE_ACCEPTANCE_MISSING')))
  })
  it('does not count altered expected hashes', async t => {
    t.after(() => db.query('ROLLBACK'))
    const result=await check([{...pins[0],contentSha256:'f'.repeat(64)}])
    assert.ok(result.items[0].issues.includes('CONTENT_HASH_MISMATCH')); assert.equal(result.eligibleCount,0)
  })
  for (const input of [null, {}, [], [null], [{questionId:null}], [{...{questionId:id(1),revisionId:id(101),contentSha256:'a'.repeat(64),examRole:'common_history'}, approved:true}]]) {
    it(`rejects malformed request ${JSON.stringify(input)}`, async t => { t.after(() => db.query('ROLLBACK')); await assert.rejects(check(input), e => e.code==='22023') })
  }
  it('binds the actor to the real JWT subject', async t => { t.after(() => db.query('ROLLBACK')); await assert.rejects(check(pins,undefined,id(901)), e=>e.code==='42501') })
  it('requires AAL2', async t => { t.after(() => db.query('ROLLBACK')); await db.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id(900),aal:'aal1'})]); await assert.rejects(check(),e=>e.code==='42501') })
  it('requires content permission', async t => { t.after(() => db.query('ROLLBACK')); await db.query('UPDATE public.test_dependencies SET permission=false'); await assert.rejects(check(),e=>e.code==='42501') })
  it('keeps anonymous execution revoked and function STABLE', async t => {
    t.after(() => db.query('ROLLBACK'))
    assert.equal((await db.query("SELECT has_function_privilege('anon','public.get_tyt_social_reviewed_pool_preflight(uuid,text,jsonb)','EXECUTE') AS ok")).rows[0].ok,false)
    assert.equal((await db.query("SELECT provolatile FROM pg_proc WHERE oid='public.get_tyt_social_reviewed_pool_preflight(uuid,text,jsonb)'::regprocedure")).rows[0].provolatile,'s')
  })
  it('reports exact shortfall without treating partial capacity as readiness', async t => {
    t.after(() => db.query('ROLLBACK')); const result=await check(pins.slice(0,24))
    assert.equal(result.eligibleCount,24); assert.equal(result.roleDeficits.alternate_philosophy,1); assert.equal(result.poolEvidenceReady,false)
  })
})
