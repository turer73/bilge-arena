// Opt-in disposable PostgreSQL proof for the actual 081 -> 091 -> 092 -> 100 chain.
// Set VERIFIED_ATTEMPTS_TEST_DATABASE_URL=.../bilge_r02_test_<name> and
// VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE=1.  This suite never targets a shared DB.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const { Client } = pg
const url = process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_URL
const confirmed = process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE === '1'
if (url && (!confirmed || !/^bilge_r02_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1)))) throw new Error('refusing non-disposable verified-attempt database')
const describePg = url && confirmed ? describe : describe.skip
const migration = (file) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', file), 'utf8')
let client; let userId; let otherUserId; let questions; let attemptId; let sessionId

const fixture = `
CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN ALTER ROLE service_role BYPASSRLS; END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.profiles(id uuid PRIMARY KEY,xp integer NOT NULL DEFAULT 0,coins integer NOT NULL DEFAULT 0);
CREATE TABLE public.questions(id uuid PRIMARY KEY,game text NOT NULL,is_active boolean NOT NULL DEFAULT true,exam_ref text,category text);
CREATE TABLE public.game_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id),client_request_id uuid NOT NULL,game text NOT NULL,mode text NOT NULL,status text NOT NULL,total_questions integer NOT NULL,correct_count smallint NOT NULL,wrong_count smallint NOT NULL,skipped_count smallint NOT NULL,base_xp integer NOT NULL,bonus_xp integer NOT NULL,total_xp integer NOT NULL,time_spent_sec integer NOT NULL,avg_time_sec numeric NOT NULL,streak_at_start integer NOT NULL,filter_category text,filter_difficulty smallint,completed_at timestamptz,UNIQUE(user_id,client_request_id));
CREATE TABLE public.session_answers(session_id uuid NOT NULL REFERENCES public.game_sessions(id),question_id uuid NOT NULL,user_id uuid NOT NULL,selected_option smallint,is_correct boolean,is_skipped boolean,time_taken_sec numeric,is_fast boolean,xp_earned smallint,question_order smallint);
CREATE TABLE public.user_topic_progress(user_id uuid NOT NULL,game text NOT NULL,category text NOT NULL,questions_seen integer NOT NULL,correct integer NOT NULL,last_seen_at timestamptz NOT NULL,PRIMARY KEY(user_id,game,category));
CREATE FUNCTION public.batch_increment_question_stats(uuid[],boolean[]) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.increment_coins(uuid,integer) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.increment_xp(uuid,integer,text,uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
`
const items = (ids) => ids.map((id, position) => ({ questionId: id, position, sourceBucket: position % 3 === 0 ? 'wrong' : position % 3 === 1 ? 'weak' : 'coverage' }))
async function service(fn) { await client.query('SET ROLE service_role'); try { return await fn() } finally { await client.query('RESET ROLE') } }
async function issue(requestId = randomUUID()) { const r = await service(() => client.query('SELECT public.issue_verified_exam_attempt($1,$2,$3,$4,$5::jsonb,$6,$7,$8) result',[userId,'matematik','TYT','pilot-v1',JSON.stringify(items(questions)),600,120,requestId])); return r.rows[0].result }
async function start(id, requestId = randomUUID()) { const r = await service(() => client.query('SELECT public.start_verified_exam_attempt($1,$2,$3) result',[id,userId,requestId])); return r.rows[0].result }
async function event(id, requestId, sequence, position, type) { const r = await service(() => client.query('SELECT public.record_verified_exam_strategy_event($1,$2,$3,$4,$5::smallint,$6) result',[id,userId,requestId,sequence,position,type])); return r.rows[0].result }
async function complete(id) { const answer = JSON.stringify([{question_id:questions[0],selected_option:1,is_correct:true,is_skipped:false,time_taken_sec:999,is_fast:false,xp_earned:7,question_order:0}]); const r=await service(()=>client.query(`SELECT public.complete_verified_game_session($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::text,$7::smallint,$8::jsonb,$9::integer,$10::integer,$11::integer,$12::smallint,$13::smallint,$14::integer,$15::numeric) result`,[id,userId,randomUUID(),'matematik','deneme','fixture',1,answer,7,7,0,1,0,1,1])); return r.rows[0].result }

