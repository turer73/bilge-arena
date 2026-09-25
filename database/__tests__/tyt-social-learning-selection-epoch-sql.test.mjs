import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../migrations/212_tyt_social_learning_selection_epoch.sql', import.meta.url), 'utf8')
const functionBody = (name) => {
  const start = sql.indexOf(`CREATE FUNCTION public.${name}(`)
  expect(start).toBeGreaterThan(-1)
  return sql.slice(start, sql.indexOf('$fn$;', start) + 5)
}
const context = functionBody('tyt_social_learning_context_at')
const reader = functionBody('read_tyt_social_learning_snapshot')
const guard = functionBody('assert_tyt_social_learning_epoch')
const plan = functionBody('create_tyt_social_daily_plan_for_epoch')
const practice = functionBody('issue_verified_tyt_social_attempt_for_epoch')
const exam = functionBody('issue_verified_tyt_social_exam_attempt_for_epoch')
const entries = [
  'read_tyt_social_learning_snapshot(uuid,uuid[])',
  'create_tyt_social_daily_plan_for_epoch(uuid,date,jsonb,text,uuid)',
  'issue_verified_tyt_social_attempt_for_epoch(uuid,text,uuid[],integer,uuid,text,uuid)',
  'issue_verified_tyt_social_exam_attempt_for_epoch(uuid,text,jsonb,integer,integer,uuid,text,uuid)',
]

