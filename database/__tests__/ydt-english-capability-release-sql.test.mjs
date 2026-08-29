import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const diagnosticSql = readFileSync(join(
  root, '..', 'migrations', '199_release_ydt_english_diagnostic_scope.sql',
), 'utf8')
const institutionSql = readFileSync(join(
  root, '..', 'migrations', '200_release_ydt_english_institution_scope.sql',
), 'utf8')

describe('internal Wordquest English capability release SQL', () => {
  it('keeps diagnostic scope exact and does not make an official YDT claim', () => {
    expect(diagnosticSql).toContain("'ba-ydt-eng-diagnostic-v1'")
    expect(diagnosticSql).toContain("'wordquest', 'YDT', NULL")
    expect(diagnosticSql).toContain("'ba-ydt-eng-v1', 'adaptive-screening-v1', 10, 7, 2")
    expect(diagnosticSql).toContain("question_exam_ref IS NULL")
    expect(diagnosticSql).toContain("scope.taxonomy_version = 'ba-ydt-eng-v1'")
    expect(diagnosticSql).toContain("'vocabulary'), ('phrasal_verbs'), ('grammar')")
    expect(diagnosticSql).toContain("('sentence_completion'), ('cloze_test'), ('restatement'), ('dialogue')")
    expect(diagnosticSql).toContain('exact published candidates')
    expect(diagnosticSql).toContain('candidate_count < 2')
    expect(diagnosticSql).toContain('adaptive_diagnostic_scope_integrity(')
    expect(diagnosticSql).toContain('content_sha256')
    expect(diagnosticSql).toContain("revision.status = 'published'")
    expect(diagnosticSql).toMatch(/mapping\.is_primary[\s\S]*mapping\.mapping_source = 'taxonomy_auto'/)
    expect(diagnosticSql).toContain('marker_gap')
    expect(diagnosticSql).toContain('snapshot_gap')
    expect(diagnosticSql).toContain('revision.exam_ref')
    expect(diagnosticSql).toContain("diagnostic_enabled = true")
    expect(diagnosticSql).toContain('resolve_released_diagnostic_scope')
    expect(diagnosticSql).toContain('adaptive diagnostic ACL postcheck failed')
    expect(diagnosticSql).not.toMatch(/'sosyal'/i)
    expect(diagnosticSql).toMatch(/not an official YDT-representativeness claim/)
  })

  it('preserves replay and exact NULL storage semantics', () => {
    expect(diagnosticSql).toMatch(/ON CONFLICT \(blueprint_version\) DO NOTHING/)
    expect(diagnosticSql).toMatch(/capability_status NOT IN \('draft', 'validating', 'released'\)/)
    expect(diagnosticSql).toMatch(/candidate_gate_version = 'exact-single-outcome-v1'/)
    expect(diagnosticSql).toMatch(/capability_status = 'released'[\s\S]*released_at IS NOT NULL/)
    expect(diagnosticSql).toMatch(/question_exam_ref IS NULL[\s\S]*taxonomy_version = 'ba-ydt-eng-v1'/)
    expect(diagnosticSql).toMatch(/question\.exam_ref IS NULL/)
    expect(diagnosticSql).not.toMatch(/NULLIF\(upper\(btrim\(COALESCE\(question\.exam_ref, ''\)\)\), ''\) IS (?:NOT )?NULL/)
    expect(diagnosticSql).toMatch(/target contains non-NULL question exam_ref/)
    expect(diagnosticSql).toContain('v_emergency_disabled')
    expect(diagnosticSql).toContain('emergency diagnostic disable was not preserved')
    expect(diagnosticSql).toMatch(/IF NOT \(SELECT already_released FROM ydt_english_diagnostic_release_control\) THEN[\s\S]*SET diagnostic_enabled = true/)
    expect(diagnosticSql).not.toMatch(/IF \(SELECT already_released FROM ydt_english_diagnostic_release_control\) THEN\s+RETURN;/)
    expect(diagnosticSql).toMatch(/LOCK TABLE[\s\S]*adaptive_diagnostic_blueprints[\s\S]*IN SHARE ROW EXCLUSIVE MODE/)
  })

  it('releases institution analysis and aggregate only', () => {
    expect(institutionSql).toContain("'wordquest', 'YDT', NULL, 'ba-ydt-eng-v1'")
    expect(institutionSql).toContain("'draft', 'institution-scope-v1'")
    expect(institutionSql).toContain('student_analysis_enabled, aggregate_enabled, report_enabled')
    expect(institutionSql).toContain('true, true, false, false, NULL')
    expect(institutionSql).toContain("institution_scope_capability_snapshot(\n    'wordquest', 'YDT', 'aggregate'")
    expect(institutionSql).toContain("resolve_released_institution_scope('wordquest', 'YDT')")
    expect(institutionSql).toContain("resolve_released_diagnostic_scope('wordquest', 'YDT')")
    expect(institutionSql).toContain('internal Wordquest institution release requires its exact diagnostic proof')
    expect(institutionSql).toContain('pg_get_functiondef(')
    expect(institutionSql).toMatch(/position\('''aggregate''' IN v_program_members_definition\) = 0/)
    expect(institutionSql).toMatch(/position\('''program''' IN v_program_members_definition\) > 0/)
    expect(institutionSql).toContain("scope_policy_version <> 'institution-scope-v1'")
    expect(institutionSql).toContain('get_institution_student_learning_analysis_v2')
    expect(institutionSql).toContain('report_enabled')
    expect(institutionSql).toContain('program_enabled')
    expect(institutionSql).toContain('ydt_english_institution_non_target_snapshot')
    expect(institutionSql).toContain("game <> 'wordquest'")
    expect(institutionSql).toContain('non-target institution capability snapshot changed')
    expect(institutionSql).toContain('ydt_english_institution_release_control')
    expect(institutionSql).toContain('first internal Wordquest institution release requires diagnostic_enabled=true')
    expect(institutionSql).toContain('public.adaptive_diagnostic_scope_integrity(')
    expect(institutionSql).toContain('emergency diagnostic disable was not preserved during institution replay')
    expect(institutionSql).toMatch(/LOCK TABLE[\s\S]*questions,[\s\S]*question_outcomes,[\s\S]*question_content_revisions,[\s\S]*adaptive_diagnostic_blueprints[\s\S]*IN SHARE ROW EXCLUSIVE MODE/)
    expect(institutionSql).not.toMatch(/'sosyal'/i)
    expect(institutionSql).not.toMatch(/report_enabled\s*=\s*true|program_enabled\s*=\s*true/)
  })

  it('uses the database capability gate rather than local JSON assumptions', () => {
    expect(diagnosticSql).toContain('curriculum_scope_integrity(')
    expect(diagnosticSql).toContain('public.adaptive_diagnostic_scope_integrity(')
    expect(institutionSql).toContain('public.curriculum_scope_integrity(')
    expect(institutionSql).toContain('institution_scope_capabilities')
    expect(institutionSql).toContain("capability_status NOT IN ('draft', 'validating', 'released')")
    expect(institutionSql).toContain("AND capability_status = 'validating'")
    expect(diagnosticSql).toContain("USING ERRCODE = '23514'")
    expect(institutionSql).toContain("USING ERRCODE = '23514'")
  })
})
