import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const foundation = readFileSync(
  new URL('../migrations/205_tyt_social_candidate_policy_foundation.sql', import.meta.url),
  'utf8',
)
const boundary = readFileSync(
  new URL('../migrations/206_tyt_social_snapshot_issuance_boundary.sql', import.meta.url),
  'utf8',
)

const setter = foundation.slice(
  foundation.indexOf('CREATE OR REPLACE FUNCTION public.set_my_tyt_social_exam_policy'),
  foundation.indexOf('CREATE OR REPLACE FUNCTION public.tyt_social_exam_role_compatible'),
)

describe('205 TYT Social candidate-policy foundation SQL', () => {
  it('keeps category taxonomy separate from neutral candidate branch codes', () => {
    expect(foundation).toContain("'questions_16_20'")
    expect(foundation).toContain("'questions_21_25'")
    expect(foundation).toContain("'standard_religion'")
    expect(foundation).toContain("'alternate_philosophy'")
    expect(foundation).toContain("privacy_classification = 'sensitive_inference'")
    expect(foundation).toContain("'storeReason',false")
    expect(foundation).toContain("'storeReligion',false")
    expect(foundation).toContain("'storeDocument',false")
  })

  it('allows AAL1 owner-bound selection but serializes and rate-limits direct RPC use', () => {
    expect(setter).toContain('v_user_id uuid := auth.uid()')
    expect(setter).toContain("IF v_user_id IS NULL THEN")
    expect(setter).not.toContain("auth.jwt()->>'aal'")
    expect(setter).toContain("'tyt-social-policy:'||v_user_id::text||':'||v_policy.policy_version")
    expect(setter).toContain('v_recent_count>=6')
    expect(setter).toContain("v_now-interval '15 seconds'")
    expect(foundation).toContain('UNIQUE (supersedes_event_id)')
    expect(foundation).toContain(
      'FOREIGN KEY (supersedes_event_id, user_id, policy_version)',
    )
  })

  it('binds attempt and plan facts to the same owner, event, policy, variant and revision role', () => {
    expect(foundation).toContain('FOREIGN KEY (attempt_id, user_id)')
    expect(foundation).toContain('FOREIGN KEY (plan_id, user_id)')
    expect(foundation).toContain(
      'FOREIGN KEY (selection_event_id, user_id, policy_version, variant_code, selection_effective_at)',
    )
    expect(foundation).toContain('FOREIGN KEY (policy_version, rules_sha256)')
    expect(foundation).toContain('FOREIGN KEY (policy_version, revision_id, exam_role)')
    expect(foundation).toContain('verified_attempt_policy_source_plan_fkey')
    expect(foundation).toContain('daily_plan_question_exam_role_snapshots')
  })

  it('cannot treat function names alone as a release capability', () => {
    expect(foundation).toContain('tyt_social_policy_capabilities')
    expect(foundation).toContain('v_capability_manifest_sha256')
    expect(foundation).toContain('pg_get_functiondef')
    expect(foundation).toContain('pg_get_triggerdef')
    expect(foundation).toContain(
      'CREATE OR REPLACE FUNCTION public.tyt_social_snapshot_boundary_manifest_sha256()',
    )
    expect(foundation).toMatch(
      /tyt_social_snapshot_boundary_manifest_sha256\(\)[\s\S]+SECURITY DEFINER[\s\S]+SET search_path = pg_catalog/,
    )
    expect(foundation.match(/pg_catalog\.pg_get_triggerdef\([^,]+,false\)/g)).toHaveLength(5)
    expect(foundation).toContain(
      'v_capability_manifest_sha256:=\n    public.tyt_social_snapshot_boundary_manifest_sha256();',
    )
    expect(foundation).toContain('public.tyt_social_snapshot_boundary_manifest_sha256(),')
    expect(foundation).not.toMatch(
      /GRANT EXECUTE ON FUNCTION[^;]+tyt_social_snapshot_boundary_manifest_sha256/s,
    )
    expect(foundation).toContain("'semanticAggregateCheck','passed'")
    expect(foundation).toContain("EXECUTE 'SELECT public.tyt_social_snapshot_boundary_integrity()'")
    expect(foundation).not.toMatch(
      /INSERT INTO public\.tyt_social_policy_capabilities\s*\(/,
    )
  })

  it('requires two independent approved human reviews for every released exam role', () => {
    expect(foundation).toContain('CREATE CONSTRAINT TRIGGER trg_tyt_social_exam_role_approval')
    expect(foundation).toContain('assert_tyt_social_exam_role_approval')
    expect(foundation).toContain("v_candidate.status<>'approved'")
    expect(foundation).toContain("v_stage1.decision<>'approved'")
    expect(foundation).toContain("v_stage2.decision<>'approved'")
    expect(foundation).toContain('invalidApprovalProvenanceCount')
    expect(foundation).toContain('reviewProvenanceTriggerReady')
  })

  it('demotes stale release drift and leaves the Social scope validating', () => {
    expect(foundation).toContain("release_status IN ('draft','validating','released')")
    expect(foundation).toContain("release_status='validating' AND NOT diagnostic_enabled")
    expect(foundation).toContain('migration 205 must not release an incomplete candidate policy')
  })
})

describe('206 TYT Social issuance boundary SQL', () => {
  it('separates ordinary practice, frozen plans, smart mocks and official sections', () => {
    expect(boundary).toContain("'practice','daily_plan','smart_mock','official_section'")
    expect(boundary).toContain("p_artifact_kind='official_section'")
    expect(boundary).toContain('official TYT Social section requires exact 5/5/5/5 composition')
    expect(boundary).toContain("'practice',NULL,v_policy.policy_version")
    expect(boundary).toContain("'daily_plan',v_plan.id")
    expect(boundary).toContain("'smart_mock',NULL")
    expect(boundary).toContain("IF p_mode = 'deneme' THEN")
    expect(boundary).toContain('official sections require the governed composer')
  })

  it('supports 1..100 practice, 1..15 plans and a distinct 40-question smart mock', () => {
    expect(boundary).toContain('cardinality(p_question_ids) NOT BETWEEN 1 AND 100')
    expect(boundary).toContain('jsonb_array_length(p_items) NOT BETWEEN 1 AND 15')
    expect(boundary).toContain('jsonb_array_length(p_items)<>40')
    expect(boundary).toContain('filter_tyt_social_question_candidates')
    expect(boundary).toContain('role.exam_role=ANY(v_allowed_roles)')
  })

  it('uses deferred semantic constraints and a manifest-bound capability', () => {
    expect(boundary).toContain('CREATE CONSTRAINT TRIGGER trg_tyt_social_attempt_snapshot_integrity')
    expect(boundary).toContain('CREATE CONSTRAINT TRIGGER trg_tyt_social_plan_snapshot_integrity')
    expect(boundary.match(/DEFERRABLE INITIALLY DEFERRED/g)).toHaveLength(2)
    expect(boundary).toContain('tyt_social_snapshot_boundary_integrity()')
    expect(boundary).toContain("'semanticAggregateCheck','passed'")
    expect(boundary).toContain('v_manifest_sha256')
    expect(boundary).toContain(
      'v_manifest_sha256:=public.tyt_social_snapshot_boundary_manifest_sha256();',
    )
    expect(boundary).not.toContain('pg_get_triggerdef')
    expect(boundary).toContain("'manifestFormatVersion',1")
    expect(boundary).toContain("'postgresMajor',v_postgres_major")
    expect(boundary).toContain('migration 206 must leave TYT Social fail-closed in validating state')
  })

  it('keeps runtime aggregates artifact-aware and freezes bound parent identities', () => {
    expect(boundary).toContain("header.artifact_kind='official_section' AND cardinality(attempt.question_ids)<>20")
    expect(boundary).toContain("header.artifact_kind='smart_mock' AND cardinality(attempt.question_ids)<>40")
    expect(boundary).toContain('trg_guard_tyt_social_attempt_parent_update')
    expect(boundary).toContain('trg_guard_tyt_social_plan_parent_update')
    expect(boundary).toContain('TYT Social snapshot-bound attempt identity is immutable')
    expect(boundary).toContain('TYT Social snapshot-bound daily plan identity is immutable')
  })

  it('expires stale open smart mocks before enforcing the single-open-attempt rule', () => {
    expect(boundary).toContain("UPDATE public.verified_exam_attempts AS exam")
    expect(boundary).toContain("SET status='expired'")
    expect(boundary).toContain("attempt.expires_at<=v_now")
    expect(boundary).toContain("exam.deadline_at<=v_now")
  })

  it('freezes a daily-plan attempt to the plan event instead of the current preference', () => {
    expect(boundary).toContain('issue_verified_tyt_social_plan_attempt')
    expect(boundary).toContain('v_header.selection_event_id')
    expect(boundary).toContain("p_artifact_kind<>'daily_plan' AND EXISTS")
    expect(boundary).toContain("p_artifact_kind='daily_plan' AND NOT EXISTS")
    expect(boundary).toContain('plan.question_ids=p_question_ids')
  })

  it('keeps all policy-aware data functions off client roles', () => {
    const grants = boundary.slice(boundary.lastIndexOf('REVOKE ALL ON FUNCTION'))
    expect(grants).toContain('FROM PUBLIC,anon,authenticated,service_role;')
    expect(grants).toContain('filter_tyt_social_question_candidates(uuid,uuid[])')
    expect(grants).toContain('issue_verified_tyt_social_exam_attempt')
    expect(grants).toContain('TO service_role;')
    expect(grants).not.toContain('TO authenticated;')
  })
})
