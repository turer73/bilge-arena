import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildReadinessReport, coverageBand, readinessSql, ROLES, V3 } from '../social-calibration-readiness.mjs'
import { startSourceReviewPostgres } from './helpers/isolated-source-review-postgres.mjs'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const pool = id(999)
function snapshot(n=0) {
  return { schemaVersion:'social-calibration-snapshot@1', checkedAt:'2026-10-11T06:00:00Z',
    poolId:pool, policyVersion:'tyt-social-2027-v1', manifestSha256:'a'.repeat(64), v3PolicyPresent:true,
    issuedAttempts:n, completedAttempts:n,
    items:ROLES.flatMap((role,r)=>Array.from({length:5},(_,j)=>({ role,questionId:id(r*5+j),
      revisionId:id(r*5+j+100), contentSha256:'b'.repeat(64), pinMatches:true,
      rawN:n, descriptiveN:n, pilotN:n, otherRevisionN:8 }))) }
}

describe('Social calibration coverage never promotes preparation to calibrated',()=>{
  it.each([[0,'no_data'],[1,'early_signal'],[29,'early_signal'],[30,'temporary_observation'],
    [99,'temporary_observation'],[100,'ctt_review_candidate'],[199,'ctt_review_candidate'],
    [200,'larger_sample_review_candidate']])('labels n=%i as %s', (n,label)=>expect(coverageBand(n)).toBe(label))
  it('retains zero-data status and excludes historic revision answers',()=>{
    const result=buildReadinessReport(snapshot(),pool)
    expect(result.status).toBe('awaiting_pilot_responses')
    expect(result.currentRevisionResponses).toBe(0)
    expect(result.excludedOtherRevisionResponses).toBe(200)
    expect(result.items.every(i=>i.pilotResponsesTo100===100)).toBe(true)
  })
  it.each([30,100,200,5000])('never calibrates or authorizes levels from n=%i alone',n=>{
    const result=buildReadinessReport(snapshot(n),pool)
    expect(result.calibrated).toBe(false)
    expect(result.levelMeasurementAuthorized).toBe(false)
    expect(result.status).toBe('descriptive_evidence_only')
    expect(result.blockers).toContain('MODEL_FIT_AND_VALIDITY_NOT_ESTABLISHED')
  })
  it('does not count all-mode observations as pilot evidence',()=>{
    const input=snapshot(); input.items.forEach(i=>{i.rawN=200;i.descriptiveN=150})
    expect(buildReadinessReport(input,pool).status).toBe('awaiting_pilot_responses')
  })
  it.each([
    s=>s.items.pop(), s=>s.items.push(s.items[0]), s=>s.items[1].revisionId=s.items[0].revisionId,
    s=>s.items[1].questionId=s.items[0].questionId, s=>s.items[0].pinMatches=false,
    s=>s.items[0].role='unknown', s=>s.items[0].role='common_geography',
    s=>s.items[0].rawN=-1, s=>s.items[0].rawN=1.5, s=>s.items[0].descriptiveN=1,
    s=>s.items[0].pilotN=1, s=>s.completedAttempts=1, s=>s.poolId=id(111),
    s=>s.policyVersion='tyt-social-2026-v1', s=>s.v3PolicyPresent=false,
    s=>s.manifestSha256='', s=>s.checkedAt='unknown', s=>s.items[0].contentSha256='bad',
  ])('rejects incomplete or inconsistent evidence #%#',mutate=>{
    const input=snapshot(); mutate(input)
    expect(()=>buildReadinessReport(input,pool)).toThrow()
  })
  it('allowlists output fields and does not spread accidental personal data',()=>{
    const input=snapshot(); input.email='private'; input.items[0].userId=id(1)
    const result=JSON.stringify(buildReadinessReport(input,pool))
    expect(result).not.toContain('private'); expect(result).not.toContain('userId')
  })
  it('produces only a bounded read-only query with pin and historical exclusion checks',()=>{
    const sql=readinessSql(pool)
    expect(sql).toContain('REPEATABLE READ READ ONLY')
    expect(sql).toContain("statement_timeout = '30s'")
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i)
    expect(sql).toContain('s.content_sha256=p.content_sha256')
    expect(sql).toContain('earlier.question_id=a.question_id')
    expect(sql).toContain('public.adaptive_diagnostic_answers')
    expect(sql).not.toContain('time_taken_sec BETWEEN')
    expect(()=>readinessSql("'; DELETE FROM public.questions; --")).toThrow()
  })
})

