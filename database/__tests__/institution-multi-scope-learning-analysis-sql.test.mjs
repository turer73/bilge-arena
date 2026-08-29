import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
  '194_institution_multi_scope_learning_analysis.sql',
), 'utf8')

function definition(name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  expect(start, `${name} definition`).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('$fn$;', start)
  expect(end, `${name} terminator`).toBeGreaterThan(start)
  return sql.slice(start, end + 5)
}

describe('194 institution multi-scope learning analysis SQL contract', () => {
  it('uses an independent, operation-aware institution release capability', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.institution_scope_capabilities/)
    expect(sql).toMatch(/FOREIGN KEY \(game, display_exam_ref\)[\s\S]*REFERENCES public\.curriculum_scope_releases/)
    expect(sql).toMatch(/capability_status IN \('draft', 'validating', 'released', 'retired'\)/)
    expect(sql).toMatch(/student_analysis_enabled boolean NOT NULL DEFAULT false/)
    expect(sql).toMatch(/aggregate_enabled boolean NOT NULL DEFAULT false/)
    expect(sql).toMatch(/report_enabled boolean NOT NULL DEFAULT false/)
    expect(sql).toMatch(/program_enabled boolean NOT NULL DEFAULT false/)
    expect(sql).toMatch(/'matematik', 'TYT', 'TYT', 'ba-tyt-math-v1',[\s\S]*'released', 'institution-scope-v1'/)
    expect(sql).not.toMatch(/INSERT INTO public\.institution_scope_capabilities[\s\S]{0,900}'fen'/)
    expect(sql).not.toMatch(/INSERT INTO public\.institution_scope_capabilities[\s\S]{0,900}'turkce'/)
    expect(sql).not.toMatch(/INSERT INTO public\.institution_scope_capabilities[\s\S]{0,900}'sosyal'/)
    expect(sql).not.toMatch(/INSERT INTO public\.institution_scope_capabilities[\s\S]{0,900}'wordquest'/)
    expect(sql).toMatch(/ALTER TABLE public\.institution_scope_capabilities ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.institution_scope_capabilities[\s\S]*PUBLIC, anon, authenticated, service_role/)
    const guard = definition('tg_guard_institution_scope_capability(')
    expect(guard).toMatch(/TG_OP = 'DELETE'/)
    expect(guard).toMatch(/OLD\.capability_status IN \('released', 'retired'\)/)
    expect(guard).toMatch(/NEW\.taxonomy_version IS DISTINCT FROM OLD\.taxonomy_version/)
    expect(guard).toMatch(/NEW\.scope_policy_version IS DISTINCT FROM OLD\.scope_policy_version/)
    expect(guard).toMatch(/OLD\.capability_status = 'released'[\s\S]*NEW\.capability_status = 'retired'/)
    expect(sql).toMatch(/CREATE TRIGGER institution_scope_capability_guard[\s\S]*BEFORE UPDATE OR DELETE/)
  })

  it('locks both registries and rejects non-exact, unreleased or dirty scopes', () => {
    const resolver = definition('institution_scope_capability_snapshot(')
    expect(resolver).toMatch(/p_game IS DISTINCT FROM btrim\(p_game\)/)
    expect(resolver).toMatch(/p_game IS DISTINCT FROM lower\(p_game\)/)
    expect(resolver).toMatch(/p_display_exam_ref IS DISTINCT FROM upper\(p_display_exam_ref\)/)
    expect(resolver).toMatch(/capability\.capability_status = 'released'[\s\S]*FOR SHARE/)
    expect(resolver).toMatch(/scope\.release_status = 'released'[\s\S]*FOR SHARE/)
    expect(resolver).toMatch(/question_exam_ref IS DISTINCT FROM v_capability\.question_exam_ref/)
    expect(resolver).toMatch(/taxonomy_version IS DISTINCT FROM v_capability\.taxonomy_version/)
    expect(resolver).toMatch(/curriculum_scope_integrity\(/)
    expect(resolver).toMatch(/institution_scope_integrity_is_clean\(v_integrity\)/)
    expect(resolver).toMatch(/ERRCODE = '23514'/)
  })

  it('exposes only clean analysis scopes through guarded authenticated/service resolvers', () => {
    const exact = definition('resolve_released_institution_scope(')
    const list = definition('list_released_institution_scopes(')
    expect(exact).toMatch(/institution_scope_capability_snapshot\([\s\S]*'analysis'/)
    expect(exact).toMatch(/institution_pilot_assert_operational_actor\(auth\.uid\(\)\)/)
    expect(list).toMatch(/capability_status = 'released'/)
    expect(list).toMatch(/student_analysis_enabled/)
    expect(list).toMatch(/institution_scope_capability_snapshot\(/)
    expect(list).toMatch(/institution_pilot_assert_operational_actor\(auth\.uid\(\)\)/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*public\.resolve_released_institution_scope\(text, text\)[\s\S]*public\.list_released_institution_scopes\(\)[\s\S]*TO authenticated, service_role/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*public\.resolve_released_institution_scope\(text, text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
  })

  it('returns a scope-snapshotted v2 student analysis behind AAL2 and tenant checks', () => {
    const analysis = definition('get_institution_student_learning_analysis_v2(')
    expect(analysis).toMatch(/institution_pilot_assert_operational_actor\(p_user_id\)/)
    expect(analysis).toMatch(/institution_scope_capability_snapshot\([\s\S]*'analysis'/)
    expect(analysis).toMatch(/membership\.institution_id = v_classroom\.institution_id/)
    expect(analysis).toMatch(/membership\.classroom_id = p_classroom_id/)
    expect(analysis).toMatch(/membership\.member_ref = p_member_ref/)
    expect(analysis).toMatch(/answer\.answered_at >= v_membership\.accepted_at/)
    expect(analysis).toMatch(/outcome\.game = v_scope->>'game'/)
    expect(analysis).toMatch(/outcome\.exam_ref = v_scope->>'displayExamRef'/)
    expect(analysis).toMatch(/outcome\.taxonomy_version = v_taxonomy_version/)
    expect(analysis).toMatch(/'institutionReportingEnabled', true/)
    expect(analysis).toMatch(/'scopePolicyVersion', v_scope->>'scopePolicyVersion'/)
    expect(analysis).toMatch(/'modelVersion', 'institution-evidence-v2'/)
    expect(analysis).toMatch(/'windowStart', v_membership\.accepted_at/)
    expect(analysis).toMatch(/'windowEnd', p_window_end/)
    expect(analysis).not.toContain("'questionId'")
    expect(analysis).not.toContain("'answerId'")
  })

  it('keeps the original analysis signature as a strict Math/TYT wrapper', () => {
    const legacy = definition('get_institution_student_learning_analysis(')
    expect(legacy).toMatch(/p_game IS DISTINCT FROM 'matematik'/)
    expect(legacy).toMatch(/p_exam_ref IS DISTINCT FROM 'TYT'/)
    expect(legacy).toMatch(/get_institution_student_learning_analysis_v2\([\s\S]*'matematik', 'TYT'/)
  })

  it('snapshots exact scope columns without rewriting legacy report JSON', () => {
    expect(sql).toMatch(/ALTER TABLE public\.institution_study_programs[\s\S]*ADD COLUMN IF NOT EXISTS game text[\s\S]*ADD COLUMN IF NOT EXISTS display_exam_ref text[\s\S]*ADD COLUMN IF NOT EXISTS question_exam_ref text[\s\S]*ADD COLUMN IF NOT EXISTS scope_policy_version text/)
    expect(sql).toMatch(/UPDATE public\.institution_study_programs[\s\S]*game = 'matematik'[\s\S]*display_exam_ref = 'TYT'[\s\S]*question_exam_ref = 'TYT'[\s\S]*scope_policy_version = 'institution-scope-v1'/)
    expect(sql).toMatch(/ALTER TABLE public\.institution_student_reports[\s\S]*ADD COLUMN IF NOT EXISTS game text[\s\S]*ADD COLUMN IF NOT EXISTS taxonomy_version text[\s\S]*ADD COLUMN IF NOT EXISTS scope_policy_version text/)
    expect(sql).toMatch(/report\.snapshot#>>'\{scope,game\}'/)
    expect(sql).toMatch(/RAISE EXCEPTION 'institution report scope backfill is ambiguous'/)
    expect(sql).toMatch(/UPDATE public\.institution_student_reports[\s\S]*taxonomy_version = 'ba-tyt-math-v1'/)
    expect(sql).not.toMatch(/UPDATE public\.institution_student_reports[\s\S]*SET snapshot\s*=/)
    expect(sql).toMatch(/ALTER TABLE public\.institution_student_followups[\s\S]*ADD COLUMN IF NOT EXISTS game text[\s\S]*ADD COLUMN IF NOT EXISTS taxonomy_version text[\s\S]*ADD COLUMN IF NOT EXISTS scope_policy_version text/)
    expect(sql).toMatch(/UPDATE public\.institution_student_followups[\s\S]*game = 'matematik'[\s\S]*taxonomy_version = 'ba-tyt-math-v1'/)
  })

  it('suppresses aggregate evidence for cohorts below three at the database boundary', () => {
    const growth = definition('get_institution_classroom_growth_metrics_v2(')
    const threshold = growth.indexOf('IF v_active_count < 3 THEN')
    const evidence = growth.indexOf('WITH roster AS')
    expect(threshold).toBeGreaterThan(0)
    expect(evidence).toBeGreaterThan(threshold)
    const suppressed = growth.slice(threshold, evidence)
    expect(suppressed).toContain("'supported', false")
    expect(suppressed).toContain("'reason', 'insufficient_group'")
    expect(suppressed).not.toContain('eligibleStudentCount')
    expect(suppressed).not.toContain('positiveGrowthStudentCount')
    expect(suppressed).not.toContain('excludedInsufficientCount')
    expect(growth).toMatch(/institution_scope_capability_snapshot\([\s\S]*'aggregate'/)
    expect(growth).toMatch(/outcome\.game = v_scope->>'game'/)
    expect(growth).toMatch(/outcome\.exam_ref = v_scope->>'displayExamRef'/)
    expect(growth).toMatch(/outcome\.taxonomy_version = v_scope->>'taxonomyVersion'/)
  })

  it('filters program coverage by all immutable scope dimensions', () => {
    const coverage = definition('get_institution_classroom_published_program_members_v2(')
    expect(coverage).toMatch(/institution_scope_capability_snapshot\([\s\S]*'aggregate'/)
    expect(coverage).toMatch(/program\.game = v_scope->>'game'/)
    expect(coverage).toMatch(/program\.display_exam_ref = v_scope->>'displayExamRef'/)
    expect(coverage).toMatch(/program\.question_exam_ref IS NOT DISTINCT FROM/)
    expect(coverage).toMatch(/program\.taxonomy_version = v_scope->>'taxonomyVersion'/)
    expect(coverage).toMatch(/program\.scope_policy_version = v_scope->>'scopePolicyVersion'/)
    expect(coverage).toMatch(/'scope', jsonb_build_object\([\s\S]*'examRef', v_scope->>'displayExamRef'[\s\S]*'scopePolicyVersion'/)
    const legacy = definition('get_institution_classroom_published_program_members(')
    expect(legacy).toMatch(/get_institution_classroom_published_program_members_v2\([\s\S]*'matematik', 'TYT'/)
  })

  it('binds follow-up indicators and timely programs to the same exact scope', () => {
    const followup = definition('get_institution_classroom_followup_metrics_v2(')
    expect(followup).toMatch(/institution_scope_capability_snapshot\([\s\S]*'aggregate'/)
    expect(followup).toMatch(/followup\.game = v_scope->>'game'/)
    expect(followup).toMatch(/followup\.display_exam_ref = v_scope->>'displayExamRef'/)
    expect(followup).toMatch(/followup\.question_exam_ref IS NOT DISTINCT FROM/)
    expect(followup).toMatch(/followup\.taxonomy_version = v_scope->>'taxonomyVersion'/)
    expect(followup).toMatch(/followup\.scope_policy_version = v_scope->>'scopePolicyVersion'/)
    expect(followup).toMatch(/program\.game = v_scope->>'game'/)
    expect(followup).toMatch(/program\.taxonomy_version = v_scope->>'taxonomyVersion'/)
    expect(followup).toMatch(/'scope', jsonb_build_object\([\s\S]*'examRef', v_scope->>'displayExamRef'[\s\S]*'scopePolicyVersion'/)
    const legacy = definition('get_institution_classroom_followup_metrics(')
    expect(legacy).toMatch(/get_institution_classroom_followup_metrics_v2\([\s\S]*'matematik', 'TYT'/)
  })

  it('binds report and program writes and idempotency ledgers to the exact scope', () => {
    const report = definition('create_institution_student_report_v2(')
    expect(report).toMatch(/institution_scope_capability_snapshot\([\s\S]*'report'/)
    expect(report).toMatch(/scope,questionExamRef/)
    expect(report).toMatch(/scope,taxonomyVersion/)
    expect(report).toMatch(/scope,scopePolicyVersion/)
    expect(report).toMatch(/'displayExamRef', v_scope->>'displayExamRef'/)
    expect(report).toMatch(/INSERT INTO public\.institution_student_reports\([\s\S]*game, display_exam_ref, question_exam_ref, taxonomy_version,[\s\S]*scope_policy_version/)
    expect(report).toMatch(/questionId\|answerId/)

    const program = definition('create_institution_study_program_draft_v2(')
    expect(program).toMatch(/institution_scope_capability_snapshot\([\s\S]*'program'/)
    expect(program).toMatch(/outcome\.game = v_scope->>'game'/)
    expect(program).toMatch(/outcome\.exam_ref = v_scope->>'displayExamRef'/)
    expect(program).toMatch(/outcome\.taxonomy_version = v_scope->>'taxonomyVersion'/)
    expect(program).toMatch(/'scopePolicyVersion', v_scope->>'scopePolicyVersion'/)
    expect(program).toMatch(/INSERT INTO public\.institution_study_programs\([\s\S]*game, display_exam_ref, question_exam_ref, taxonomy_version,[\s\S]*scope_policy_version/)

    const reportHistory = definition('get_institution_student_reports_v2(')
    expect(reportHistory).toMatch(/institution_scope_capability_snapshot\([\s\S]*'report'/)
    expect(reportHistory).toMatch(/stored\.game = v_scope->>'game'/)
    expect(reportHistory).toMatch(/stored\.taxonomy_version = v_scope->>'taxonomyVersion'/)
    expect(reportHistory).toMatch(/'scope', jsonb_build_object\(/)
    const programHistory = definition('get_institution_student_program_history_v2(')
    expect(programHistory).toMatch(/institution_scope_capability_snapshot\([\s\S]*'program'/)
    expect(programHistory).toMatch(/program\.game = v_scope->>'game'/)
    expect(programHistory).toMatch(/program\.taxonomy_version = v_scope->>'taxonomyVersion'/)
    expect(programHistory).toMatch(/'scope', jsonb_build_object\(/)
  })

  it('keeps v2 RPCs on authenticated AAL2/service paths and private helpers unreachable', () => {
    for (const signature of [
      'get_institution_student_learning_analysis_v2(uuid, uuid, text, text, text, timestamptz)',
      'get_institution_classroom_growth_metrics_v2(uuid, uuid, text, text, timestamptz)',
      'get_institution_classroom_published_program_members_v2(uuid, uuid, text, text, timestamptz, timestamptz)',
      'get_institution_classroom_followup_metrics_v2(uuid, uuid, text, text, timestamptz, timestamptz)',
      'create_institution_student_report_v2(uuid, uuid, text, text, text, jsonb, uuid)',
      'get_institution_student_reports_v2(uuid, uuid, text, text, text)',
      'create_institution_study_program_draft_v2(uuid, uuid, text, text, text, date, integer, text, jsonb, uuid)',
      'get_institution_student_program_history_v2(uuid, uuid, text, text, text)',
    ]) {
      expect(sql).toContain(`public.${signature}`)
    }
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*public\.institution_scope_capability_snapshot\(text, text, text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
    const serviceGrantStart = sql.indexOf('GRANT EXECUTE ON FUNCTION\n  public.resolve_released_institution_scope')
    const serviceGrantEnd = sql.indexOf('TO authenticated, service_role;', serviceGrantStart)
    const serviceGrant = sql.slice(serviceGrantStart, serviceGrantEnd + 'TO authenticated, service_role;'.length)
    expect(serviceGrant).toMatch(/get_institution_student_learning_analysis_v2/)
    expect(serviceGrant).toMatch(/create_institution_study_program_draft_v2/)
    expect(serviceGrant).toContain('authenticated, service_role')
    expect(serviceGrant).not.toContain('anon')
  })
})