describePg('100 verified exam strategy migrations', () => {
  beforeAll(async () => {
    client = new Client({ connectionString: url }); await client.connect()
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;')
    await client.query(fixture); await client.query(migration('081_atomic_complete_game_session.sql')); await client.query(migration('091_verified_attempts.sql')); await client.query(migration('092_complete_verified_game_session.sql')); await client.query(migration('100_verified_exam_strategy_experiments.sql'))
    userId=randomUUID(); otherUserId=randomUUID(); await client.query('INSERT INTO public.profiles(id) VALUES($1),($2)',[userId,otherUserId]); questions=Array.from({length:40},()=>randomUUID());
    for (const id of questions) await client.query('INSERT INTO public.questions(id,game,is_active,exam_ref,category) VALUES($1,$2,true,$3,$4)',[id,'matematik','TYT','fixture'])
    const draftIssue=await service(()=>client.query('SELECT public.issue_verified_exam_attempt($1,$2,$3,$4,$5::jsonb,$6,$7,$8) result',[otherUserId,'matematik','TYT','pilot-v1',JSON.stringify(items(questions)),600,120,randomUUID()]))
    const draftStart=await service(()=>client.query('SELECT public.start_verified_exam_attempt($1,$2,$3) result',[draftIssue.rows[0].result.attemptId,otherUserId,randomUUID()]))
    expect(draftStart.rows[0].result.experiment).toBeNull()
    await client.query("UPDATE public.controlled_experiments SET status='active',allocation_bps=10000,activated_at=clock_timestamp() WHERE experiment_key='mock_strategy_analysis_v1' AND revision=1")
  })
  afterAll(async()=>{ if(client) await client.end() })

  it('enforces private RLS/ACL and immutable metadata', async () => {
    const r=await client.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.verified_exam_attempts'::regclass"); expect(r.rows[0].relrowsecurity).toBe(true)
    const p=await client.query("SELECT has_table_privilege('service_role','public.verified_exam_attempts','INSERT') allowed"); expect(p.rows[0].allowed).toBe(false)
    const issued=await issue(); attemptId=issued.attemptId; expect(issued.status).toBe('issued')
    const lostResponseReplay=await issue(randomUUID()); expect(lostResponseReplay).toMatchObject({attemptId,replayed:true})
    const issueRequestId=(await client.query('SELECT issue_request_id FROM public.verified_exam_attempts WHERE attempt_id=$1',[attemptId])).rows[0].issue_request_id
    const changedBuckets=items(questions); changedBuckets[0].sourceBucket='weak'
    await expect(service(()=>client.query('SELECT public.issue_verified_exam_attempt($1,$2,$3,$4,$5::jsonb,$6,$7,$8)',[userId,'matematik','TYT','pilot-v1',JSON.stringify(changedBuckets),600,120,issueRequestId]))).rejects.toMatchObject({code:'22023'})
    await expect(client.query('UPDATE public.verified_exam_attempts SET blueprint_version=$2 WHERE attempt_id=$1',[attemptId,'changed'])).rejects.toMatchObject({ code:'42501' })
  })

  it('replays issue/start and rejects a different owner or invalid event order', async () => {
    const replay=await issue((await client.query('SELECT issue_request_id FROM public.verified_exam_attempts WHERE attempt_id=$1',[attemptId])).rows[0].issue_request_id); expect(replay.attemptId).toBe(attemptId); expect(replay.replayed).toBe(true)
    const started=await start(attemptId); const same=await start(attemptId,randomUUID()); expect(same.replayed).toBe(true); expect(same.startedAt).toBe(started.startedAt); expect(same.experiment).toEqual(expect.objectContaining({key:'mock_strategy_analysis_v1',revision:1,variant:'treatment'})); expect(started.experiment).toEqual(same.experiment)
    await expect(service(()=>client.query('SELECT public.start_verified_exam_attempt($1,$2,$3)',[attemptId,otherUserId,randomUUID()]))).rejects.toMatchObject({code:'42501'})
    await expect(event(attemptId,randomUUID(),1,39,'question_opened')).rejects.toMatchObject({code:'22023'})
    const answeredFirst=await event(attemptId,randomUUID(),2,0,'answer_submitted'); expect(answeredFirst.replayed).toBe(false)
    const opened=await event(attemptId,randomUUID(),1,0,'question_opened'); const openedReplay=await event(attemptId,randomUUID(),1,0,'question_opened'); expect(openedReplay.serverReceivedAt).toEqual(opened.serverReceivedAt); expect(openedReplay.replayed).toBe(true)
    await event(attemptId,randomUUID(),3,1,'question_opened'); await event(attemptId,randomUUID(),4,1,'answer_submitted')
    expect((await client.query('SELECT count(*)::int count FROM public.verified_exam_strategy_events WHERE attempt_id=$1 AND position=0',[attemptId])).rows[0].count).toBe(2)
    await expect(event(attemptId,randomUUID(),3,null,'exam_submitted')).rejects.toMatchObject({code:'22023'})
  })

  it('finalizes only after the existing verified core completion, then returns bounded receipt evidence and one exposure', async () => {
    await expect(service(()=>client.query('SELECT public.finalize_verified_exam_attempt($1,$2,$3)',[attemptId,userId,randomUUID()]))).rejects.toMatchObject({code:'22023'})
    const completed=await complete(attemptId); sessionId=completed.sessionId
    const f=await service(()=>client.query('SELECT public.finalize_verified_exam_attempt($1,$2,$3) result',[attemptId,userId,randomUUID()])); expect(f.rows[0].result.sessionId).toBe(sessionId)
    const terminal=await client.query("SELECT sequence,event_type,server_received_at FROM public.verified_exam_strategy_events WHERE attempt_id=$1 AND event_type='exam_submitted'",[attemptId]); expect(terminal.rows).toHaveLength(1); expect(terminal.rows[0].sequence).toBe(81)
    const finalizeRequestId=(await client.query('SELECT finalize_request_id FROM public.verified_exam_attempts WHERE attempt_id=$1',[attemptId])).rows[0].finalize_request_id
    const replayFinalize=await service(()=>client.query('SELECT public.finalize_verified_exam_attempt($1,$2,$3) result',[attemptId,userId,finalizeRequestId])); expect(replayFinalize.rows[0].result.replayed).toBe(true)
    expect((await client.query("SELECT count(*)::int count FROM public.verified_exam_strategy_events WHERE attempt_id=$1 AND event_type='exam_submitted'",[attemptId])).rows[0].count).toBe(1)
    const evidence=await service(()=>client.query('SELECT public.get_verified_exam_strategy_evidence($1,$2) result',[attemptId,userId])); expect(evidence.rows[0].result).toMatchObject({experimentKey:'mock_strategy_analysis_v1',revision:1,variant:'treatment',plannedCount:40}); expect(evidence.rows[0].result.items[0]).toEqual(expect.objectContaining({position:0,answered:true,isCorrect:true})); expect(JSON.stringify(evidence.rows[0].result)).not.toContain(questions[0])
    const x=await service(()=>client.query("SELECT public.record_verified_exam_exposure($1,$2,'mock_strategy_analysis_v1',1,$3) result",[attemptId,userId,randomUUID()])); expect(x.rows[0].result.replayed).toBe(false)
    const count=await client.query('SELECT count(*)::int count FROM public.controlled_experiment_exposures WHERE attempt_id=$1',[attemptId]); expect(count.rows[0].count).toBe(1)
  })
})