const bin=process.env.SOURCE_REVIEW_PG_BIN
if(process.env.SOURCE_REVIEW_PG_REQUIRED==='1' && !bin) throw new Error('SOURCE_REVIEW_PG_BIN required')
// Real PostgreSQL executes the actual read-only report. Minimal source tables
// and a policy-marker stub are explicit seams, not an end-to-end migration test.
;(bin ? describe : describe.skip)('native read-only coverage exclusion semantics',()=>{
  let db
  beforeAll(async()=>{
    db=await startSourceReviewPostgres(bin)
    await db.exec(`
      CREATE TABLE public.tyt_social_reviewed_preparation_pools(id uuid, pins jsonb, policy_version text, manifest_sha256 text);
      CREATE TABLE public.question_content_revisions(id uuid, question_id uuid, content_sha256 text);
      CREATE TABLE public.session_answers(id uuid, session_id uuid, user_id uuid, question_id uuid, question_revision_id uuid,
        is_skipped boolean, selected_option smallint, answered_at timestamptz);
      CREATE TABLE public.game_sessions(id uuid, user_id uuid, status text);
      CREATE TABLE public.verified_attempts(id uuid, session_id uuid, user_id uuid, completed_at timestamptz);
      CREATE TABLE public.verified_attempt_question_revisions(attempt_id uuid,question_id uuid,revision_id uuid,content_sha256 text);
      CREATE TABLE public.verified_attempt_candidate_policy_snapshots(attempt_id uuid,user_id uuid,policy_version text,artifact_kind text);
      CREATE TABLE public.verified_attempt_hint_events(attempt_id uuid,question_id uuid);
      CREATE TABLE public.adaptive_diagnostic_answers(user_id uuid,question_id uuid,created_at timestamptz);
      CREATE FUNCTION public.materialize_question_revision_psychometrics(uuid,uuid,timestamptz,timestamptz,uuid)
        RETURNS text LANGUAGE SQL AS $$ SELECT '${V3}'::text $$;
    `)
    const pins=snapshot().items.map(i=>({questionId:i.questionId,revisionId:i.revisionId,contentSha256:i.contentSha256,examRole:i.role}))
    await db.query('INSERT INTO public.tyt_social_reviewed_preparation_pools VALUES($1,$2,$3,$4)',
      [pool,JSON.stringify(pins),'tyt-social-2027-v1','a'.repeat(64)])
    for(const i of pins) await db.query('INSERT INTO public.question_content_revisions VALUES($1,$2,$3)',[i.revisionId,i.questionId,i.contentSha256])
  },60_000)
  afterAll(async()=>{await db?.close()},45_000)
  beforeEach(async()=>{
    await db.exec(`TRUNCATE public.session_answers,public.game_sessions,public.verified_attempts,
      public.verified_attempt_question_revisions,public.verified_attempt_candidate_policy_snapshots,
      public.verified_attempt_hint_events,public.adaptive_diagnostic_answers;`)
  })
  const user=id(900), attempt=id(800), session=id(700)
  async function seed(){
    await db.query('INSERT INTO public.session_answers VALUES($1,$2,$3,$4,$5,false,2,$6)',
      [id(600),session,user,id(0),id(100),'2026-01-02T00:00:00Z'])
    await db.query("INSERT INTO public.game_sessions VALUES($1,$2,'completed')",[session,user])
    await db.query('INSERT INTO public.verified_attempts VALUES($1,$2,$3,$4)',[attempt,session,user,'2026-01-02T00:01:00Z'])
    await db.query('INSERT INTO public.verified_attempt_question_revisions VALUES($1,$2,$3,$4)',[attempt,id(0),id(100),'b'.repeat(64)])
    await db.query("INSERT INTO public.verified_attempt_candidate_policy_snapshots VALUES($1,$2,'tyt-social-2027-v1','practice')",[attempt,user])
  }
  async function read(){
    const result=await db.exec(readinessSql(pool))
    return result.find(r=>r.rows?.[0]?.snapshot)?.rows[0].snapshot
  }
  const first = s=>s.items.find(i=>i.questionId===id(0))
  it('returns all zero pins without inserting psychometric rows',async()=>{
    const s=await read()
    expect(s.items).toHaveLength(25)
    expect(buildReadinessReport(s,pool).status).toBe('awaiting_pilot_responses')
    expect((await db.query('SELECT count(*)::int n FROM public.session_answers')).rows[0].n).toBe(0)
  })
  it('counts a matched completed first answer and still refuses calibration',async()=>{
    await seed();const s=await read()
    expect(first(s)).toMatchObject({rawN:1,descriptiveN:1,pilotN:1})
    expect(buildReadinessReport(s,pool).calibrated).toBe(false)
  })
  it.each([
    ['unfinished', 'UPDATE public.verified_attempts SET completed_at=NULL'],
    ['wrong owner', `UPDATE public.verified_attempts SET user_id='${id(9999)}'`],
    ['unfinished game', "UPDATE public.game_sessions SET status='abandoned'"],
    ['snapshot hash mismatch', "UPDATE public.verified_attempt_question_revisions SET content_sha256='bad'"],
    ['hint', `INSERT INTO public.verified_attempt_hint_events VALUES('${attempt}','${id(0)}')`],
    ['skip', 'UPDATE public.session_answers SET is_skipped=true'],
    ['missing answer', 'UPDATE public.session_answers SET selected_option=NULL'],
    ['invalid option', 'UPDATE public.session_answers SET selected_option=5'],
    ['earlier revision answer', `INSERT INTO public.session_answers VALUES('${id(599)}','${session}','${user}','${id(0)}','${id(99)}',false,2,'2026-01-01Z')`],
    ['earlier diagnostic', `INSERT INTO public.adaptive_diagnostic_answers VALUES('${user}','${id(0)}','2026-01-01Z')`],
  ])('excludes %s',async(_,mutation)=>{
    await seed();await db.exec(mutation)
    expect(first(await read())).toMatchObject({rawN:1,descriptiveN:0,pilotN:0})
  })
  it('keeps other forms descriptive but not pilot evidence',async()=>{
    await seed();await db.exec("UPDATE public.verified_attempt_candidate_policy_snapshots SET policy_version='tyt-social-2026-v1'")
    const s=await read();expect(first(s)).toMatchObject({descriptiveN:1,pilotN:0})
    expect(buildReadinessReport(s,pool).status).toBe('awaiting_pilot_responses')
  })
  it('does not exclude a prior answer to a different question',async()=>{
    await seed();await db.query('INSERT INTO public.adaptive_diagnostic_answers VALUES($1,$2,$3)',[user,id(1),'2026-01-01Z'])
    expect(first(await read()).pilotN).toBe(1)
  })
})
