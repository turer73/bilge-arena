import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../migrations/203_retention_erasure_profile_tombstone_safety.sql', import.meta.url),
  'utf8',
)

describe('203 retention erasure profile tombstone safety SQL', () => {
  it('turns the legacy physical-erasure entry point into an explicit fail-closed boundary', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.hard_delete_expired_users()')
    expect(sql).toContain("USING ERRCODE = '55000'")
    expect(sql).toContain('hard account erasure is disabled pending a signed retention decision')
    expect(sql).not.toContain('DELETE FROM public.profiles')
    expect(sql).not.toContain('DELETE FROM auth.users')
    expect(sql).not.toContain('DELETE FROM public.institution_operation_events')
    expect(sql).not.toContain('DELETE FROM public.verified_attempts')
  })

  it('provides only a bounded, no-PII preview with governance and restrictive-FK counts', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.preview_expired_account_retention(')
    expect(sql).toContain('p_batch_size integer DEFAULT 25')
    expect(sql).toContain('p_batch_size must be between 1 and 100')
    expect(sql).toContain('pg_try_advisory_xact_lock')
    expect(sql).toContain("constraint_row.confrelid = 'public.profiles'::pg_catalog.regclass")
    expect(sql).toContain('FROM pg_catalog.pg_constraint AS constraint_row')
    expect(sql).toContain("constraint_row.confdeltype IN ('a', 'r')")
    expect(sql).toContain('public.verified_attempt_question_revisions')
    expect(sql).toContain('public.question_appeals')
    expect(sql).toContain('public.question_result_corrections')
    expect(sql).toContain("'eligibleTombstones', v_processed")
    expect(sql).toContain("'physicalPurgeEnabled', false")
    expect(sql).toContain("'legalDecisionRequired', true")
  })

  it('keeps both maintenance RPCs service-role-only and definer-hardened', () => {
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain('SET search_path = pg_catalog')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.hard_delete_expired_users() FROM PUBLIC, anon, authenticated;')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.preview_expired_account_retention(integer) FROM PUBLIC, anon, authenticated;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.hard_delete_expired_users() TO service_role;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.preview_expired_account_retention(integer) TO service_role;')
    expect(sql).toContain("'search_path=pg_catalog' = ANY")
  })

  it('does not add an unauthorised cron or automation surface', () => {
    expect(sql).not.toContain('pg_cron')
    expect(sql).not.toContain('cron.schedule')
    expect(sql).not.toContain('http_post')
  })
})
