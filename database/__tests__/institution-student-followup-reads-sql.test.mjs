import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../migrations/121_institution_student_followup_reads.sql', import.meta.url), 'utf8')

describe('institution student follow-up reads migration', () => {
  it('limits history to the assigned active teacher and opaque student membership', () => {
    expect(sql).toContain("WHERE id = p_classroom_id AND teacher_id = p_user_id AND status = 'active'")
    expect(sql).toContain('membership.member_ref = p_member_ref')
    expect(sql).toContain('public.teacher_classroom_is_blocked(p_user_id, v_membership.student_id)')
    expect(sql).toContain('LIMIT 20')
    expect(sql).toContain('TO service_role')
  })
})
