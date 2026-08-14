import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../migrations/120_institution_student_followups.sql', import.meta.url), 'utf8')

describe('institution student follow-ups migration', () => {
  it('keeps support records behind RLS and service-role RPCs', () => {
    expect(sql).toContain('ALTER TABLE public.institution_student_followups ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL ON TABLE public.institution_student_followups')
    expect(sql).toContain('public.open_institution_student_followup(uuid, uuid, text, text, text, uuid)')
    expect(sql).toContain('public.resolve_institution_student_followup(uuid, text, uuid)')
    expect(sql).toContain('TO service_role')
  })

  it('limits mutations to the assigned teacher and active unblocked member', () => {
    expect(sql).toContain("WHERE id = p_classroom_id AND teacher_id = p_user_id AND status = 'active'")
    expect(sql).toContain("membership.status = 'active'")
    expect(sql).toContain('public.teacher_classroom_is_blocked(p_user_id, v_membership.student_id)')
    expect(sql).toContain('institution_student_followups_one_open_reason')
    expect(sql).toContain('pilot_institution_requests')
  })

  it('returns identifier-minimal, tenant-scoped aggregate evidence', () => {
    expect(sql).toContain('get_institution_classroom_followup_metrics')
    expect(sql).toContain("followup.institution_id = v_classroom.institution_id")
    expect(sql).toContain("p_window_end - interval '14 days'")
    expect(sql).toContain("'followedMemberRefs', v_followed_refs")
    expect(sql).toContain("'timelyInterventionCount', v_timely_count")
    expect(sql).not.toContain("'studentId',")
  })
})
