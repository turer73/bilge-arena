import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '097_mastery_evidence_v2.sql'), 'utf8')

describe('097 mastery evidence v2 migration', () => {
  it('stores append-only verified-completion evidence without answer content', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.mastery_outcome_evidence/)
    expect(sql).toMatch(/PRIMARY KEY \(answer_id,outcome_id\)/)
    expect(sql).toMatch(/base_already_recorded boolean NOT NULL/)
    expect(sql).toMatch(/difficulty_weighted_earned[\s\S]*max_hint_stage[\s\S]*delayed_correct/)
    expect(sql).not.toMatch(/selected_option|answer_content|free_text/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.mastery_materialized_attempts/)
  })

  it('materializes only on a completed attempt binding and avoids replay/base drift', () => {
    expect(sql).toMatch(/AFTER UPDATE OF completed_at,session_id ON public\.verified_attempts/)
    expect(sql).toMatch(/OLD\.completed_at IS NULL AND NEW\.completed_at IS NOT NULL[\s\S]*OLD\.session_id IS NULL AND NEW\.session_id IS NOT NULL/)
    expect(sql).toMatch(/INSERT INTO public\.mastery_materialized_attempts[\s\S]*ON CONFLICT\(attempt_id\) DO NOTHING/)
    expect(sql).toMatch(/mapping\.created_at <= sa\.answered_at/)
    expect(sql).toMatch(/CASE WHEN e\.base_already_recorded THEN 0 ELSE 1 END/)
    expect(sql).toMatch(/sum\(CASE WHEN e\.base_already_recorded THEN 0 ELSE 1 END\)::integer/)
    expect(sql).toMatch(/GROUP BY e\.user_id,e\.outcome_id/)
    expect(sql).toMatch(/count\(\*\) FILTER \(WHERE EXISTS\(SELECT 1 FROM public\.review_logs/)
    expect(sql).toMatch(/mapping\.weight\*q\.difficulty/)
    expect(sql).toMatch(/CREATE CONSTRAINT TRIGGER trg_user_outcome_state_v2_attempt_bounds[\s\S]*DEFERRABLE INITIALLY DEFERRED/)
  })

  it('records bounded owner-checked hints and annotation deltas idempotently', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.verified_attempt_hint_events/)
    expect(sql).toMatch(/PRIMARY KEY \(attempt_id,question_id,stage\)/)
    expect(sql).toMatch(/a\.user_id IS DISTINCT FROM p_user_id[\s\S]*42501/)
    expect(sql).toMatch(/a\.completed_at IS NOT NULL OR a\.expires_at<=clock_timestamp\(\) OR NOT \(p_question_id=ANY\(a\.question_ids\)\)/)
    expect(sql).toMatch(/hint stage must be 1\.\.4/)
    expect(sql).toMatch(/p_attempt_id IS NULL OR p_user_id IS NULL OR p_question_id IS NULL OR p_stage IS NULL/)
    expect(sql).toMatch(/trg_review_error_annotation_mastery_delta[\s\S]*guess_annotations[\s\S]*careless_annotations/)
  })

  it('keeps raw tables private and exposes bounded service-role RPCs only', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.mastery_outcome_evidence, public\.mastery_materialized_attempts, public\.verified_attempt_hint_events, public\.user_outcome_state FROM service_role/)
    expect(sql).toMatch(/p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000/)
    expect(sql).toMatch(/IF NEW\.v2_attempts > NEW\.attempts THEN[\s\S]*23514/)
    expect(sql).toMatch(/timed_attempts <= v2_attempts AND fast_wrong <= v2_attempts/)
    expect(sql).toMatch(/hint_stage_sum <= 4 \* hinted_attempts/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.materialize_verified_attempt_mastery\(uuid\)[\s\S]*service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_verified_hint_event[\s\S]*backfill_verified_attempt_mastery\(integer\) TO service_role/)
  })
})
