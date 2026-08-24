import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const lifecycle = readFileSync(
  new URL('../migrations/151_institution_lifecycle_control.sql', import.meta.url),
  'utf8',
)
const retention = readFileSync(
  new URL('../migrations/152_institution_request_ledger_retention.sql', import.meta.url),
  'utf8',
)

describe('institution lifecycle and request-ledger retention SQL', () => {
  it('binds lifecycle changes to the platform admin JWT and immutable evidence', () => {
    expect(lifecycle).toContain('CREATE OR REPLACE FUNCTION public.set_pilot_institution_status')
    expect(lifecycle).toContain('auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id')
    expect(lifecycle).toContain('institution_pilot_is_platform_admin(p_user_id)')
    expect(lifecycle).toContain("v_institution.status = 'archived' AND p_status <> 'archived'")
    expect(lifecycle).toContain("'institution_status_changed'")
    expect(lifecycle).toContain("'reason', v_reason")
    expect(lifecycle).toContain('TO authenticated;')
  })

  it('prunes only request ledgers behind a bounded service-role cutoff', () => {
    expect(retention).toContain("p_cutoff > clock_timestamp() - interval '30 days'")
    expect(retention).toContain("p_cutoff < clock_timestamp() - interval '2 years'")
    expect(retention).toContain('DELETE FROM public.pilot_institution_requests WHERE created_at < p_cutoff')
    expect(retention).toContain('DELETE FROM public.teacher_classroom_requests WHERE created_at < p_cutoff')
    expect(retention).not.toContain('DELETE FROM public.institution_operation_events')
    expect(retention).toContain('TO service_role;')
  })

  it('forward-fixes the migration 136 trigger grant leak', () => {
    expect(retention).toContain('REVOKE ALL ON FUNCTION public.tg_require_question_validation_decision()')
    expect(retention).toContain('FROM PUBLIC, anon, authenticated, service_role;')
  })
})
