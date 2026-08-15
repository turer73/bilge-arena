import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '127_classroom_exam_mode.sql'),
  'utf8',
)

function body(name, next) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  const end = sql.indexOf(next, start + 1)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('127 classroom exam mode SQL contract', () => {
  it('stores state as an expiry instant so the mode cannot stay stuck open', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS exam_mode_expires_at timestamptz/)
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS exam_mode boolean/)
  })

  it('reads the policy per identity, not per screen, and covers every helper', () => {
    const read = body(
      'get_my_assistance_policy',
      'CREATE OR REPLACE FUNCTION public.set_teacher_classroom_exam_mode',
    )
    // Ekran degil kimlik: ogrencinin HERHANGI bir aktif sinifi yeterli.
    expect(read).toMatch(/membership\.student_id = p_user_id[\s\S]+membership\.status = 'active'/)
    expect(read).toContain("classroom.status = 'active'")
    expect(read).toContain('profile.deleted_at IS NULL')
    expect(read).toContain('classroom.exam_mode_expires_at > now()')
    // Sinav modunda uc yardimcinin ucu birden kapanir.
    expect(read).toContain("'board', v_until IS NULL")
    expect(read).toContain("'coach', v_until IS NULL")
    expect(read).toContain("'assistant', v_until IS NULL")
    expect(read).toContain('assistance actor mismatch')
  })

  it('allows only the owning active-institution teacher to toggle the mode', () => {
    const update = body('set_teacher_classroom_exam_mode', 'REVOKE ALL ON FUNCTION')
    expect(update).toContain('teacher_classroom_is_teacher(p_user_id)')
    expect(update).toContain('institution_pilot_active_institution(p_user_id)')
    expect(update).toMatch(/teacher_id = p_user_id[\s\S]+institution_id = v_institution_id[\s\S]+status = 'active'/)
    expect(update).toContain("operation = 'set_exam_mode'")
    expect(update).toContain('pg_advisory_xact_lock')
    expect(update).toContain('exam mode request payload mismatch')
  })

  it('bounds an open exam window and clears it on close', () => {
    const update = body('set_teacher_classroom_exam_mode', 'REVOKE ALL ON FUNCTION')
    expect(update).toMatch(/c_max_window constant interval := interval '4 hours'/)
    expect(update).toMatch(/CASE WHEN p_enabled THEN now\(\) \+ c_max_window ELSE now\(\) END/)
  })

  it('exposes both functions only to service_role with fixed search paths', () => {
    expect(sql.match(/SECURITY DEFINER\s+SET search_path = pg_catalog/g)).toHaveLength(2)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role/)
  })
})
