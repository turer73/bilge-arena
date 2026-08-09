import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '099_verified_coach_flow.sql'),
  'utf8',
)

describe('099 verified coach flow migration', () => {
  it('stores only private, bounded coach state and append-only stage evidence', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.verified_coach_sessions/)
    expect(sql).toMatch(/UNIQUE \(attempt_id,question_id\)/)
    expect(sql).toMatch(/initial_selected_option smallint NOT NULL/)
    expect(sql).toMatch(/stage smallint NOT NULL DEFAULT 0 CHECK \(stage BETWEEN 0 AND 4\)/)
    expect(sql).toMatch(/transfer_question_id uuid REFERENCES public\.questions/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.verified_coach_stage_events/)
    expect(sql).toMatch(/UNIQUE \(session_id,stage\)/)
    expect(sql).toMatch(/UNIQUE \(session_id,request_id\)/)
    expect(sql).toMatch(/stage BETWEEN 1 AND 3[\s\S]*char_length\(trim\(response_text\)\) BETWEEN 1 AND 1000[\s\S]*stage = 4[\s\S]*response_text IS NULL/)
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.verified_coach_stage_events/)
  })

  it('keeps selection/session identity immutable and permits only canonical transitions', () => {
    expect(sql).toMatch(/verified coach session identity is immutable/)
    expect(sql).toMatch(/NEW\.stage = OLD\.stage \+ 1/)
    expect(sql).toMatch(/stage four must bind only a transfer question/)
    expect(sql).toMatch(/transfer answer can be bound exactly once/)
    expect(sql).toMatch(/invalid verified coach session transition/)
  })

  it('validates active verified-attempt scope and starts idempotently without exposing an answer', () => {
    expect(sql).toMatch(/FROM public\.verified_attempts WHERE id=p_attempt_id FOR UPDATE/)
    expect(sql).toMatch(/v_attempt\.completed_at IS NOT NULL OR v_attempt\.expires_at <= clock_timestamp\(\)[\s\S]*p_question_id = ANY\(v_attempt\.question_ids\)/)
    expect(sql).toMatch(/question\.is_active=true AND question\.game=v_attempt\.game/)
    expect(sql).toMatch(/v_primary_count <> 1[\s\S]*approved solution/)
    expect(sql).toMatch(/jsonb_typeof\(v_question\.content->'solution'\) <> 'string'[\s\S]*BETWEEN 1 AND 2000/)
    expect(sql).toMatch(/initial selected option is immutable/)
    expect(sql).toMatch(/'transferQuestionId',NULL[\s\S]*'replayed',false/)
    expect(sql).not.toMatch(/start_verified_coach_session[\s\S]{0,300}'correctOption'/)
  })

  it('serializes exact stage replay and selects a deterministic same-primary-outcome transfer', () => {
    expect(sql).toMatch(/WHERE id=p_session_id FOR UPDATE/)
    expect(sql).toMatch(/WHERE session_id=p_session_id AND request_id=p_request_id/)
    expect(sql).toMatch(/request id is bound to another stage/)
    expect(sql).toMatch(/'responseText',v_event\.response_text,'source',v_event\.source,[\s\S]*'evaluationPassed',v_event\.evaluation_passed,'policyVersion',v_event\.policy_version,[\s\S]*'contentSha256',v_event\.content_sha256/)
    expect(sql).toMatch(/'responseText',p_response_text,'source',p_source,[\s\S]*'evaluationPassed',p_evaluation_passed,'policyVersion',v_policy_version,[\s\S]*'contentSha256',p_content_sha256/)
    expect(sql).toMatch(/p_stage <> v_session\.stage \+ 1/)
    expect(sql).toMatch(/mapping\.question_id=v_session\.question_id AND mapping\.is_primary=true/)
    expect(sql).toMatch(/SELECT count\(\*\) INTO v_primary_count[\s\S]*v_primary_count <> 1[\s\S]*SELECT mapping\.outcome_id INTO v_outcome_id/)
    expect(sql).not.toMatch(/min\(mapping\.outcome_id\)/)
    expect(sql).toMatch(/mapping\.outcome_id=v_outcome_id AND mapping\.is_primary=true/)
    expect(sql).toMatch(/candidate\.game::text = v_source_question\.game[\s\S]*candidate\.exam_ref IS NOT DISTINCT FROM v_source_question\.exam_ref/)
    expect(sql).toMatch(/ORDER BY candidate\.id[\s\S]*LIMIT 1/)
    expect(sql).toMatch(/AND 1 = \([\s\S]*candidate_primary\.is_primary=true AND candidate_outcome\.is_active=true/)
    expect(sql).toMatch(/candidate\.content->'solution'[\s\S]*BETWEEN 1 AND 2000/)
    expect(sql).toMatch(/p_stage = 4 AND \(p_response_text IS NOT NULL OR p_source <> 'solution'\)/)
  })

  it('grades only the selected stage-four transfer and keeps direct data paths closed', () => {
    expect(sql).toMatch(/v_session\.transfer_completed_at IS NOT NULL[\s\S]*transfer answer was already bound to another request/)
    expect(sql).toMatch(/'isCorrect',[\s\S]*'correctOption',[\s\S]*'solution',[\s\S]*'coachDepth',4,'transferQuestionId',[\s\S]*'replayed'/)
    expect(sql).toMatch(/'coachDepth',4,'transferQuestionId',v_session\.transfer_question_id,'replayed'/)
    expect(sql).toMatch(/left\(trim\(question\.content->>'solution'\),2000\)/)
    expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(2)
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.verified_coach_sessions, public\.verified_coach_stage_events[\s\S]*service_role/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.verified_coach_option_count[\s\S]*service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.start_verified_coach_session[\s\S]*TO service_role/)
  })
})
