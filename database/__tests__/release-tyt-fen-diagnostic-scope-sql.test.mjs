import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrations = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const diagnosticSql = readFileSync(
  join(migrations, '195_release_tyt_fen_diagnostic_scope.sql'),
  'utf8',
)
const institutionSql = readFileSync(
  join(migrations, '196_release_tyt_fen_institution_scope.sql'),
  'utf8',
)

describe('TYT Fen capability release migrations', () => {
  it('195 releases only the exact immutable 10/3/4 diagnostic blueprint', () => {
    expect(diagnosticSql).toContain("SET LOCAL lock_timeout = '10s'")
    expect(diagnosticSql).toContain("SET LOCAL statement_timeout = '120s'")
    expect(diagnosticSql).toContain("'ba-tyt-fen-diagnostic-v1', 'fen', 'TYT', 'TYT',")
    expect(diagnosticSql).toContain("'ba-tyt-fen-v1', 'adaptive-screening-v1', 10, 3, 4,")
    expect(diagnosticSql).toMatch(/scope\.game = 'fen'[\s\S]*scope\.display_exam_ref = 'TYT'[\s\S]*scope\.question_exam_ref = 'TYT'[\s\S]*scope\.taxonomy_version = 'ba-tyt-fen-v1'[\s\S]*scope\.release_status = 'released'/)
    expect(diagnosticSql).toMatch(/SET diagnostic_enabled = true[\s\S]*WHERE game = 'fen'[\s\S]*display_exam_ref = 'TYT'[\s\S]*question_exam_ref = 'TYT'[\s\S]*taxonomy_version = 'ba-tyt-fen-v1'/)
    expect(diagnosticSql).toMatch(/v_existing_released boolean := false/)
    expect(diagnosticSql).toMatch(/IF NOT v_existing_released THEN[\s\S]*SET diagnostic_enabled = true/)
    expect(diagnosticSql).toContain('fen_diagnostic_release_control')
    expect(diagnosticSql).toContain('v_emergency_disabled')
    expect(diagnosticSql).toContain('TYT Fen emergency diagnostic disable was not preserved')
    expect(diagnosticSql).toMatch(/v_blueprint\.capability_status NOT IN \('validating', 'released'\)/)
    expect(diagnosticSql).toMatch(/capability_status = 'released'[\s\S]*capability_status = 'validating'/)
    expect(diagnosticSql).toMatch(/capability_status = 'validating' AND v_blueprint\.released_at IS NOT NULL/)
    expect(diagnosticSql).toMatch(/capability_status = 'released' AND v_blueprint\.released_at IS NULL/)
  })

  it('195 fails closed on clean mapping, immutable revisions, primary provenance, and per-outcome capacity', () => {
    expect(diagnosticSql).toContain('public.adaptive_diagnostic_scope_integrity(')
    expect(diagnosticSql).toMatch(/mapping\.is_primary[\s\S]*mapping\.mapping_source = 'taxonomy_auto'/)
    expect(diagnosticSql).toMatch(/revision\.id = question\.published_revision_id[\s\S]*revision\.status = 'published'/)
    expect(diagnosticSql).toMatch(/upper\(btrim\(COALESCE\(revision\.exam_ref, ''\)\)\) = 'TYT'/)
    for (const category of ['fizik', 'kimya', 'biyoloji']) {
      expect(diagnosticSql).toContain(`'${category}'`)
    }
    expect(diagnosticSql).toMatch(/v_distinct_category_count <> 3/)
    expect(diagnosticSql).toMatch(/v_unexpected_category_count <> 0/)
    expect(diagnosticSql).toMatch(/btrim\(COALESCE\(revision\.content_sha256, ''\)\) <> ''/)
    expect(diagnosticSql).toMatch(/jsonb_array_length\(revision\.content -> 'options'\) BETWEEN 2 AND 10/)
    expect(diagnosticSql).toMatch(/count\(DISTINCT outcome\.id\) = 1/)
    expect(diagnosticSql).toMatch(/v_min_candidate_count < 2/)
    expect(diagnosticSql).toMatch(/v_candidate_capacity < 10/)
    expect(diagnosticSql).toMatch(/v_empty_candidate_outcomes <> 0/)
    expect(diagnosticSql).toContain('TYT Fen diagnostic exact candidate proof failed')
  })

  it('195 preserves other scope state and keeps the V3 boundary service-only', () => {
    expect(diagnosticSql).toContain('fen_diagnostic_non_fen_scope_snapshot')
    expect(diagnosticSql).toContain('fen_diagnostic_non_fen_blueprint_snapshot')
    expect(diagnosticSql).toContain('TYT Fen diagnostic release changed another subject scope')
    expect(diagnosticSql).toMatch(/has_table_privilege\('service_role', 'public\.adaptive_diagnostic_blueprints', 'SELECT'\)/)
    expect(diagnosticSql).toMatch(/has_function_privilege\('anon',[\s\S]*resolve_released_diagnostic_scope/)
    expect(diagnosticSql).toMatch(/has_function_privilege\('authenticated',[\s\S]*resolve_released_diagnostic_scope/)
    expect(diagnosticSql).toMatch(/NOT has_function_privilege\('service_role',[\s\S]*start_adaptive_diagnostic_v3/)
  })

  it('196 releases Fen analysis and aggregates, but leaves report and program unavailable', () => {
    expect(institutionSql).toContain("'fen', 'TYT', 'TYT', 'ba-tyt-fen-v1',")
    expect(institutionSql).toContain("'validating', 'institution-scope-v1',")
    expect(institutionSql).toContain('true, true, false, false, NULL')
    expect(institutionSql).toMatch(/capability_status = 'validating' AND v_capability\.released_at IS NOT NULL/)
    expect(institutionSql).toMatch(/v_capability\.report_enabled[\s\S]*v_capability\.program_enabled/)
    expect(institutionSql).toContain("institution_scope_capability_snapshot('fen', 'TYT', 'aggregate')")
    expect(institutionSql).toContain("institution_scope_capability_snapshot('fen', 'TYT', 'report')")
    expect(institutionSql).toContain("institution_scope_capability_snapshot('fen', 'TYT', 'program')")
    expect(institutionSql).toContain('TYT Fen report capability must remain disabled')
    expect(institutionSql).toContain('TYT Fen program capability must remain disabled')
  })

  it('196 validates diagnostics, exact resolver/list payloads, and the aggregate program-members read contract', () => {
    expect(institutionSql).toContain("public.resolve_released_diagnostic_scope('fen', 'TYT')")
    expect(institutionSql).toContain('public.institution_scope_integrity_is_clean(v_integrity)')
    expect(institutionSql).toMatch(/jsonb_array_elements\(v_scopes\)[\s\S]*listed\.scope ->> 'game' = 'fen'/)
    expect(institutionSql).toContain('get_institution_classroom_published_program_members_v2(uuid,uuid,text,text,timestamptz,timestamptz)')
    expect(institutionSql).toMatch(/position\('''aggregate''' IN v_program_members_definition\) = 0/)
    expect(institutionSql).toMatch(/position\('''program''' IN v_program_members_definition\) > 0/)
    expect(institutionSql).toContain('fen_institution_release_control')
    expect(institutionSql).toContain('first TYT Fen institution release requires diagnostic_enabled=true')
    expect(institutionSql).toContain('adaptive_diagnostic_scope_integrity(')
    expect(institutionSql).toContain('emergency diagnostic disable was not preserved during institution replay')
  })

  it('196 detects non-Fen scope mutation and enforces private capability metadata/RPC ACLs', () => {
    expect(institutionSql).toContain("SET LOCAL lock_timeout = '10s'")
    expect(institutionSql).toContain("WHERE scope.game <> 'fen'")
    expect(institutionSql).toContain("WHERE capability.game <> 'fen'")
    expect(institutionSql).toContain('fen_institution_other_scope_snapshot')
    expect(institutionSql).toContain('fen_institution_other_capability_snapshot')
    expect(institutionSql).toContain('TYT Fen institution release changed another subject scope state')
    expect(institutionSql).toMatch(/has_table_privilege\('service_role', 'public\.institution_scope_capabilities', 'SELECT'\)/)
    expect(institutionSql).toMatch(/has_function_privilege\('anon',[\s\S]*resolve_released_institution_scope/)
    expect(institutionSql).toMatch(/NOT has_function_privilege\('authenticated',[\s\S]*get_institution_classroom_published_program_members_v2/)
  })
})
