// Opt-in disposable PostgreSQL coverage for 086 -> 091 -> 094 -> 096 -> 097 -> 202.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const url = process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_URL
const enabled = Boolean(url && process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE === '1')
if (url && !/^bilge_r02_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error('non-disposable database refused')
const describePg = enabled ? describe : describe.skip
const base = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const read = (name) => readFileSync(join(base, name), 'utf8')
const { Client } = pg

describePg('097 mastery evidence v2 real PostgreSQL', () => {
  let client; let user; let other; let upgradeUser; let question; let question2; let attempt; let session; let answer; let answer2
  let historicalQuestion1; let historicalQuestion2; let historicalAttempt1; let historicalAttempt2; let historicalAnswer1; let historicalAnswer2
  let upgradeOutcome; let upgradeAttempts; let upgradeAnswers; let upgradeFailureCode; let upgradeRollbackProof
  beforeAll(async () => {
    client = new Client({ connectionString: url }); await client.connect()
    await client.query(`DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      ALTER ROLE service_role BYPASSRLS; REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated,service_role; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY);
      CREATE TABLE public.questions(id uuid PRIMARY KEY,game varchar(20) NOT NULL,category varchar(30) NOT NULL,difficulty smallint NOT NULL CHECK(difficulty BETWEEN 1 AND 5),exam_ref varchar(20),is_active boolean NOT NULL DEFAULT true);
      CREATE TABLE public.game_sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.profiles(id),client_request_id uuid,total_xp integer DEFAULT 0,correct_count smallint DEFAULT 0,wrong_count smallint DEFAULT 0);
      CREATE TABLE public.session_answers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES public.game_sessions(id),question_id uuid NOT NULL REFERENCES public.questions(id),user_id uuid NOT NULL REFERENCES public.profiles(id),is_correct boolean NOT NULL,is_skipped boolean,time_taken_sec numeric,is_fast boolean,answered_at timestamptz NOT NULL DEFAULT clock_timestamp());`)
    user=randomUUID(); other=randomUUID(); upgradeUser=randomUUID(); question=randomUUID(); question2=randomUUID(); attempt=randomUUID(); session=randomUUID(); answer=randomUUID(); answer2=randomUUID()
    await client.query('INSERT INTO public.profiles VALUES($1),($2),($3)',[user,other,upgradeUser])
    await client.query("INSERT INTO public.questions VALUES($1,'matematik','sayilar',4,'TYT',true),($2,'matematik','sayilar',4,'TYT',true)",[question,question2])
    for (const migration of ['086_outcome_mastery_pilot.sql','091_verified_attempts.sql','094_persistent_fsrs.sql','096_curriculum_graph_v1.sql']) await client.query(read(migration))
    historicalQuestion1=randomUUID(); historicalQuestion2=randomUUID(); historicalAttempt1=randomUUID(); historicalAttempt2=randomUUID(); historicalAnswer1=randomUUID(); historicalAnswer2=randomUUID()
    const hs1=randomUUID(); const hs2=randomUUID()
    await client.query("INSERT INTO public.questions VALUES($1,'fen','legacy',3,'LGS',true),($2,'fen','legacy',3,'LGS',true)",[historicalQuestion1,historicalQuestion2])
    await client.query('INSERT INTO public.game_sessions(id,user_id,client_request_id) VALUES($1,$2,$3),($4,$2,$5)',[hs1,user,randomUUID(),hs2,randomUUID()])
    await client.query("INSERT INTO public.verified_attempts(id,user_id,game,mode,question_ids,duration_sec,expires_at,completed_at,session_id) VALUES($1,$2,'fen','classic',$3,60,clock_timestamp()+interval '1 hour',clock_timestamp(),$4),($5,$2,'fen','classic',$6,60,clock_timestamp()+interval '1 hour',clock_timestamp(),$7)",[historicalAttempt1,user,[historicalQuestion1],hs1,historicalAttempt2,[historicalQuestion2],hs2])
    await client.query("INSERT INTO public.session_answers(id,session_id,question_id,user_id,is_correct,time_taken_sec,is_fast,answered_at) VALUES($1,$2,$3,$4,true,4,false,clock_timestamp()-interval '25 hours'),($5,$6,$7,$4,false,6,true,clock_timestamp()-interval '2 hours')",[historicalAnswer1,hs1,historicalQuestion1,user,historicalAnswer2,hs2,historicalQuestion2])
    await client.query("UPDATE public.questions SET game='matematik',category='sayilar',exam_ref='TYT' WHERE id=ANY($1::uuid[])",[[historicalQuestion1,historicalQuestion2]])
    await client.query(read('097_mastery_evidence_v2.sql'))

    upgradeOutcome=(await client.query(`SELECT mapping.outcome_id
      FROM public.question_outcomes AS mapping
      JOIN public.curriculum_outcomes AS outcome ON outcome.id=mapping.outcome_id AND outcome.is_active
      WHERE mapping.question_id=$1
      ORDER BY mapping.is_primary DESC,mapping.weight DESC,mapping.outcome_id
      LIMIT 1`,[question])).rows[0].outcome_id
    const completionRow=(await client.query(`WITH tr_day AS (
        SELECT (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date AS value
      ) SELECT
        ((value-10)::timestamp+interval '10 hours') AT TIME ZONE 'Europe/Istanbul' AS same_one,
        ((value-10)::timestamp+interval '12 hours') AT TIME ZONE 'Europe/Istanbul' AS same_two,
        ((value-9)::timestamp+interval '10 hours') AT TIME ZONE 'Europe/Istanbul' AS other_day
      FROM tr_day`)).rows[0]
    const legacyCompletions=[completionRow.same_one,completionRow.same_two,completionRow.other_day]
    upgradeAttempts=[]; upgradeAnswers=[]
    for (const completedAt of legacyCompletions) {
      const legacyAttempt=randomUUID(); const legacySession=randomUUID(); const legacyAnswer=randomUUID()
      await client.query(`INSERT INTO public.verified_attempts(
        id,user_id,game,mode,question_ids,duration_sec,started_at,expires_at
      ) VALUES($1,$2,'matematik','practice',$3,60,$4::timestamptz-interval '5 minutes',$4::timestamptz+interval '1 hour')`,[
        legacyAttempt,upgradeUser,[question],completedAt,
      ])
      await client.query('INSERT INTO public.game_sessions(id,user_id,client_request_id) VALUES($1,$2,$3)',[
        legacySession,upgradeUser,randomUUID(),
      ])
      await client.query(`INSERT INTO public.session_answers(
        id,session_id,question_id,user_id,is_correct,time_taken_sec,is_fast,answered_at
      ) VALUES($1,$2,$3,$4,true,5,false,$5::timestamptz)`,[
        legacyAnswer,legacySession,question,upgradeUser,completedAt,
      ])
      await client.query(`UPDATE public.verified_attempts
        SET completed_at=$2::timestamptz,session_id=$3 WHERE id=$1`,[
        legacyAttempt,completedAt,legacySession,
      ])
      upgradeAttempts.push(legacyAttempt); upgradeAnswers.push(legacyAnswer)
    }
    expect((await client.query(`SELECT count(*)::integer AS count
      FROM public.mastery_outcome_evidence
      WHERE attempt_id=ANY($1::uuid[]) AND outcome_id=$2`,[
      upgradeAttempts,upgradeOutcome,
    ])).rows[0]).toEqual({count:3})

    await client.query(read('202_mastery_distinct_evidence_days.sql'))

    const beforeInvalidRetry=(await client.query(`SELECT
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence_days
        WHERE user_id=$1 AND outcome_id=$2) AS ledger_count,
      (SELECT verified_evidence_days FROM public.user_outcome_state
        WHERE user_id=$1 AND outcome_id=$2) AS state_days`,[
      upgradeUser,upgradeOutcome,
    ])).rows[0]
    await client.query(`ALTER TABLE public.mastery_outcome_evidence
      DISABLE TRIGGER trg_mastery_evidence_verified_day_immutable`)
    try {
      await client.query(`UPDATE public.mastery_outcome_evidence
        SET verified_completed_at=verified_completed_at+interval '1 day'
        WHERE answer_id=$1 AND outcome_id=$2`,[upgradeAnswers[0],upgradeOutcome])
    } finally {
      await client.query(`ALTER TABLE public.mastery_outcome_evidence
        ENABLE TRIGGER trg_mastery_evidence_verified_day_immutable`)
    }

    let invalidRetryError
    try {
      await client.query(read('202_mastery_distinct_evidence_days.sql'))
    } catch (error) {
      invalidRetryError=error
    } finally {
      await client.query('ROLLBACK')
    }
    upgradeFailureCode=invalidRetryError?.code
    upgradeRollbackProof=(await client.query(`SELECT
      evidence.verified_completed_at IS DISTINCT FROM attempt.completed_at AS mismatch_preserved,
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence_days AS evidence_day
        WHERE evidence_day.user_id=$3 AND evidence_day.outcome_id=$2) AS ledger_count,
      (SELECT state.verified_evidence_days FROM public.user_outcome_state AS state
        WHERE state.user_id=$3 AND state.outcome_id=$2) AS state_days,
      (SELECT trigger.tgenabled='O' FROM pg_catalog.pg_trigger AS trigger
        WHERE trigger.tgrelid='public.mastery_outcome_evidence'::regclass
          AND trigger.tgname='trg_mastery_evidence_verified_day_immutable') AS immutable_trigger_restored
      FROM public.mastery_outcome_evidence AS evidence
      JOIN public.verified_attempts AS attempt ON attempt.id=evidence.attempt_id
      WHERE evidence.answer_id=$1 AND evidence.outcome_id=$2`,[
      upgradeAnswers[0],upgradeOutcome,upgradeUser,
    ])).rows[0]
    expect(upgradeRollbackProof.ledger_count).toBe(beforeInvalidRetry.ledger_count)
    expect(upgradeRollbackProof.state_days).toBe(beforeInvalidRetry.state_days)

    await client.query(`ALTER TABLE public.mastery_outcome_evidence
      DISABLE TRIGGER trg_mastery_evidence_verified_day_immutable`)
    try {
      await client.query(`UPDATE public.mastery_outcome_evidence AS evidence
        SET verified_completed_at=attempt.completed_at
        FROM public.verified_attempts AS attempt
        WHERE attempt.id=evidence.attempt_id
          AND evidence.answer_id=$1 AND evidence.outcome_id=$2`,[
        upgradeAnswers[0],upgradeOutcome,
      ])
    } finally {
      await client.query(`ALTER TABLE public.mastery_outcome_evidence
        ENABLE TRIGGER trg_mastery_evidence_verified_day_immutable`)
    }
    await client.query(read('202_mastery_distinct_evidence_days.sql'))
    const afterCleanRetry=(await client.query(`SELECT
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence_days
        WHERE user_id=$1 AND outcome_id=$2) AS ledger_count,
      (SELECT verified_evidence_days FROM public.user_outcome_state
        WHERE user_id=$1 AND outcome_id=$2) AS state_days`,[
      upgradeUser,upgradeOutcome,
    ])).rows[0]
    await client.query(read('202_mastery_distinct_evidence_days.sql'))
    const afterIdempotentRetry=(await client.query(`SELECT
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence_days
        WHERE user_id=$1 AND outcome_id=$2) AS ledger_count,
      (SELECT verified_evidence_days FROM public.user_outcome_state
        WHERE user_id=$1 AND outcome_id=$2) AS state_days`,[
      upgradeUser,upgradeOutcome,
    ])).rows[0]
    expect(afterIdempotentRetry).toEqual(afterCleanRetry)
  })
  afterAll(async()=>client?.end())
  async function role(name, fn) { await client.query(`SET ROLE ${name}`); try { return await fn() } finally { await client.query('RESET ROLE') } }

  it('upgrades legacy evidence into immutable Türkiye-day provenance and fails closed on a mismatched reapply', async () => {
    expect(upgradeFailureCode).toBe('23514')
    expect(upgradeRollbackProof).toEqual({
      mismatch_preserved:true,
      ledger_count:2,
      state_days:2,
      immutable_trigger_restored:true,
    })
    const backfill=(await client.query(`SELECT
      count(*)::integer AS evidence_count,
      count(DISTINCT evidence.evidence_day_tr)::integer AS distinct_days,
      bool_and(evidence.verified_completed_at=attempt.completed_at) AS completion_bound,
      bool_and(evidence.evidence_day_tr=(attempt.completed_at AT TIME ZONE 'Europe/Istanbul')::date) AS tr_bound,
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence_days AS evidence_day
        WHERE evidence_day.user_id=$2 AND evidence_day.outcome_id=$3) AS ledger_count,
      (SELECT state.verified_evidence_days FROM public.user_outcome_state AS state
        WHERE state.user_id=$2 AND state.outcome_id=$3) AS state_days
      FROM public.mastery_outcome_evidence AS evidence
      JOIN public.verified_attempts AS attempt ON attempt.id=evidence.attempt_id
      WHERE evidence.attempt_id=ANY($1::uuid[]) AND evidence.outcome_id=$3`,[
      upgradeAttempts,upgradeUser,upgradeOutcome,
    ])).rows[0]
    expect(backfill).toEqual({
      evidence_count:3,
      distinct_days:2,
      completion_bound:true,
      tr_bound:true,
      ledger_count:2,
      state_days:2,
    })
  })

  it('aggregates two same-outcome answers once per state row without replay or base drift', async () => {
    await client.query('INSERT INTO public.verified_attempts(id,user_id,game,mode,question_ids,duration_sec,expires_at) VALUES($1,$2,\'matematik\',\'classic\',$3,60,clock_timestamp()+interval \'1 hour\')',[attempt,user,[question,question2]])
    expect((await client.query('SELECT public.record_verified_hint_event($1,$2,$3,$4::smallint) result',[attempt,user,question,4])).rows[0].result).toEqual({recorded:true})
    expect((await client.query('SELECT public.record_verified_hint_event($1,$2,$3,$4::smallint) result',[attempt,user,question,4])).rows[0].result).toEqual({recorded:false})
    await client.query('INSERT INTO public.game_sessions(id,user_id,client_request_id) VALUES($1,$2,$3)',[session,user,randomUUID()])
    await client.query('INSERT INTO public.session_answers(id,session_id,question_id,user_id,is_correct,time_taken_sec,is_fast,answered_at) VALUES($1,$2,$3,$4,false,7,true,clock_timestamp()),($5,$2,$6,$4,true,5,false,clock_timestamp())',[answer,session,question,user,answer2,question2])
    const before=(await client.query('SELECT attempts,weighted_possible FROM public.user_outcome_state WHERE user_id=$1',[user])).rows[0]
    const preMaterializationLog=(await client.query('SELECT id FROM public.review_logs WHERE answer_id=$1',[answer])).rows[0].id
    await client.query("INSERT INTO public.review_error_annotations(review_log_id,user_id,reason_code) VALUES($1,$2,'guess')",[preMaterializationLog,user])
    await client.query('UPDATE public.verified_attempts SET completed_at=clock_timestamp(),session_id=$2 WHERE id=$1',[attempt,session])
    const evidence=(await client.query('SELECT difficulty,difficulty_weighted_possible,time_taken_sec,fast_wrong,max_hint_stage,base_already_recorded FROM public.mastery_outcome_evidence WHERE answer_id=$1',[answer])).rows[0]
    expect(evidence).toEqual({difficulty:4,difficulty_weighted_possible:'4.000',time_taken_sec:'7.00',fast_wrong:true,max_hint_stage:4,base_already_recorded:true})
    const state=(await client.query('SELECT attempts,weighted_possible,v2_attempts,difficulty_weighted_possible,timed_attempts,total_time_sec,fast_wrong,hinted_attempts,hint_stage_sum,guess_annotations,careless_annotations,verified_evidence_days FROM public.user_outcome_state WHERE user_id=$1',[user])).rows[0]
    expect(state.attempts).toBe(before.attempts); expect(state.weighted_possible).toBe(before.weighted_possible)
    expect(state).toMatchObject({v2_attempts:2,difficulty_weighted_possible:'8.000',timed_attempts:2,total_time_sec:'12.00',fast_wrong:1,hinted_attempts:1,hint_stage_sum:4,guess_annotations:1,careless_annotations:0,verified_evidence_days:1})
    await expect(client.query('UPDATE public.user_outcome_state SET v2_attempts=attempts+1 WHERE user_id=$1',[user])).rejects.toMatchObject({code:'23514'})
    await client.query('SELECT public.materialize_verified_attempt_mastery($1)',[attempt])
    expect((await client.query('SELECT count(*) FROM public.mastery_outcome_evidence WHERE attempt_id=$1',[attempt])).rows[0].count).toBe('2')
  })

  it('counts one evidence unit per Türkiye day from verified completion, not answer time', async () => {
    const baseDay=(await client.query("SELECT to_char(evidence_day_tr,'YYYY-MM-DD') AS evidence_day FROM public.mastery_outcome_evidence WHERE attempt_id=$1 LIMIT 1",[attempt])).rows[0].evidence_day
    const completions=[
      `${baseDay}T23:00:00Z`,
      (await client.query("SELECT ($1::date+1)::text AS evidence_day",[baseDay])).rows[0].evidence_day+'T01:00:00Z',
      (await client.query("SELECT ($1::date+2)::text AS evidence_day",[baseDay])).rows[0].evidence_day+'T01:00:00Z',
    ]
    const inserted=[]
    for (let index=0; index<completions.length; index+=1) {
      const nextAttempt=randomUUID(); const nextSession=randomUUID(); const nextAnswer=randomUUID()
      await client.query("INSERT INTO public.verified_attempts(id,user_id,game,mode,question_ids,duration_sec,started_at,expires_at) VALUES($1,$2,'matematik','practice',$3,60,$4::timestamptz-interval '5 minutes',$4::timestamptz+interval '1 hour')",[nextAttempt,user,[question],completions[index]])
      await client.query('INSERT INTO public.game_sessions(id,user_id,client_request_id) VALUES($1,$2,$3)',[nextSession,user,randomUUID()])
      // This client-influenced answer time is deliberately unrelated to the
      // verified completion day and must never choose the Discovery day.
      await client.query("INSERT INTO public.session_answers(id,session_id,question_id,user_id,is_correct,answered_at) VALUES($1,$2,$3,$4,true,('2040-01-01'::date+$5::int)::timestamptz)",[nextAnswer,nextSession,question,user,index])
      await client.query('UPDATE public.verified_attempts SET completed_at=$2::timestamptz,session_id=$3 WHERE id=$1',[nextAttempt,completions[index],nextSession])
      inserted.push(nextAttempt)
    }

    const state=(await client.query('SELECT verified_evidence_days FROM public.user_outcome_state WHERE user_id=$1',[user])).rows[0]
    expect(state.verified_evidence_days).toBe(3)
    const proof=(await client.query(`SELECT
      count(*) count,
      bool_and(evidence.verified_completed_at=attempt.completed_at) completion_bound,
      bool_and(evidence.evidence_day_tr=(attempt.completed_at AT TIME ZONE 'Europe/Istanbul')::date) tr_bound
      FROM public.mastery_outcome_evidence evidence
      JOIN public.verified_attempts attempt ON attempt.id=evidence.attempt_id
      WHERE evidence.attempt_id=ANY($1::uuid[])`,[inserted])).rows[0]
    expect(proof).toEqual({count:'3',completion_bound:true,tr_bound:true})
    expect((await client.query('SELECT count(*) FROM public.mastery_outcome_evidence_days WHERE user_id=$1',[user])).rows[0].count).toBe('3')
    await expect(client.query("UPDATE public.mastery_outcome_evidence SET verified_completed_at=verified_completed_at+interval '1 day' WHERE attempt_id=$1",[inserted[0]])).rejects.toMatchObject({code:'55000'})
    await expect(client.query("UPDATE public.mastery_outcome_evidence_days SET evidence_day_tr=evidence_day_tr+1 WHERE first_attempt_id=$1",[inserted[0]])).rejects.toMatchObject({code:'55000'})
  })

  it('backfills pre-mapping completed attempts in bounded batches without base or V2 replay drift', async () => {
    const baseline=(await client.query('SELECT attempts,v2_attempts,weighted_possible,difficulty_weighted_possible FROM public.user_outcome_state WHERE user_id=$1',[user])).rows[0]
    await expect(client.query('SELECT public.backfill_verified_attempt_mastery($1)',[null])).rejects.toMatchObject({code:'22023'})
    await expect(client.query('SELECT public.backfill_verified_attempt_mastery(0)')).rejects.toMatchObject({code:'22023'})
    await expect(client.query('SELECT public.backfill_verified_attempt_mastery(1001)')).rejects.toMatchObject({code:'22023'})
    expect((await client.query('SELECT public.backfill_verified_attempt_mastery(1) result')).rows[0].result).toEqual({processed:1})
    expect((await client.query('SELECT public.backfill_verified_attempt_mastery(1) result')).rows[0].result).toEqual({processed:1})
    expect((await client.query('SELECT public.backfill_verified_attempt_mastery(1) result')).rows[0].result).toEqual({processed:0})
    const historical=await client.query('SELECT base_already_recorded FROM public.mastery_outcome_evidence WHERE answer_id=ANY($1::uuid[]) ORDER BY answer_id',[[historicalAnswer1,historicalAnswer2]])
    expect(historical.rows).toEqual([{base_already_recorded:false},{base_already_recorded:false}])
    const after=(await client.query('SELECT attempts,v2_attempts,weighted_possible,difficulty_weighted_possible FROM public.user_outcome_state WHERE user_id=$1',[user])).rows[0]
    expect(after).toEqual({
      attempts: baseline.attempts+2,
      v2_attempts: baseline.v2_attempts+2,
      weighted_possible: (Number(baseline.weighted_possible)+2).toFixed(3),
      difficulty_weighted_possible: (Number(baseline.difficulty_weighted_possible)+6).toFixed(3),
    })
    await client.query('SELECT public.backfill_verified_attempt_mastery(1000)')
    expect((await client.query('SELECT attempts,v2_attempts,weighted_possible,difficulty_weighted_possible FROM public.user_outcome_state WHERE user_id=$1',[user])).rows[0]).toEqual(after)
  })

  it('marks a correct retrieval after 25 hours as delayed evidence', async () => {
    const delayedAttempt=randomUUID(); const delayedSession=randomUUID(); const delayedAnswer=randomUUID()
    const delayedBefore=(await client.query('SELECT delayed_correct FROM public.user_outcome_state WHERE user_id=$1',[user])).rows[0].delayed_correct
    await client.query("INSERT INTO public.verified_attempts(id,user_id,game,mode,question_ids,duration_sec,expires_at) VALUES($1,$2,'matematik','classic',$3,60,clock_timestamp()+interval '1 hour')",[delayedAttempt,user,[historicalQuestion1]])
    await client.query('INSERT INTO public.game_sessions(id,user_id,client_request_id) VALUES($1,$2,$3)',[delayedSession,user,randomUUID()])
    await client.query('INSERT INTO public.session_answers(id,session_id,question_id,user_id,is_correct,answered_at) VALUES($1,$2,$3,$4,true,clock_timestamp())',[delayedAnswer,delayedSession,historicalQuestion1,user])
    await client.query('UPDATE public.verified_attempts SET completed_at=clock_timestamp(),session_id=$2 WHERE id=$1',[delayedAttempt,delayedSession])
    expect((await client.query('SELECT delayed_correct FROM public.mastery_outcome_evidence WHERE answer_id=$1',[delayedAnswer])).rows[0].delayed_correct).toBe(true)
    expect((await client.query('SELECT delayed_correct FROM public.user_outcome_state WHERE user_id=$1',[user])).rows[0].delayed_correct).toBe(delayedBefore+1)
  })

  it('enforces hint ownership/question/expiry and annotation deltas', async () => {
    const pending=randomUUID(); const expired=randomUUID(); const outside=randomUUID()
    await client.query("INSERT INTO public.questions VALUES($1,'matematik','sayilar',2,'TYT',true)",[outside])
    await client.query("INSERT INTO public.verified_attempts(id,user_id,game,mode,question_ids,duration_sec,started_at,expires_at) VALUES($1,$2,'matematik','classic',$3,60,clock_timestamp(),clock_timestamp()+interval '1 hour'),($4,$2,'matematik','classic',$3,60,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 minute')",[pending,user,[question],expired])
    await expect(client.query('SELECT public.record_verified_hint_event($1,$2,$3,$4::smallint)',[pending,other,question,1])).rejects.toMatchObject({code:'42501'})
    for (const params of [[pending,user,outside,1],[expired,user,question,1],[pending,user,question,0],[pending,user,question,5],[pending,user,question,null],[pending,user,null,1]]) {
      await expect(client.query('SELECT public.record_verified_hint_event($1,$2,$3,$4::smallint)',params)).rejects.toMatchObject({code:'22023'})
    }
    expect((await client.query('SELECT public.record_verified_hint_event($1,$2,$3,$4::smallint) result',[pending,user,question,1])).rows[0].result).toEqual({recorded:true})
    expect((await client.query('SELECT public.record_verified_hint_event($1,$2,$3,$4::smallint) result',[pending,user,question,1])).rows[0].result).toEqual({recorded:false})
    await expect(client.query('SELECT public.record_verified_hint_event($1,$2,$3,$4::smallint)',[attempt,user,question,1])).rejects.toMatchObject({code:'22023'})
    const log=(await client.query('SELECT id FROM public.review_logs WHERE answer_id=$1',[answer])).rows[0].id
    expect((await client.query('SELECT guess_annotations,careless_annotations FROM public.user_outcome_state WHERE user_id=$1',[user])).rows[0]).toMatchObject({guess_annotations:1,careless_annotations:0})
    await client.query("UPDATE public.review_error_annotations SET reason_code='careless' WHERE review_log_id=$1",[log])
    expect((await client.query('SELECT guess_annotations,careless_annotations FROM public.user_outcome_state WHERE user_id=$1',[user])).rows[0]).toMatchObject({guess_annotations:0,careless_annotations:1})
    await client.query("UPDATE public.review_error_annotations SET reason_code='misread' WHERE review_log_id=$1",[log])
    expect((await client.query('SELECT guess_annotations,careless_annotations FROM public.user_outcome_state WHERE user_id=$1',[user])).rows[0]).toMatchObject({guess_annotations:0,careless_annotations:0})
    await client.query('DELETE FROM public.review_error_annotations WHERE review_log_id=$1',[log])
    expect((await client.query('SELECT guess_annotations,careless_annotations FROM public.user_outcome_state WHERE user_id=$1',[user])).rows[0]).toMatchObject({guess_annotations:0,careless_annotations:0})
  })

  it('keeps raw evidence private and only grants service operational RPCs', async () => {
    const acl=await client.query(`SELECT
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.mastery_outcome_evidence'::regclass) evidence_rls,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.verified_attempt_hint_events'::regclass) hints_rls,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.mastery_materialized_attempts'::regclass) marker_rls,
      has_table_privilege('authenticated','public.mastery_outcome_evidence','SELECT') auth_read,
      has_table_privilege('service_role','public.mastery_outcome_evidence','SELECT') service_evidence_select,
      has_table_privilege('service_role','public.mastery_outcome_evidence','INSERT') service_evidence_insert,
      has_table_privilege('service_role','public.mastery_outcome_evidence','UPDATE') service_evidence_update,
      has_table_privilege('service_role','public.mastery_outcome_evidence','DELETE') service_evidence_delete,
      has_table_privilege('service_role','public.mastery_outcome_evidence','TRUNCATE') service_evidence_truncate,
      has_table_privilege('service_role','public.mastery_outcome_evidence','REFERENCES') service_evidence_references,
      has_table_privilege('service_role','public.mastery_outcome_evidence','TRIGGER') service_evidence_trigger,
      has_table_privilege('service_role','public.verified_attempt_hint_events','SELECT') service_hints_select,
      has_table_privilege('service_role','public.mastery_materialized_attempts','SELECT') service_marker_select,
      has_table_privilege('service_role','public.user_outcome_state','SELECT') service_state_select,
      has_table_privilege('service_role','public.user_outcome_state','REFERENCES') service_state_references,
      has_table_privilege('service_role','public.user_outcome_state','TRIGGER') service_state_trigger,
      has_function_privilege('authenticated','public.record_verified_hint_event(uuid,uuid,uuid,smallint)','EXECUTE') auth_hint,
      has_function_privilege('authenticated','public.backfill_verified_attempt_mastery(integer)','EXECUTE') auth_backfill,
      has_function_privilege('service_role','public.record_verified_hint_event(uuid,uuid,uuid,smallint)','EXECUTE') service_hint,
      has_function_privilege('service_role','public.backfill_verified_attempt_mastery(integer)','EXECUTE') service_backfill,
      has_function_privilege('service_role','public.materialize_verified_attempt_mastery(uuid)','EXECUTE') service_materialize`)
    expect(acl.rows[0]).toEqual({evidence_rls:true,hints_rls:true,marker_rls:true,auth_read:false,service_evidence_select:false,service_evidence_insert:false,service_evidence_update:false,service_evidence_delete:false,service_evidence_truncate:false,service_evidence_references:false,service_evidence_trigger:false,service_hints_select:false,service_marker_select:false,service_state_select:true,service_state_references:false,service_state_trigger:false,auth_hint:false,auth_backfill:false,service_hint:true,service_backfill:true,service_materialize:false})
    const dayAcl=(await client.query(`SELECT
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.mastery_outcome_evidence_days'::regclass) day_rls,
      has_table_privilege('authenticated','public.mastery_outcome_evidence_days','SELECT') auth_day_read,
      has_table_privilege('service_role','public.mastery_outcome_evidence_days','SELECT') service_day_read,
      has_table_privilege('service_role','public.mastery_outcome_evidence_days','INSERT') service_day_insert,
      has_table_privilege('service_role','public.mastery_outcome_evidence_days','UPDATE') service_day_update,
      has_table_privilege('service_role','public.mastery_outcome_evidence_days','DELETE') service_day_delete`)).rows[0]
    expect(dayAcl).toEqual({day_rls:true,auth_day_read:false,service_day_read:false,service_day_insert:false,service_day_update:false,service_day_delete:false})
    await role('authenticated',async()=>{
      await expect(client.query('SELECT * FROM public.mastery_outcome_evidence')).rejects.toMatchObject({code:'42501'})
      await expect(client.query('SELECT public.backfill_verified_attempt_mastery(1)')).rejects.toMatchObject({code:'42501'})
    })
    await role('service_role',async()=>{
      await expect(client.query('DELETE FROM public.mastery_outcome_evidence')).rejects.toMatchObject({code:'42501'})
      await expect(client.query('DELETE FROM public.mastery_outcome_evidence_days')).rejects.toMatchObject({code:'42501'})
      expect((await client.query('SELECT public.backfill_verified_attempt_mastery(1) result')).rows[0].result).toEqual({processed:0})
      await expect(client.query('SELECT public.record_verified_hint_event($1,$2,$3,$4::smallint)',[attempt,user,question,1])).rejects.toMatchObject({code:'22023'})
    })
  })
})
