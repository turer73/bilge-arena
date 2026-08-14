import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../migrations/117_institution_classroom_program_coverage.sql', import.meta.url), 'utf8')

describe('institution classroom program coverage SQL', () => {
  it('is read-only, service-only and tenant scoped', () => {
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain('SET search_path = pg_catalog')
    expect(sql).toContain("membership.institution_id=v_classroom.institution_id")
    expect(sql).toContain("v_role='teacher' AND v_classroom.teacher_id<>p_user_id")
    expect(sql).toContain('FROM PUBLIC,anon,authenticated,service_role')
    expect(sql).toContain('TO service_role')
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b(?=\s+(?:INTO|public\.|FROM))/i)
  })

  it('returns only active, unblocked opaque members with published programs in the window', () => {
    expect(sql).toContain("program.status IN ('published','completed')")
    expect(sql).toContain('program.published_at>=p_window_start AND program.published_at<p_window_end')
    expect(sql).toContain("membership.status='active'")
    expect(sql).toContain('NOT public.teacher_classroom_is_blocked')
    expect(sql).toContain("jsonb_build_object('memberRefs',v_refs)")
    expect(sql).not.toMatch(/studentAlias|studentId|userId|email|phone/i)
  })
})
