import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../migrations/208_tyt_social_mastery_reader_boundary.sql', import.meta.url),
  'utf8',
)

const reader = sql.slice(
  sql.indexOf('CREATE OR REPLACE FUNCTION public.read_tyt_social_mastery_outcome_state'),
  sql.indexOf('COMMENT ON FUNCTION public.resolve_tyt_social_mastery_read_context'),
)

describe('208 TYT Social mastery reader boundary SQL', () => {
  it('rechecks the candidate snapshot when an old open attempt completes', () => {
    expect(sql).toContain('trg_tyt_social_attempt_snapshot_on_completion')
    expect(sql).toContain('AFTER UPDATE OF completed_at, session_id')
    expect(sql).toContain('DEFERRABLE INITIALLY DEFERRED')
    expect(sql).toContain('tg_assert_tyt_social_attempt_snapshot_integrity()')
  })

  it('never reads the unsegmented legacy aggregate for Social mastery', () => {
    expect(reader).not.toContain('user_outcome_state')
    expect(reader).toContain('mastery_outcome_evidence')
    expect(reader).toContain('mastery_materialized_attempts')
    expect(sql).toContain("'legacyAggregateUsed', false")
  })

  it('binds evidence to the current policy, current selection event and role snapshot', () => {
    expect(reader).toContain('verified_attempt_candidate_policy_snapshots')
    expect(reader).toContain('verified_attempt_question_exam_role_snapshots')
    expect(reader).toContain('verified_attempt_question_revisions')
    expect(reader).toContain('daily_plan_candidate_policy_snapshots')
    expect(reader).toContain('daily_plan_question_exam_role_snapshots')
    expect(reader).toContain("reader_context.value->>'policyVersion'")
    expect(reader).toContain("reader_context.value->>'selectionEventId'")
    expect(reader).toContain('header.selection_event_id')
    expect(reader).toContain('item.exam_role = ANY(variant.allowed_roles)')
    expect(reader).toContain('tyt_social_exam_role_compatible')
  })

  it('guards both completion and direct mastery materializer paths', () => {
    expect(sql).toContain('aab_require_tyt_social_mastery_snapshot')
    expect(sql).toContain('tg_require_tyt_social_mastery_snapshot')
    expect(sql).toContain('assert_tyt_social_attempt_snapshot_integrity(NEW.attempt_id)')
    expect(sql).toContain('released TYT Social mastery evidence requires exact policy, event, revision and role snapshots')
    expect(sql).toContain('masteryEvidenceConstraintReady')
  })

  it('keeps valid superseded evidence immutable but excludes it from the current map', () => {
    expect(sql).toContain('historicalSelectionEvidenceExcludedCount')
    expect(sql).toContain('currentSelectionEvidenceCount')
    expect(sql).toContain('header.selection_event_id = current_event.id')
    expect(sql).toContain('header.selection_event_id = (')
  })

  it('fails release readiness when snapshot-incomplete evidence needs rebuild', () => {
    expect(sql).toContain('unresolvedLegacyEvidenceCount')
    expect(sql).toContain("'rebuildRequired', v_unresolved_count > 0")
    expect(sql).toContain('AND v_unresolved_count = 0')
    expect(sql).toContain("'masteryReaderReady'")
    expect(sql).toContain("'masteryReader', reader.evidence")
    expect(sql).toContain('trg_guard_tyt_social_mastery_scope_release')
    expect(sql).toContain('TYT Social mastery release requires a clean branch-aware reader')
  })

  it('keeps the public Social mastery scope validating until app integration', () => {
    expect(sql).toMatch(/UPDATE public\.curriculum_scope_releases[\s\S]*release_status = 'validating'/)
    expect(sql).toContain('diagnostic_enabled = false')
    expect(sql).toContain("release_status IN ('validating','released')")
  })

  it('records a manifest-bound service-only reader capability', () => {
    expect(sql).toContain("'mastery_reader_v1'")
    expect(sql).toContain('pg_catalog.pg_get_functiondef(v_context_oid)')
    expect(sql).toContain('pg_catalog.pg_get_functiondef(v_reader_oid)')
    expect(sql).toContain("'public.tg_require_tyt_social_mastery_snapshot()'")
    expect(sql).toContain('pg_catalog.pg_get_triggerdef(')
    expect(sql).toContain("'semanticReaderCheck', 'passed'")
    expect(sql).toContain('FROM PUBLIC, anon, authenticated, service_role;')
    expect(sql).toContain('TO service_role;')
  })
})
