import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '132_institution_platform_role_separation.sql'),
  'utf8',
)

function functionBody(name, nextName) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  const end = nextName
    ? sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nextName}`, start + 1)
    : sql.indexOf("NOTIFY pgrst, 'reload schema'", start + 1)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('132 institution/platform role separation SQL contract', () => {
  it('gives institution staff classroom access without an admin entry permission', () => {
    expect(sql).toMatch(/role\.slug = 'institution_pilot_staff'[\s\S]+teacher\.classrooms\.manage/)
    expect(sql).not.toContain("SELECT role.id, 'admin.")
  })

  it('stops automatic teacher_pilot assignment for managers and teachers', () => {
    for (const [name, next] of [
      ['provision_pilot_institution', 'add_pilot_institution_teacher'],
      ['add_pilot_institution_teacher', 'teacher_classroom_is_teacher'],
    ]) {
      const body = functionBody(name, next)
      expect(body).toContain("role.slug = 'institution_pilot_staff'")
      expect(body).not.toContain("role.slug IN ('teacher_pilot', 'institution_pilot_staff')")
    }
  })

  it('moves the classroom guard to the institution role and cleans the legacy coupling', () => {
    const guard = functionBody('teacher_classroom_is_teacher', null)
    expect(guard).toContain("role.slug = 'institution_pilot_staff'")
    expect(guard).toContain("permission.permission = 'teacher.classrooms.manage'")
    expect(sql).toMatch(/DELETE FROM public\.user_roles[\s\S]+role\.slug = 'teacher_pilot'/)
    expect(sql).toMatch(/membership\.status = 'active'[\s\S]+institution_role\.slug = 'institution_pilot_staff'/)
  })
})
