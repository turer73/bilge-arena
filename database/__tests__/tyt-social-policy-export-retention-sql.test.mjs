import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../migrations/207_tyt_social_policy_export_retention.sql', import.meta.url),
  'utf8',
)

describe('207 TYT Social candidate-policy export and retention SQL', () => {
  it('replaces raw subject-table export with an explicit minimized projection', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.export_tyt_social_candidate_policy_data(')
    expect(sql).toContain("'candidate_exam_policy_events',")
    expect(sql).toContain("'verified_attempt_candidate_policy_snapshots',")
    expect(sql).toContain("'daily_plan_candidate_policy_snapshots'")
    expect(sql).toContain('v_candidate_policy := public.export_tyt_social_candidate_policy_data(p_user_id)')
    expect(sql).toContain("'tyt_social_candidate_policy_safe_projection'")
  })

  it('exports neutral selection and integrity provenance without replay or reason fields', () => {
    expect(sql).toContain("'variant', event_row.variant_code")
    expect(sql).toContain("'noticeVersion', event_row.notice_version")
    expect(sql).toContain("'selectionMeaning', 'printed_question_range_only'")
    expect(sql).toContain("'containsReasonReligionOrDocument', false")
    expect(sql).toContain("'rulesSha256', snapshot_row.rules_sha256")
    expect(sql).toContain("'questionSetSha256', snapshot_row.question_set_sha256")
    expect(sql).toContain("'compositionSha256', encode(")
    expect(sql).not.toContain("'requestId', event_row.request_id")
    expect(sql).not.toContain("'religion'")
    expect(sql).not.toContain("'exemptionReason'")
    expect(sql).not.toContain("'documentId'")
  })

  it('keeps deletion fail closed and reports pseudonymous immutable evidence retention', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.preview_tyt_social_candidate_policy_retention(')
    expect(sql).toContain("'pseudonymous_subject_key_retained'")
    expect(sql).toContain("'physicalErasureEnabled', false")
    expect(sql).toContain("'legalDecisionRequired', true")
    expect(sql).toContain('hard account erasure is disabled pending a signed retention decision')
    expect(sql).not.toContain('DELETE FROM public.candidate_exam_policy_events')
    expect(sql).not.toContain('DELETE FROM public.verified_attempt_candidate_policy_snapshots')
    expect(sql).not.toContain('UPDATE public.candidate_exam_policy_events')
  })

  it('postchecks restrictive ownership, append-only evidence and prohibited columns', () => {
    expect(sql).toContain("constraint_row.confdeltype IN ('a', 'r')")
    expect(sql).toContain("trigger_row.tgname LIKE 'trg_%_append_only'")
    expect(sql).toContain('IF v_append_only_count <> 5 THEN')
    expect(sql).toContain("column_row.column_name ~ '(religion|belief|exemption|reason|document|school)'")
    expect(sql).toContain("pg_catalog.strpos(v_policy_export_definition, 'request_id') <> 0")
  })

  it('keeps all new and replaced export surfaces service-role-only and hardened', () => {
    expect(sql).toContain('SET search_path = pg_catalog')
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.export_tyt_social_candidate_policy_data(uuid),',
    )
    expect(sql).toContain('FROM PUBLIC, anon, authenticated, service_role;')
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.export_tyt_social_candidate_policy_data(uuid),',
    )
    expect(sql).toContain('TO service_role;')
    expect(sql).toContain("'search_path=pg_catalog' = ANY")
  })

  it('does not create a scheduler, external processor or automatic purge path', () => {
    expect(sql).not.toContain('pg_cron')
    expect(sql).not.toContain('cron.schedule')
    expect(sql).not.toContain('http_post')
    expect(sql).not.toContain('DELETE FROM auth.users')
  })
})
