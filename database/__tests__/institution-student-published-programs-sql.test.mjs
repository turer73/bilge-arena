import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const sql=readFileSync(new URL('../migrations/119_institution_student_published_programs.sql',import.meta.url),'utf8')

describe('institution student published programs SQL',()=>{
  it('binds every program and membership row to the authenticated student',()=>{
    expect(sql).toContain('membership.student_id=p_user_id')
    expect(sql).toContain('program.student_id=p_user_id')
    expect(sql).toContain("membership.status='active'")
    expect(sql).toContain('NOT public.teacher_classroom_is_blocked')
  })
  it('never exposes drafts, internal ids or other weeks',()=>{
    expect(sql).toContain("program.status IN ('published','completed')")
    expect(sql).toContain('p_as_of_date>=program.week_start AND p_as_of_date<program.week_start+7')
    expect(sql).not.toMatch(/'programId'|'studentId'|'teacherId'|'membershipId'|'userId'/)
    expect(sql).toContain('teacher_classroom_safe_alias')
  })
  it('keeps the read function service-only',()=>{
    expect(sql).toContain('FROM PUBLIC,anon,authenticated,service_role')
    expect(sql).toContain('TO service_role')
  })
})
