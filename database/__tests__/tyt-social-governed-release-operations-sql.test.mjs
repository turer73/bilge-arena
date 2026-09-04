import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL(
    '../migrations/210_tyt_social_governed_release_operations.sql',
    import.meta.url,
  ),
  'utf8',
)

const sourcePolicy = migration.slice(
  migration.indexOf(
    'CREATE OR REPLACE FUNCTION public.tyt_social_revision_source_policy_ready',
  ),
  migration.indexOf(
    'CREATE OR REPLACE FUNCTION public.prepare_tyt_social_exam_role',
  ),
)

const prepare = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.prepare_tyt_social_exam_role'),
  migration.indexOf('CREATE OR REPLACE FUNCTION public.review_tyt_social_exam_role'),
)

const review = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.review_tyt_social_exam_role'),
  migration.indexOf('CREATE OR REPLACE FUNCTION public.get_tyt_social_release_operations'),
)

const finalizer = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.release_tyt_social_mastery_scope'),
  migration.indexOf('REVOKE ALL ON FUNCTION'),
)

const grants = migration.slice(migration.indexOf('REVOKE ALL ON FUNCTION'))

describe('210 TYT Social governed release operations SQL', () => {
  it('installs operations without invoking its finalizer or releasing the scope', () => {
    const installer = migration.slice(
      0,
      migration.indexOf('CREATE OR REPLACE FUNCTION public.release_tyt_social_mastery_scope'),
    )

    expect(installer).not.toContain("SET release_status='released'")
    expect(installer).not.toContain('SELECT public.release_tyt_social_mastery_scope')
    expect(migration).toContain(
      'migration 210 must leave TYT Social closed in validating state',
    )
    expect(migration).toContain("v_scope.release_status<>'validating'")
  })

  it('requires the current active published non-legacy revision and independent content reviews', () => {
    expect(sourcePolicy).toContain('revision.id = question.published_revision_id')
    expect(sourcePolicy).toContain('question.is_active')
    expect(sourcePolicy).toContain("revision.status = 'published'")
    expect(sourcePolicy).toContain("revision.change_kind <> 'legacy_import'")
    expect(sourcePolicy).toContain('question_revision_sources')
    expect(sourcePolicy).toContain('question_revision_approvals AS stage_one')
    expect(sourcePolicy).toContain('question_revision_approvals AS stage_two')
    expect(sourcePolicy).toContain('stage_one.reviewer_id IS DISTINCT FROM stage_two.reviewer_id')
    expect(sourcePolicy).toContain('stage_one.reviewer_id IS DISTINCT FROM revision.prepared_by')
    expect(sourcePolicy).toContain('stage_two.reviewer_id IS DISTINCT FROM revision.prepared_by')
  })

  it('binds role prepare and review to an AAL2 authorized actor and locks the current revision', () => {
    for (const operation of [prepare, review]) {
      expect(operation).toContain('question_outcome_mapping_actor_has_aal2(p_actor_user_id)')
      expect(operation).toContain('content_governance_has_permission(')
      expect(operation).toContain('SET search_path = pg_catalog')
    }
    expect(prepare).toContain('FOR SHARE OF question,revision')
    expect(prepare).toContain('tyt_social_revision_source_policy_ready(p_revision_id)')
    expect(review).toContain('FOR UPDATE')
    expect(review).toContain('FOR SHARE OF question,revision')
    expect(review).toContain('v_stage1.reviewer_id=p_actor_user_id')
    expect(review).toContain('v_candidate.prepared_by=p_actor_user_id')
  })

  it('releases only under locked mapping, capability, combined-proof and immutable-source-evidence checks', () => {
    expect(finalizer).toContain("hashtextextended('tyt-social-governed-release:ba-tyt-sosyal-v1',210)")
    for (const table of [
      'curriculum_scope_releases',
      'questions',
      'question_content_revisions',
      'question_revision_sources',
      'question_revision_approvals',
      'question_outcomes',
      'curriculum_outcomes',
      'question_revision_exam_roles',
      'exam_candidate_policy_versions',
      'exam_candidate_policy_variants',
      'mastery_outcome_evidence',
      'curriculum_scope_source_policy_evidence',
      'tyt_social_policy_capabilities',
    ]) {
      expect(finalizer).toContain(`LOCK TABLE public.${table} IN SHARE`)
    }
    expect(finalizer).toContain('tyt_social_source_policy_integrity(')
    expect(finalizer).toContain('tyt_social_candidate_policy_integrity()')
    expect(finalizer).toContain('tyt_social_combined_release_integrity()')
    expect(finalizer).toContain('curriculum_scope_integrity(')
    expect(finalizer).toContain("v_mapping->>'scopeMismatch'")
    expect(finalizer).toContain("v_mapping->>'primaryMismatch'")
    expect(finalizer).toContain('INSERT INTO public.curriculum_scope_source_policy_evidence')
    expect(finalizer).toContain('evidence_manifest=v_source->\'manifest\'')
    expect(finalizer).toContain("SET release_status='released',diagnostic_enabled=false")
  })

  it('does not auto-backfill history and keeps helpers private while operations stay authenticated-only', () => {
    expect(finalizer).toContain("'historicalEvidenceDisposition','not_backfilled'")
    expect(finalizer).not.toContain('mastery_outcome_evidence (')
    expect(finalizer).not.toContain('curriculum_scope_evidence_repair_runs')
    expect(grants).toContain('public.tyt_social_revision_source_policy_ready(uuid),')
    expect(grants).toContain('FROM PUBLIC,anon,authenticated,service_role;')
    expect(grants).toContain('TO authenticated;')
    const authenticatedGrant = grants.slice(
      grants.indexOf('GRANT EXECUTE ON FUNCTION'),
      grants.indexOf('DO $postcheck$'),
    )
    expect(authenticatedGrant).toContain('prepare_tyt_social_exam_role')
    expect(authenticatedGrant).toContain('review_tyt_social_exam_role')
    expect(authenticatedGrant).toContain('get_tyt_social_release_operations')
    expect(authenticatedGrant).toContain('release_tyt_social_mastery_scope')
    expect(authenticatedGrant).not.toContain('tyt_social_revision_source_policy_ready')
    expect(authenticatedGrant).not.toContain('TO service_role;')
  })
})
