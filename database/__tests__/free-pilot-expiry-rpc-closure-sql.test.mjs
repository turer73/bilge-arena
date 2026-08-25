import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/159_free_pilot_expiry_rpc_closure.sql', import.meta.url),
  'utf8',
)

const guardedRpcNames = [
  'get_institution_tracking_directory',
  'get_institution_student_learning_analysis',
  'get_institution_classroom_published_program_members',
  'get_institution_classroom_growth_metrics',
  'get_institution_classroom_followup_metrics',
  'get_my_institution_support_access',
  'grant_my_institution_support_access',
  'publish_institution_study_program',
  'update_institution_study_program_draft',
  'get_my_classroom_exam_mode',
]

describe('free pilot expiry RPC closure SQL boundary', () => {
  it('renames legacy implementations only once so ledger retries are safe', () => {
    expect(sql).toContain("to_regprocedure('public.' || v_function.legacy_signature) IS NULL")
    expect(sql).toContain("'ALTER FUNCTION public.%s RENAME TO %I'")
  })

  it('places every legacy direct tenant path behind one operational AAL2 guard', () => {
    expect(sql).toContain('public.institution_pilot_assert_operational_actor')
    expect(sql).toContain('NOT public.institution_rpc_actor_has_aal2(p_user_id)')
    expect(sql).toContain('public.institution_pilot_active_institution(p_user_id)')
    for (const rpcName of guardedRpcNames) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${rpcName}`)
    }
    expect(sql.match(/PERFORM public\.institution_pilot_assert_operational_actor\(p_user_id\)/g))
      .toHaveLength(9)
    expect(sql).toContain(
      'v_institution_id := public.institution_pilot_assert_operational_actor(p_user_id)',
    )
  })

  it('makes renamed implementations private and exposes only guarded names', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION[\s\S]*?public\.free_pilot_legacy_tracking_directory[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    )
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION[\s\S]*?public\.get_institution_tracking_directory[\s\S]*?TO authenticated, service_role;/,
    )
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*?free_pilot_legacy_/)
  })

  it('keeps the student privacy-exit RPC outside the expiry guard', () => {
    expect(sql).not.toContain('withdraw_teacher_classroom_membership')
    expect(sql).not.toContain('revoke_my_institution_support_access')
  })
})
