import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/157_invitation_only_free_institution_pilot.sql', import.meta.url),
  'utf8',
)

describe('invitation-only free institution pilot SQL boundary', () => {
  it('keeps the pilot bounded and distinct from paid onboarding', () => {
    expect(sql).toContain("'invitation_free'")
    expect(sql).toContain('p_student_limit NOT BETWEEN 1 AND 40')
    expect(sql).toContain('p_staff_limit NOT BETWEEN 1 AND 2')
    expect(sql).toContain('p_trial_days NOT BETWEEN 14 AND 60')
    expect(sql).toContain("v_approval_ref !~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$'")
    expect(sql).toContain('pilot_institutions_free_approval_ref_unique')
    expect(sql).not.toContain('INSTITUTION_ONBOARDING_ENABLED')
  })

  it('requires a JWT-bound AAL2 platform administrator', () => {
    expect(sql).toContain('IF auth.uid() IS NULL')
    expect(sql).toContain('auth.uid() IS DISTINCT FROM p_user_id')
    expect(sql).toContain('NOT public.institution_rpc_actor_has_aal2(p_user_id)')
    expect(sql).toContain('public.institution_pilot_is_platform_admin(p_user_id)')
    expect(sql).toContain("control.control_key = 'free_provisioning' AND control.enabled")
    expect(sql).toContain('institution actor mismatch or AAL2 required')
  })

  it('uses the retained request ledger and writes immutable non-PII audit metadata', () => {
    expect(sql).toContain("operation = 'provision_free_pilot'")
    expect(sql).toContain("p_user_id, 'provision_free_pilot', p_request_id, v_hash, v_result")
    expect(sql).toContain("'institution_provisioned'")
    expect(sql).toContain("'studentLimit'")
    expect(sql).toContain("'reviewDueAt'")
    expect(sql).not.toMatch(/metadata[\s\S]{0,500}managerUserId/i)
  })

  it('requires a non-PII change reference for the separate database gate', () => {
    expect(sql).toContain('public.institution_pilot_control_events')
    expect(sql).toContain("current_setting('app.institution_control_change_ref', true)")
    expect(sql).toContain('institution pilot control change reference required')
    expect(sql).toContain('CREATE TRIGGER institution_pilot_control_change_audit')
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.institution_pilot_control_events[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    )
  })

  it('fails tenant access closed after the review deadline', () => {
    expect(sql).toContain('public.institution_pilot_is_operational(institution.id)')
    expect(sql).toContain('institution.review_due_at > statement_timestamp()')
    expect(sql).toContain('expired free institution pilot cannot be active')
    expect(sql).toContain('CREATE TRIGGER pilot_institutions_free_lifecycle_guard')
  })

  it('revokes default execution and grants only the authenticated browser role', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.provision_free_pilot_institution\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.provision_free_pilot_institution\([\s\S]*?TO authenticated;/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.audit_free_pilot_institution_request\(\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/)
  })
})
