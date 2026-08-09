import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '100_verified_exam_strategy_experiments.sql'), 'utf8')

describe('100 verified exam strategy migration', () => {
  it('keeps immutable ordered exam metadata and intentionally avoids client timing', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.verified_exam_attempts/)
    expect(sql).toMatch(/attempt_id uuid PRIMARY KEY REFERENCES public\.verified_attempts/)
    expect(sql).toMatch(/question_set_hash text NOT NULL CHECK \(question_set_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.verified_exam_attempt_items/)
    expect(sql).toMatch(/PRIMARY KEY \(attempt_id, position\)[\s\S]*UNIQUE \(attempt_id, question_id\)/)
    expect(sql).toMatch(/source_bucket text NOT NULL CHECK \(source_bucket IN \('wrong','weak','coverage'\)\)/)
    expect(sql).toMatch(/session_answers\.time_taken_sec is deliberately not\s+-- read here/)
    expect(sql).not.toMatch(/session_answers\s+[^\n;]*time_taken_sec/)
  })

  it('issues atomically, bounds the personalized shape, and serializes the one-open scope', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.issue_verified_exam_attempt/)
    expect(sql).toMatch(/jsonb_array_length\(p_items\) <> 40/)
    expect(sql).toMatch(/e->>'questionId'[\s\S]*e->>'sourceBucket'/)
    expect(sql).toMatch(/items must be unique and contiguous/)
    expect(sql).toMatch(/q\.is_active AND q\.game = p_game[\s\S]*q\.exam_ref IS NOT DISTINCT FROM p_exam_ref/)
    expect(sql).toMatch(/pg_advisory_xact_lock/)
    expect(sql).toMatch(/i\.source_bucket<>\(e->>'sourceBucket'\)/)
    expect(sql).toMatch(/INSERT INTO public\.verified_attempts[\s\S]*INSERT INTO public\.verified_exam_attempts[\s\S]*INSERT INTO public\.verified_exam_attempt_items/)
    expect(sql).toMatch(/verified_exam_attempts_open_scope_idx/)
    expect(sql).toMatch(/different request UUID is intentionally irrelevant/)
    expect(sql).toMatch(/an open verified exam has a different snapshot/)
  })

  it('pins a deterministic assignment at start, but starts default-off', () => {
    expect(sql).toMatch(/status text NOT NULL DEFAULT 'draft'/)
    expect(sql).toMatch(/'mock_strategy_analysis_v1',1,'matematik','deneme','draft',0/)
    expect(sql).toMatch(/extensions\.digest\(v_exp\.experiment_key\|\|':'\|\|v_exp\.revision[\s\S]*p_user_id::text/)
    expect(sql).toMatch(/extensions\.digest\(array_to_string\(v_ids, ','\), 'sha256'\)/)
    expect(sql).toMatch(/extensions\.gen_random_bytes\(32\)/)
    expect(sql).toMatch(/UNIQUE \(experiment_id, user_id\)/)
    expect(sql).toMatch(/start_request_id=p_request_id/)
    expect(sql).toMatch(/IF v_exam\.status='active' THEN/)
    expect(sql).toMatch(/'experiment',CASE WHEN v_assign\.id IS NULL THEN NULL ELSE jsonb_build_object\('key'/)
  })

  it('uses receipt-only, ordered idempotent events and not client timing', () => {
    expect(sql).toMatch(/server_received_at timestamptz NOT NULL DEFAULT clock_timestamp\(\)/)
    expect(sql).toMatch(/UNIQUE \(attempt_id, client_event_id\)[\s\S]*UNIQUE \(attempt_id, sequence\)/)
    expect(sql).toMatch(/verified_exam_strategy_events_slot_idx/)
    expect(sql).toMatch(/p_event_type='question_opened' AND p_sequence <> p_position::integer \* 2 \+ 1/)
    expect(sql).toMatch(/p_event_type='answer_submitted' AND p_sequence <> p_position::integer \* 2 \+ 2/)
    expect(sql).toMatch(/p_event_type NOT IN \('question_opened','answer_submitted','exam_submitted'\)/)
    expect(sql).toMatch(/SELECT \* INTO v_slot FROM public\.verified_exam_strategy_events WHERE attempt_id=p_attempt_id AND position=p_position AND event_type=p_event_type/)
    expect(sql).toMatch(/event replay payload differs/)
    expect(sql).toMatch(/p_event_type='exam_submitted' THEN RAISE EXCEPTION 'exam submission receipt is finalized server side'/)
  })

  it('separates completed-session finalization from analytics evidence and explicit exposure', () => {
    expect(sql).toMatch(/v_attempt\.completed_at IS NULL OR v_attempt\.session_id IS NULL/)
    expect(sql).toMatch(/status='finalized',completed_at=clock_timestamp\(\),session_id=v_attempt\.session_id/)
    expect(sql).toMatch(/v_receipt_id := \(substr\(md5\('verified-exam-finalize:'/)
    expect(sql).toMatch(/INSERT INTO public\.verified_exam_strategy_events\(attempt_id,client_event_id,sequence,position,event_type\)[\s\S]*count\(\*\) \* 2 \+ 1[\s\S]*'exam_submitted'/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_verified_exam_strategy_evidence/)
    expect(sql).toMatch(/'experimentKey',v_exp\.experiment_key,'revision',v_exp\.revision,'variant',v_assign\.variant,'plannedCount'/)
    expect(sql).toMatch(/'position',i\.position,'answered',[\s\S]*'openedAt',o\.server_received_at,'submittedAt',sub\.server_received_at/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.record_verified_exam_exposure/)
    expect(sql).toMatch(/UNIQUE \(assignment_id, session_id\)/)
  })

  it('keeps raw records private and makes only six service RPCs executable', () => {
    expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(6)
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.verified_exam_attempts[\s\S]*service_role/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.verified_exam_append_only\(\), public\.verified_exam_attempt_guard\(\)[\s\S]*service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.issue_verified_exam_attempt[\s\S]*record_verified_exam_exposure[\s\S]*TO service_role/)
  })
})
