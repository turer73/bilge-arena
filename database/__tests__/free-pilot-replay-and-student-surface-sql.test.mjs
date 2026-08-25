import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL(
    '../migrations/159_free_pilot_replay_and_student_surface_closure.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('free pilot replay and student surface SQL boundary', () => {
  it('renames replay implementations only once so ledger retries are safe', () => {
    expect(sql).toContain("to_regprocedure('public.' || v_function.legacy_signature) IS NULL")
    expect(sql).toContain("'ALTER FUNCTION public.%s RENAME TO %I'")
  })

  it('guards replay-first privileged mutations before the legacy result path', () => {
    for (const rpcName of [
      'transfer_my_pilot_institution_manager',
      'resolve_institution_student_followup',
      'review_institution_study_program',
    ]) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${rpcName}`)
    }
    expect(sql.match(/PERFORM public\.institution_pilot_assert_operational_actor\(p_user_id\)/g))
      .toHaveLength(3)
  })

  it('requires an operational target for invite acceptance and assignment submission', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.submit_teacher_assignment')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.accept_teacher_classroom_invite')
    expect(sql).toContain('public.institution_pilot_is_operational(classroom.institution_id)')
    expect(sql).toContain("request.operation = 'accept_invite'")
    expect(sql).toContain("request.result #>> '{classroom,id}'")
  })

  it('filters both service-role student reads at the row-level operational boundary', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_my_institution_study_programs')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_my_assistance_policy')
    expect(sql.match(/public\.institution_pilot_is_operational\(institution\.id\)/g))
      .toHaveLength(2)
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION[\s\S]*?get_my_institution_study_programs[\s\S]*?get_my_assistance_policy[\s\S]*?TO service_role;/,
    )
  })

  it('keeps privacy and security exits callable after expiry', () => {
    expect(sql).not.toContain('withdraw_teacher_classroom_membership')
    expect(sql).not.toContain('revoke_my_institution_support_access')
  })

  it('makes legacy implementations private', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION[\s\S]*?free_pilot_legacy_manager_transfer[\s\S]*?free_pilot_legacy_invite_accept[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    )
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*?free_pilot_legacy_/)
  })
})
