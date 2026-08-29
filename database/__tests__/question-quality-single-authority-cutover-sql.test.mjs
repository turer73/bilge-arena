import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
  '144_question_quality_single_authority_cutover.sql',
), 'utf8')

describe('144 question quality single-authority cutover SQL', () => {
  it('keeps migration-first legacy intake open until enforcement and then gates it in RLS', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS legacy_report_intake_enabled boolean NOT NULL DEFAULT true/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.legacy_error_report_intake_enabled\(\)/)
    expect(sql).toMatch(/SELECT COALESCE\(\([\s\S]*legacy_report_intake_enabled/)
    expect(sql).toMatch(/CREATE POLICY "error_reports_insert"[\s\S]*legacy_error_report_intake_enabled\(\)/)
    expect(sql).toMatch(/WHEN p_enforced THEN false ELSE legacy_report_intake_enabled/)
  })

  it('imports pending legacy reports before enabling and fails closed on any orphan', () => {
    const importAt = sql.indexOf('INSERT INTO public.question_appeals')
    const enableAt = sql.indexOf('UPDATE public.content_governance_runtime')
    expect(importAt).toBeGreaterThan(0)
    expect(enableAt).toBeGreaterThan(importAt)
    expect(sql).toMatch(/ON CONFLICT\(legacy_error_report_id\) DO NOTHING/)
    expect(sql).toMatch(/pending legacy reports could not be imported/)
    expect(sql).toMatch(/ERRCODE='23514'/)
    expect(sql).toMatch(/old admin during the rollout window[\s\S]*FROM public\.error_reports report/)
  })

  it('reads dashboard counts only from the governed appeal authority', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_question_quality_appeal_counts/)
    expect(sql).toMatch(/FROM public\.question_appeals appeal/)
    expect(sql).toMatch(/verified_session','issued_attempt/)
    const countFunction = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.get_question_quality_appeal_counts'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.finalize_legacy_question_appeal_transition'),
    )
    expect(countFunction).not.toMatch(/FROM public\.error_reports/)
  })

  it('keeps cutover and count RPCs service-mediated', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_question_quality_appeal_counts\(uuid,integer\)[\s\S]*FROM PUBLIC,anon,authenticated,service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_question_quality_appeal_counts\(uuid,integer\)[\s\S]*TO service_role/)
    expect(sql).toMatch(/content_governance_has_permission\(p_user_id,'admin\.questions\.view'\)/)
  })

  it('honours only pre-cutover legacy reward promises idempotently', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.finalize_legacy_question_appeal_transition/)
    expect(sql).toMatch(/appeal\.legacy_error_report_id IS NULL[\s\S]*'legacy',false/)
    expect(sql).toMatch(/report\.rewarded_at IS NOT NULL[\s\S]*'replayed',true/)
    expect(sql).toMatch(/PERFORM public\.increment_coins\(report\.user_id,p_coins\)/)
    expect(sql).toMatch(/p_coins NOT BETWEEN 1 AND 300/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.finalize_legacy_question_appeal_transition\(uuid,uuid,integer\)/)
  })
})