describe('212 local TYT Social learning epoch SQL contract', () => {
  it('adds only new entry points in one transaction without widening legacy access', () => {
    expect(sql).toMatch(/\nBEGIN;/)
    expect(sql.trim()).toMatch(/COMMIT;$/)
    expect(sql).not.toMatch(/CREATE OR REPLACE|ALTER TABLE|DROP\s|UPDATE public\.|DELETE FROM|INSERT INTO/)
    expect(sql).not.toContain('NOTIFY pgrst')
    expect(sql.match(/CREATE FUNCTION /g)).toHaveLength(6)
  })
  it('uses one statement timestamp and one context for the entire stable read', () => {
    expect(reader).toContain('LANGUAGE plpgsql STABLE')
    expect(reader).toContain('v_at timestamptz := statement_timestamp()')
    expect(reader.match(/tyt_social_learning_context_at\(/g)).toHaveLength(1)
    expect(reader).not.toContain('clock_timestamp()')
    expect(reader).not.toContain('resolve_tyt_social_mastery_read_context(')
    expect(reader).not.toContain('read_tyt_social_mastery_outcome_state(')
    expect(reader).not.toContain('filter_tyt_social_question_candidates(')
    expect(context).toContain('event_row.effective_at<=p_at')
    expect(context).toContain('ORDER BY event_row.effective_at DESC,event_row.id DESC')
  })
  it('fails closed on unavailable scope or missing selection, with no legacy aggregate', () => {
    expect(context).toContain("scope.release_status='released'")
    expect(context).toContain('NOT scope.diagnostic_enabled')
    expect(context).toContain("'legacyAggregateUsed',false")
    expect(reader).toContain("IF NOT COALESCE((v_context->>'available')::boolean,false) THEN")
    expect(reader).not.toContain('user_outcome_state')
  })
  it('binds mastery to exact event, complete attempt, answer and immutable revision', () => {
    for (const term of ['header.selection_event_id=(v_context->>\'selectionEventId\')::uuid',
      'attempt.completed_at=evidence.verified_completed_at', 'mastery_materialized_attempts',
      'revision_snapshot.revision_id=answer.question_revision_id', 'header.question_set_sha256',
      'daily_plan_question_exam_role_snapshots', 'count(DISTINCT evidence.evidence_day_tr)']) {
      expect(reader).toContain(term)
    }
  })
  it('preserves candidate order, deduplicates, bounds size and filters active reviewed roles', () => {
    for (const term of ['cardinality(p_question_ids)>1000', 'q.id IS NULL', 'min(input.position)',
      'ORDER BY requested.position', 'question.is_active', "revision.status='published'",
      "role.policy_version=v_context->>'policyVersion'", "variant.variant_code=v_context->>'variant'",
      'role.exam_role=ANY(variant.allowed_roles)']) expect(reader).toContain(term)
  })
  it('rechecks fresh time after the shared setter lock, rejecting stale event UUIDs', () => {
    expect(guard.indexOf('pg_advisory_xact_lock')).toBeLessThan(guard.indexOf('clock_timestamp()'))
    expect(guard).toContain("'tyt-social-policy:'||p_user_id::text||':'||p_policy_version,205")
    expect(guard).toContain("(v_context->>'selectionEventId')::uuid IS DISTINCT FROM p_selection_event_id")
    expect(guard).toContain("'TYT Social selection epoch changed' USING ERRCODE='40001'")
    expect(guard).toContain("current_setting('transaction_isolation')<>'read committed'")
    expect(guard).toContain("ERRCODE='25000'")
  })
  it('uses exam then request then policy ordering, and request then policy for practice', () => {
    const request = "'tyt-social-attempt:'"
    const policy = 'public.assert_tyt_social_learning_epoch('
    expect(practice.indexOf(request)).toBeLessThan(practice.indexOf(policy))
    expect(exam.indexOf("p_user_id::text||':sosyal:TYT',100")).toBeLessThan(exam.indexOf(request))
    expect(exam.indexOf(request)).toBeLessThan(exam.indexOf(policy))
    expect(plan.indexOf(policy)).toBeLessThan(plan.indexOf('public.create_tyt_social_daily_plan_v2('))
  })
  it('postchecks stored epoch and current selection after every delegated writer', () => {
    for (const body of [plan, practice, exam]) {
      expect(body.match(/public.assert_tyt_social_learning_epoch\(/g)).toHaveLength(2)
      expect(body).toContain('header.policy_version=p_expected_policy_version')
      expect(body).toContain('header.selection_event_id=p_expected_selection_event_id')
      expect(body).toContain("ERRCODE='40001'")
    }
  })
  it('maps only known stale legacy errors and rethrows other errors', () => {
    expect(plan).toContain("SQLERRM='existing TYT Social plan is stale for the current answering variant'")
    for (const body of [plan, practice, exam]) {
      expect(body).toContain('EXCEPTION WHEN object_not_in_prerequisite_state THEN')
      expect(body).toContain("'TYT Social policy selection is stale'")
      expect(body).toContain('  RAISE;')
      expect(body).not.toContain('WHEN OTHERS')
    }
  })
  it('checks actor binding on all public and internal new functions', () => {
    for (const body of [context, reader, guard, plan, practice, exam]) {
      expect(body).toContain('auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id')
      expect(body).toContain("ERRCODE='42501'")
      expect(body).toContain('SECURITY DEFINER SET search_path = pg_catalog')
    }
  })
  it('grants four entry points to service only and neither private helper to any API role', () => {
    for (const signature of [...entries, 'tyt_social_learning_context_at(uuid,timestamptz)', 'assert_tyt_social_learning_epoch(uuid,text,uuid)']) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC,anon,authenticated,service_role;`)
    }
    expect(sql.match(/GRANT EXECUTE ON FUNCTION /g)).toHaveLength(4)
    for (const signature of entries) expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`)
    expect(sql).not.toMatch(/GRANT[^;]+TO (?:PUBLIC|anon|authenticated)/)
  })
  it('leaves immutable historical-plan issuance and old release manifests untouched', () => {
    expect(sql).not.toContain('CREATE FUNCTION public.issue_verified_tyt_social_plan_attempt(')
    expect(sql).not.toContain('tyt_social_snapshot_boundary_manifest_sha256(')
    expect(sql).not.toContain('tyt_social_mastery_reader_manifest_sha256(')
  })
})
