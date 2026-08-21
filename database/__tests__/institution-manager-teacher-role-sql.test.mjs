import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '135_institution_manager_teacher_role.sql'),
  'utf8',
)

describe('135 institution manager teacher role SQL contract', () => {
  it('assigns the teacher system role to the existing manager membership', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.set_my_institution_manager_teacher_role')
    expect(sql).toMatch(/membership\.role = 'manager'[\s\S]+institution\.roles\.manage/)
    expect(sql).toMatch(/role\.is_system[\s\S]+role\.role_key = 'teacher'/)
    expect(sql).toMatch(/INSERT INTO public\.institution_membership_roles[\s\S]+v_membership\.id/)
    expect(sql).not.toContain('INSERT INTO public.pilot_institution_memberships')
  })

  it('refuses to disable teaching while the manager owns an active classroom', () => {
    expect(sql).toMatch(/IF p_enabled THEN[\s\S]+ELSE[\s\S]+FROM public\.teacher_classrooms AS classroom/)
    expect(sql).toMatch(/classroom\.teacher_id = p_user_id[\s\S]+classroom\.status = 'active'/)
    expect(sql).toContain("RAISE EXCEPTION 'manager teacher has active classrooms' USING ERRCODE = 'P0003'")
  })

  it('accepts only a primary teacher or an explicit teacher system role as classroom owner', () => {
    expect(sql).toMatch(/membership\.role = 'teacher'[\s\S]+institution_membership_roles AS assignment[\s\S]+role_key = 'teacher'/)
    expect(sql).toMatch(/'canManagePrograms', \(v_can_teach AND classroom\.teacher_id = p_user_id\)/)
    expect(sql).toMatch(/'teacherEnabled', v_can_teach/)
  })

  it('keeps every updated RPC service-role only and replay safe', () => {
    expect(sql).toContain("operation = 'set_manager_teacher_role'")
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role/)
  })
})
