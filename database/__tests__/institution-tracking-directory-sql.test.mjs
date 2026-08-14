import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '115_institution_tracking_directory.sql'),
  'utf8',
)

describe('115 institution tracking directory SQL contract', () => {
  it('is a stable read-only service-only function', () => {
    expect(sql).toMatch(/LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path = pg_catalog/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role/)
    expect(sql).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\b/i)
  })

  it('gives managers their tenant and teachers only their own classrooms', () => {
    expect(sql).toContain("membership.status = 'active'")
    expect(sql).toContain("membership.role IN ('manager', 'teacher')")
    expect(sql).toContain('classroom.institution_id = v_institution_id')
    expect(sql).toContain("v_membership_role = 'manager' OR classroom.teacher_id = p_user_id")
  })

  it('removes inactive, deleted and blocked students', () => {
    expect(sql).toContain("student_membership.status = 'active'")
    expect(sql).toContain('student_profile.deleted_at IS NULL')
    expect(sql).toContain('teacher_classroom_is_blocked(classroom.teacher_id, student_membership.student_id)')
  })

  it('returns opaque refs and aliases without contact or internal user ids', () => {
    const response = sql.slice(sql.indexOf('RETURN jsonb_build_object('))
    expect(sql).toContain("'memberRef'")
    expect(sql).toContain("'teacherAlias'")
    expect(response).not.toMatch(/'userId'|'studentId'|'teacherId'|'email'|'phone'/)
  })
})
