import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '114_institution_student_learning_analysis.sql'),
  'utf8',
)

describe('114 institution student learning analysis SQL contract', () => {
  it('is a read-only, service-only SECURITY DEFINER projection', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_institution_student_learning_analysis')
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path = pg_catalog/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role/)
    expect(sql).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\b/i)
  })

  it('requires active same-tenant manager or owning teacher access', () => {
    expect(sql).toMatch(/membership\.institution_id = v_classroom\.institution_id/)
    expect(sql).toContain("membership.status = 'active'")
    expect(sql).toContain("membership.role IN ('manager', 'teacher')")
    expect(sql).toContain("v_staff_role = 'teacher' AND v_classroom.teacher_id <> p_user_id")
    expect(sql).toContain('auth.uid() IS DISTINCT FROM p_user_id')
  })

  it('excludes all evidence before active membership acceptance', () => {
    expect(sql).toContain("membership.status = 'active'")
    expect(sql).toContain('answer.answered_at >= v_membership.accepted_at')
    expect(sql).toContain('answer.answered_at < p_window_end')
    expect(sql).toContain("'windowStart', v_membership.accepted_at")
  })

  it('uses only verified idempotent mastery evidence and decision-safe taxonomy coverage', () => {
    expect(sql).toContain('public.mastery_outcome_evidence')
    expect(sql).toContain('count(DISTINCT eligible.attempt_id)')
    expect(sql).toContain('public.curriculum_graph_integrity()')
    expect(sql).toContain("'ba-tyt-math-v1'")
    expect(sql).toContain('curriculum coverage is not decision-safe')
    expect(sql).toContain('v_mapped <> v_total')
  })

  it('returns opaque membership and aggregate evidence without raw answer identifiers', () => {
    const returnBody = sql.slice(sql.indexOf('RETURN jsonb_build_object('))
    expect(returnBody).toContain("'memberRef'")
    expect(returnBody).toContain("'alias'")
    expect(sql).toContain("'attempts'")
    expect(sql).toContain("'independentAttempts'")
    expect(returnBody).not.toMatch(/'userId'|'studentId'|'answerId'|'questionId'|'sessionId'|'attemptId'|'selectedOption'|'correctOption'/)
  })
})
