import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '113_classroom_bilge_tahta_controls.sql'),
  'utf8',
)

function body(name, next) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  const end = sql.indexOf(next, start + 1)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('113 classroom Bilge Tahta controls SQL contract', () => {
  it('adds a closed-by-default class setting', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS bilge_tahta_enabled boolean NOT NULL DEFAULT false/)
  })

  it('allows only the owning active-institution teacher to change the setting', () => {
    const update = body('set_teacher_classroom_bilge_tahta', 'REVOKE ALL ON FUNCTION')
    expect(update).toContain('teacher_classroom_is_teacher(p_user_id)')
    expect(update).toContain('institution_pilot_active_institution(p_user_id)')
    expect(update).toMatch(/teacher_id = p_user_id[\s\S]+institution_id = v_institution_id[\s\S]+status = 'active'/)
    expect(update).toContain("operation = 'set_bilge_tahta'")
    expect(update).toContain('pg_advisory_xact_lock')
    expect(update).toContain('Bilge Tahta request payload mismatch')
  })

  it('limits reads to the tenant owner or an active non-blocked student member', () => {
    const read = body(
      'get_my_classroom_bilge_tahta_access',
      'CREATE OR REPLACE FUNCTION public.set_teacher_classroom_bilge_tahta',
    )
    expect(read).toContain('institution_pilot_active_institution(p_user_id)')
    expect(read).toMatch(/institution_id = p_institution_id/)
    expect(read).toMatch(/membership\.student_id = p_user_id[\s\S]+membership\.status = 'active'/)
    expect(read).toContain('profile.deleted_at IS NULL')
    expect(read).toContain('institution_pilot_has_role')
    expect(read).toContain('teacher_classroom_is_blocked')
    expect(read).toContain("RAISE EXCEPTION 'classroom not found'")
  })

  it('exposes both functions only to service_role with fixed search paths', () => {
    expect(sql.match(/SECURITY DEFINER\s+SET search_path = pg_catalog/g)).toHaveLength(2)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role/)
  })
})
