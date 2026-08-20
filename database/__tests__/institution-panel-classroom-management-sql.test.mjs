import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '133_institution_panel_classroom_management.sql'),
  'utf8',
)

describe('133 institution panel classroom management SQL contract', () => {
  it('adds a nondelegable manager-only classroom permission', () => {
    expect(sql).toMatch(/'institution\.classrooms\.manage'[\s\S]+false/)
    expect(sql).toMatch(/role\.is_system AND role\.role_key = 'manager'/)
    expect(sql).not.toMatch(/role_key = 'teacher'[\s\S]+'institution\.classrooms\.manage'/)
  })

  it('derives the tenant and teacher from active memberships', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_my_institution_classroom')
    expect(sql).not.toContain('p_institution_id')
    expect(sql).toMatch(/membership\.user_id = p_user_id[\s\S]+membership\.role = 'manager'/)
    expect(sql).toMatch(/membership\.institution_id = v_actor\.institution_id[\s\S]+membership\.member_ref = p_teacher_member_ref[\s\S]+membership\.role = 'teacher'/)
    expect(sql.match(/FOR UPDATE OF membership/g)).toHaveLength(2)
    expect(sql).toContain('VALUES (v_actor.institution_id, v_teacher.user_id, v_name)')
  })

  it('is replay-safe, rejects duplicate tenant names and exposes only service-role execution', () => {
    expect(sql).toContain("operation = 'create_classroom'")
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toMatch(/classroom\.institution_id = v_actor\.institution_id[\s\S]+lower\(btrim\(classroom\.name\)\) = lower\(v_name\)/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role/)
  })
})
