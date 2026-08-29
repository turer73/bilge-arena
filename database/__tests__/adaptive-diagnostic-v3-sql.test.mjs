import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../migrations/193_registry_driven_adaptive_diagnostic_v3.sql', import.meta.url),
  'utf8',
)

describe('193 registry-driven adaptive screening contract', () => {
  it('publishes one immutable, versioned blueprint and no new subject capability', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.adaptive_diagnostic_blueprints')
    expect(sql).toContain('blueprint_version text PRIMARY KEY')
    expect(sql).toContain("candidate_gate_version text NOT NULL DEFAULT 'exact-single-outcome-v1'")
    expect(sql).toContain('requires_revision_snapshot boolean NOT NULL DEFAULT true')
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.adaptive_diagnostic_blueprints/)
    expect(sql).toContain("'ba-tyt-math-diagnostic-v1','matematik','TYT','TYT','ba-tyt-math-v1'")

    const seed = sql.slice(
      sql.indexOf('INSERT INTO public.adaptive_diagnostic_blueprints'),
      sql.indexOf('DO $fn$', sql.indexOf('INSERT INTO public.adaptive_diagnostic_blueprints')),
    )
    expect(seed).not.toMatch(/'fen'|'turkce'|'sosyal'|'wordquest'/)
  })

  it('snapshots exact scope and dynamic policy counters on every session', () => {
    for (const column of [
      'question_exam_ref text',
      'diagnostic_blueprint_version text',
      'policy_version text',
      'question_count smallint',
      'outcome_count smallint',
      'max_per_outcome smallint',
    ]) expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column}`)
    expect(sql).toMatch(/answered_count BETWEEN 0 AND question_count/)
    expect(sql).toMatch(/covered_outcomes BETWEEN 0 AND outcome_count/)
    expect(sql).toMatch(/covered_outcomes=outcome_count AND answered_count=question_count/)
    expect(sql).toMatch(/user_diagnostic_outcome_state_dynamic_attempts_check[\s\S]+attempts BETWEEN 1 AND 10/)
    expect(sql).toMatch(/diagnostic session scope and policy snapshot are immutable/)
    expect(sql).not.toMatch(/ADD CONSTRAINT[\s\S]{0,300}covered_outcomes=6/)
  })

  it('returns the exact app capability JSON without changing curriculum resolver output', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.resolve_released_diagnostic_scope')
    const end = sql.indexOf('CREATE OR REPLACE FUNCTION public.require_released_adaptive_diagnostic_blueprint')
    const resolver = sql.slice(start, end)
    expect(start).toBeGreaterThanOrEqual(0)
    for (const key of [
      'game', 'displayExamRef', 'questionExamRef', 'taxonomyVersion',
      'policyVersion', 'questionCount', 'outcomeCount', 'maxPerOutcome',
    ]) expect(resolver).toContain(`'${key}'`)
    expect(resolver).not.toContain("'blueprintVersion'")
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.resolve_released_curriculum_scope')
  })

  it('fails closed on released-registry, blueprint, curriculum, and candidate capacity drift', () => {
    expect(sql).toMatch(/scope\.release_status='released'[\s\S]+scope\.diagnostic_enabled[\s\S]+blueprint\.capability_status='released'/)
    expect(sql).toMatch(/FOR SHARE OF scope,blueprint/)
    expect(sql).toContain('public.curriculum_scope_integrity(')
    expect(sql).toMatch(/sum\(least\(coverage\.candidate_count,v_blueprint\.max_per_outcome\)\)/)
    expect(sql).toMatch(/v_empty_candidate_outcome=0/)
    expect(sql).toMatch(/v_candidate_capacity>=v_blueprint\.question_count/)
    expect(sql).toContain('adaptive diagnostic candidate integrity is not clean')
    expect(sql).toMatch(/mapping\.is_primary[\s\S]+mapping\.mapping_source='taxonomy_auto'/)
    expect(sql).toMatch(/v_blueprint\.question_exam_ref IS NOT NULL[\s\S]+revision\.exam_ref[\s\S]+v_blueprint\.display_exam_ref/)
  })

  it('implements generic start, snapshot, resolve, and revision-bound answer RPCs', () => {
    expect(sql).toContain('public.start_adaptive_diagnostic_v3(')
    expect(sql).toContain('public.get_adaptive_diagnostic_question_v3(')
    expect(sql).toContain('public.resolve_adaptive_diagnostic_question_v3(')
    expect(sql).toContain('public.record_adaptive_diagnostic_answer_v3(')
    expect(sql).toMatch(/v_sequence>=v_session\.question_count/)
    expect(sql).toMatch(/v_next_outcome_attempts>=v_session\.max_per_outcome/)
    expect(sql).toMatch(/v_covered=v_session\.outcome_count AND v_sequence=v_session\.question_count/)
    expect(sql).toContain("'client_reported_with_server_elapsed','revision_snapshot'")
    expect(sql).toMatch(/v_is_correct:=p_selected_option=v_session\.current_question_correct_option/)
    expect(sql).toMatch(/v_revision record;[\s\S]+SELECT revision\.\*,[\s\S]+AS resolved_base_points[\s\S]+INTO v_revision/)
    expect(sql).not.toMatch(/SELECT revision,[\s\S]{0,160}INTO v_revision\s*,/)
    expect(sql).toMatch(/NEW\.question_exam_ref IS NOT NULL[\s\S]+revision\.exam_ref[\s\S]+NEW\.exam_ref/)
  })

  it('keeps every v3 boundary service-only and raw blueprint metadata private', () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.adaptive_diagnostic_blueprints[\s\S]+service_role/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.adaptive_diagnostic_scope_integrity[\s\S]+authenticated,service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.adaptive_diagnostic_scope_integrity[\s\S]+TO service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+public\.start_adaptive_diagnostic_v3[\s\S]+TO service_role/)
    expect(sql).toContain("'aaa_adaptive_diagnostic_session_release_gate'")
    expect(sql).toContain("'trg_adaptive_diagnostic_answers_append_only'")
    expect(sql).toContain('adaptive diagnostic v3 ACL postcheck failed')
  })
})
