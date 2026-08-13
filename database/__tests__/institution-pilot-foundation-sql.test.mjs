import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '112_institution_pilot_foundation.sql'),
  'utf8',
)

function functionBody(name, nextName) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  const end = nextName
    ? sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nextName}`, start + 1)
    : sql.indexOf('REVOKE ALL ON FUNCTION', start + 1)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('112 institution pilot foundation SQL contract', () => {
  it('creates three private tenant tables and denies direct service-role DML', () => {
    const tables = [
      'pilot_institutions',
      'pilot_institution_memberships',
      'pilot_institution_requests',
    ]
    for (const table of tables) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`)
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
    }
    expect(sql).toMatch(/REVOKE ALL ON TABLE[\s\S]+FROM PUBLIC, anon, authenticated, service_role/)
  })

  it('keeps the paid pilot at one active tenant, one manager and six staff', () => {
    expect(sql).toContain('staff_limit smallint NOT NULL DEFAULT 6')
    expect(sql).toContain('student_limit smallint NOT NULL DEFAULT 200')
    expect(sql).toMatch(/pilot_institution_one_active_tenant_per_staff[\s\S]+\(user_id\)[\s\S]+WHERE status = 'active'/)
    expect(sql).toMatch(/pilot_institution_one_active_manager[\s\S]+WHERE status = 'active' AND role = 'manager'/)
    const addTeacher = functionBody(
      'add_pilot_institution_teacher',
      'remove_pilot_institution_teacher',
    )
    expect(addTeacher).toMatch(/v_staff_count >= v_institution\.staff_limit/)
    expect(addTeacher).toMatch(
      /teacher_id = p_teacher_user_id[\s\S]+institution_id <> p_institution_id/,
    )
    expect(addTeacher).toContain('teacher classrooms require an explicit tenant transfer')
  })

  it('requires platform permission for provision and manager scope for staff changes', () => {
    expect(sql).toContain("'institution.pilots.manage'")
    expect(sql).toContain("'institution.pilot.access'")
    expect(functionBody('provision_pilot_institution', 'add_pilot_institution_teacher'))
      .toContain('institution_pilot_is_platform_admin(p_user_id)')
    for (const [name, next] of [
      ['add_pilot_institution_teacher', 'remove_pilot_institution_teacher'],
      ['remove_pilot_institution_teacher', 'get_my_pilot_institution'],
    ]) {
      expect(functionBody(name, next)).toMatch(/institution_pilot_has_role\([\s\S]+ARRAY\['manager'\]/)
    }
  })

  it('binds every classroom to the active tenant and fails closed on legacy rows', () => {
    expect(sql).toMatch(/ALTER TABLE public\.teacher_classrooms[\s\S]+ADD COLUMN IF NOT EXISTS institution_id/)
    expect(sql).toContain('teacher classrooms exist without an institution; explicit migration required')
    expect(sql).toMatch(/ALTER TABLE public\.teacher_classrooms[\s\S]+ALTER COLUMN institution_id SET NOT NULL/)
    const create = functionBody('create_teacher_classroom', 'get_my_teacher_classrooms')
    expect(create).toContain('institution_pilot_active_institution(p_user_id)')
    expect(create).toContain('INSERT INTO public.teacher_classrooms (institution_id, teacher_id, name)')
    const list = functionBody('get_my_teacher_classrooms', null)
    expect(list).toContain('classroom.institution_id = v_institution_id')
  })

  it('makes the global teacher role insufficient without active tenant membership', () => {
    const guard = functionBody('teacher_classroom_is_teacher', 'create_teacher_classroom')
    expect(guard).toContain("role.slug = 'teacher_pilot'")
    expect(guard).toContain("permission.permission = 'teacher.classrooms.manage'")
    expect(guard).toContain("membership.status = 'active'")
    expect(guard).toContain("institution.status IN ('pilot', 'active')")
    const removal = functionBody(
      'remove_pilot_institution_teacher',
      'get_my_pilot_institution',
    )
    expect(removal).toContain("role.slug = 'institution_pilot_staff'")
    expect(removal).not.toContain("role.slug IN ('teacher_pilot', 'institution_pilot_staff')")
  })

  it('keeps provisioning and membership writes owner/payload-bound and service-only', () => {
    for (const [name, next] of [
      ['provision_pilot_institution', 'add_pilot_institution_teacher'],
      ['add_pilot_institution_teacher', 'remove_pilot_institution_teacher'],
      ['remove_pilot_institution_teacher', 'get_my_pilot_institution'],
    ]) {
      const body = functionBody(name, next)
      expect(body).toContain('p_request_id')
      expect(body).toContain('payload_hash')
      expect(body).toContain('pg_advisory_xact_lock')
      expect(body).toContain("jsonb_build_object('replayed', true)")
    }
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role/)
    expect(sql).not.toMatch(/TO anon|TO authenticated/)
  })

  it('does not expose or introduce billing, attendance, contact or answer data', () => {
    const workspace = functionBody('get_my_pilot_institution', 'teacher_classroom_is_teacher')
    const executableSql = sql.replace(/--.*$/gm, '')
    expect(workspace).not.toMatch(/'email'|'phone'|'answer'|'selectedOption'|'correctOption'/)
    expect(executableSql).not.toMatch(/\b(payment|invoice|attendance|sms|whatsapp)\b/i)
  })
})
