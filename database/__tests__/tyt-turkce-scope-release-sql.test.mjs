import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const diagnostic = readFileSync(join(root, '197_release_tyt_turkce_diagnostic_scope.sql'), 'utf8')
const institution = readFileSync(join(root, '198_release_tyt_turkce_institution_scope.sql'), 'utf8')

describe('TYT Turkish scope release proofs', () => {
  it('publishes only the exact ten-question, five-outcome diagnostic blueprint', () => {
    expect(diagnostic).toContain("'ba-tyt-turkce-diagnostic-v1', 'turkce', 'TYT', 'TYT'")
    expect(diagnostic).toContain("'ba-tyt-turkce-v2', 'adaptive-screening-v1', 10, 5, 2")
    expect(diagnostic).toContain("'exact-single-outcome-v1', true, 'validating'")
    for (const category of ['paragraf', 'dil_bilgisi', 'sozcuk', 'anlam_bilgisi', 'yazim_kurallari']) {
      expect(diagnostic).toContain(`'${category}'`)
    }
    expect(diagnostic).toContain('public.adaptive_diagnostic_scope_integrity(')
    expect(diagnostic).toContain("candidateCapacity')::integer < 10")
    expect(diagnostic).toContain("emptyCandidateOutcome')::integer <> 0")
    expect(diagnostic).toContain("scope.diagnostic_enabled IS DISTINCT FROM true")
    expect(diagnostic).toContain('tyt_turkce_diagnostic_release_control')
    expect(diagnostic).toContain('had_released_blueprint')
    expect(diagnostic).toMatch(/NOT \(SELECT had_released_blueprint[\s\S]*scope\.diagnostic_enabled IS DISTINCT FROM true/)
    expect(diagnostic).toContain('v_emergency_disabled')
    expect(diagnostic).toContain('TYT Turkish emergency diagnostic disable was not preserved')
  })

  it('fails closed on blueprint drift and protects the diagnostic ACL boundary', () => {
    expect(diagnostic).toContain("v_blueprint.capability_status = 'retired'")
    expect(diagnostic).toContain('another released TYT Turkish diagnostic blueprint exists')
    expect(diagnostic).toContain("v_blueprint.capability_status = 'released' AND v_blueprint.released_at IS NULL")
    expect(diagnostic).toContain('TYT Turkish diagnostic ACL postcheck failed')
    expect(diagnostic).toContain('has_table_privilege(\'service_role\', \'public.adaptive_diagnostic_blueprints\', \'SELECT\')')
    expect(diagnostic).toContain("has_function_privilege('anon', 'public.start_adaptive_diagnostic_v3")
    expect(diagnostic).toMatch(/mapping\.is_primary[\s\S]*mapping\.mapping_source = 'taxonomy_auto'/)
    expect(diagnostic).toMatch(/upper\(btrim\(COALESCE\(revision\.exam_ref, ''\)\)\) = 'TYT'/)
    expect(diagnostic).toContain('TYT Turkish diagnostic exact candidate proof failed')
    expect(diagnostic).toMatch(/v_min_candidate_count < 2/)
  })

  it('releases institution analysis and aggregate only, with exact scope checks', () => {
    expect(institution).toContain("'turkce', 'TYT', 'TYT', 'ba-tyt-turkce-v2'")
    expect(institution).toContain("'validating', 'institution-scope-v1'")
    expect(institution).toContain('true, true, false, false, NULL')
    expect(institution).toContain('tyt_turkce_institution_release_control')
    expect(institution).toContain('first TYT Turkish institution release requires diagnostic_enabled=true')
    expect(institution).toContain('public.adaptive_diagnostic_scope_integrity(')
    expect(institution).toContain('emergency diagnostic disable was not preserved during institution replay')
    expect(institution).toContain("public.resolve_released_diagnostic_scope('turkce', 'TYT')")
    expect(institution).toContain('TYT Turkish institution release requires its exact diagnostic proof')
    expect(institution).toContain("public.institution_scope_capability_snapshot(\n    'turkce', 'TYT', 'analysis'")
    expect(institution).toContain('get_institution_classroom_published_program_members_v2')
    expect(institution).toContain('pg_get_functiondef(')
    expect(institution).toMatch(/position\('''aggregate''' IN v_program_members_definition\) = 0/)
    expect(institution).toMatch(/position\('''program''' IN v_program_members_definition\) > 0/)
    expect(institution).toContain('institution_scope_capability_other_snapshot')
    expect(institution).toContain('other institution capability rows changed during TYT Turkish release')
    expect(institution).toMatch(/LOCK TABLE[\s\S]*question_content_revisions,[\s\S]*adaptive_diagnostic_blueprints[\s\S]*IN SHARE ROW EXCLUSIVE MODE/)
  })

  it('keeps report/program disabled and checks resolver/list plus ACLs', () => {
    expect(institution).toContain('OR capability.report_enabled')
    expect(institution).toContain('OR capability.program_enabled')
    expect(institution).toContain("public.resolve_released_institution_scope('turkce', 'TYT')")
    expect(institution).toContain('public.list_released_institution_scopes()')
    expect(institution).toContain('TYT Turkish institution scope ACL postcheck failed')
    expect(institution).toContain("has_table_privilege('anon', 'public.institution_scope_capabilities', 'SELECT')")
  })
})
