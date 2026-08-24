import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/149_institution_critical_operation_audit.sql', import.meta.url),
  'utf8',
)

describe('institution critical operation audit migration', () => {
  it.each([
    'issue_invite', 'revoke_invite', 'publish_assignment', 'submit_assignment',
    'set_bilge_tahta', 'set_exam_mode', 'create_study_program_draft',
    'update_study_program_draft', 'publish_study_program', 'review_study_program',
    'open_student_followup', 'resolve_student_followup', 'create_student_report',
    'grant_support_access', 'revoke_support_access',
  ])('maps %s to an immutable audit event', (operation) => {
    expect(sql).toContain(`WHEN '${operation}' THEN`)
  })

  it('keeps audit trigger functions unavailable to browser roles', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.audit_pilot_institution_request\(\) FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.audit_teacher_classroom_request\(\) FROM PUBLIC, anon, authenticated/)
  })
})
