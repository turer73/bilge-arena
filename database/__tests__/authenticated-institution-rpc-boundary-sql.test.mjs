import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/150_authenticated_institution_rpc_boundary.sql', import.meta.url),
  'utf8',
)

describe('authenticated institution RPC boundary', () => {
  it('fails migration if an allowlisted RPC lacks auth.uid actor binding', () => {
    expect(sql).toContain("position('auth.uid()' IN v_proc.prosrc) = 0")
    expect(sql).toContain("RAISE EXCEPTION 'RPC lacks auth.uid actor binding")
  })

  it('grants only the authenticated browser role and keeps anon/public revoked', () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION %s TO authenticated")
  })

  it.each([
    'get_my_pilot_institution',
    'create_my_institution_classroom',
    'set_teacher_classroom_exam_mode',
    'create_institution_student_report',
  ])('explicitly allowlists %s', (name) => expect(sql).toContain(`'${name}'`))
})
