import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL(
    '../migrations/209_tyt_social_official_section_composer.sql',
    import.meta.url,
  ),
  'utf8',
)

const composer = migration.slice(
  migration.indexOf(
    'CREATE OR REPLACE FUNCTION public.compose_and_issue_verified_tyt_social_section_attempt',
  ),
  migration.indexOf(
    'CREATE OR REPLACE FUNCTION public.tyt_social_official_section_composer_integrity',
  ),
)

const grants = migration.slice(
  migration.indexOf('-- The arbitrary-array official issuer'),
  migration.indexOf('DO $capability$'),
)

const manifestHelper = migration.slice(
  migration.indexOf(
    'CREATE OR REPLACE FUNCTION public.tyt_social_official_section_composer_manifest_sha256',
  ),
  migration.indexOf('-- The arbitrary-array official issuer'),
)

describe('209 TYT Social official-section composer SQL', () => {
  it('composes an exact 5+5+5+5 section from current policy and selection', () => {
    expect(composer).toContain(
      'resolve_current_tyt_social_candidate_policy()',
    )
    expect(composer).toContain('candidate_exam_policy_events')
    expect(composer).toContain("v_branch_role := 'standard_religion'")
    expect(composer).toContain("v_branch_role := 'alternate_philosophy'")
    expect(composer).toContain("v_common_history <> 5")
    expect(composer).toContain("v_common_geography <> 5")
    expect(composer).toContain("v_common_philosophy <> 5")
    expect(composer).toContain("v_selected_branch <> 5")
    expect(composer).toContain('cardinality(v_question_ids) <> 20')
    expect(composer).toContain("USING ERRCODE = 'P0002'")
  })

  it('uses only active TYT Social questions and their exact published reviewed revisions', () => {
    expect(composer).toContain('question.is_active')
    expect(composer).toContain("question.game = 'sosyal'")
    expect(composer).toContain("revision.status = 'published'")
    expect(composer).toContain('revision.id = question.published_revision_id')
    expect(composer).toContain('revision.question_id = question.id')
    expect(composer).toContain('question_revision_exam_roles')
    expect(composer).toContain(
      'role.policy_version = v_policy.policy_version',
    )
    expect(composer).toContain('tyt_social_exam_role_compatible')
  })

  it('seeds stable per-role ranking from request, subject, policy and immutable revision facts', () => {
    expect(composer).toContain('row_number() OVER')
    expect(composer).toContain('PARTITION BY role.exam_role')
    expect(composer).toContain('p_request_id::text')
    expect(composer).toContain('p_user_id::text')
    expect(composer).toContain('v_policy.policy_version')
    expect(composer).toContain('v_policy.rules_sha256')
    expect(composer).toContain('question.id::text')
    expect(composer).toContain('revision.id::text')
    expect(composer).toContain("'sha256'")
    expect(composer).toContain('WHERE role_rank <= 5')
  })

  it('replays immutable issued facts before recomposition and delegates new facts to the 206 issuer', () => {
    expect(composer).toContain(
      "'tyt-social-attempt:' || p_user_id::text || ':' || p_request_id::text",
    )
    expect(composer).toContain(
      'verified_attempt_candidate_policy_snapshots',
    )
    expect(composer).toContain(
      'issue_verified_tyt_social_attempt_with_event',
    )
    expect(composer).toContain(
      'issue_verified_tyt_social_section_attempt',
    )
    expect(composer).toContain(
      "'composerVersion', 'tyt-social-official-section-v1'",
    )
  })

  it('fails closed behind released scope and the canonical combined proof', () => {
    expect(composer).toContain("scope.release_status = 'released'")
    expect(composer).toContain('NOT scope.diagnostic_enabled')
    expect(composer).toContain('tyt_social_combined_release_integrity()')
    expect(composer).toContain("v_release_integrity->>'ready'")
    expect(composer).toContain(
      "v_release_integrity->>'officialSectionComposerReady'",
    )
    expect(migration).toContain(
      'CREATE TRIGGER trg_guard_tyt_social_official_section_release',
    )
    expect(migration).toContain(
      'TYT Social release requires a deterministic official-section composer',
    )
  })

  it('binds the composer, validated issuer and release trigger to an immutable capability manifest', () => {
    expect(migration).toContain("'official_section_composer_v1'")
    expect(manifestHelper).toContain('LANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER')
    expect(manifestHelper).toContain('SET search_path = pg_catalog')
    expect(manifestHelper).toContain("'composer',pg_catalog.pg_get_functiondef")
    expect(manifestHelper).toContain(
      "'validatedIssuer',pg_catalog.pg_get_functiondef",
    )
    expect(manifestHelper).toContain(
      "'releaseConstraint',pg_catalog.pg_get_triggerdef",
    )
    expect(manifestHelper.match(/pg_catalog\.pg_get_triggerdef\(/g)).toHaveLength(1)
    expect(migration.match(/pg_catalog\.pg_get_triggerdef\(/g)).toHaveLength(1)
    expect(migration).toContain(
      'public.tyt_social_official_section_composer_manifest_sha256()',
    )
    expect(migration).toContain("'semanticComposerCheck', 'passed'")
    expect(migration).toContain("'deterministicByRequestId', true")
    expect(migration).toContain(
      "'directIssuerServiceRoleExecute', false",
    )
    expect(migration).toContain("'officialSectionComposerReady'")
    expect(migration).toContain("'officialSectionComposer'")
    expect(migration).toContain("'manifestFormatVersion',1")
    expect(migration).toContain("'postgresMajor'")
  })

  it('exposes only the deterministic entry point to service_role', () => {
    expect(grants).toContain(
      'compose_and_issue_verified_tyt_social_section_attempt(uuid,integer,uuid)',
    )
    expect(grants).toContain(
      'issue_verified_tyt_social_section_attempt(uuid,uuid[],integer,uuid)',
    )
    expect(grants).toContain(
      'FROM PUBLIC, anon, authenticated, service_role;',
    )
    expect(grants).toContain('TO service_role;')

    const serviceGrant = grants.slice(grants.indexOf('GRANT EXECUTE'))
    expect(serviceGrant).toContain(
      'compose_and_issue_verified_tyt_social_section_attempt',
    )
    expect(serviceGrant).not.toContain(
      'issue_verified_tyt_social_section_attempt(uuid,uuid[],integer,uuid)',
    )
    expect(serviceGrant).not.toContain(
      'tyt_social_official_section_composer_manifest_sha256',
    )
    expect(serviceGrant).not.toContain('TO authenticated;')
  })

  it('keeps the scope validating while the governed source pool is incomplete', () => {
    expect(migration).toContain("release_status = 'validating'")
    expect(migration).toContain('diagnostic_enabled = false')
    expect(migration).toContain(
      'migration 209 must leave TYT Social fail-closed in validating state',
    )
    expect(migration).toContain("'composerBoundaryReady'")
    expect(migration).toContain("'sourcePoolReady'")
  })
})
