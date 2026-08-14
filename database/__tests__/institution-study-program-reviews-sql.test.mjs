import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql=readFileSync(new URL('../migrations/123_institution_study_program_reviews.sql',import.meta.url),'utf8')

describe('institution study program reviews migration',()=>{
  it('stores an immutable teacher result with server-computed evidence',()=>{
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.institution_study_program_reviews')
    expect(sql).toContain('v_evidence:=public.institution_study_program_review_evidence(v_program.id)')
    expect(sql).toContain("SET status='completed',completed_at=clock_timestamp()")
    expect(sql).not.toContain('UPDATE public.institution_study_program_reviews')
  })
  it('uses comparable windows and minimum outcome evidence',()=>{
    expect(sql).toContain("v_program.week_start - 14")
    expect(sql).toContain("v_program.week_start + 14")
    expect(sql).toContain('baseline_evidence >= 3 AND baseline_attempts >= 2')
    expect(sql).toContain('current_evidence >= 3 AND current_attempts >= 2')
    expect(sql).toContain("WHEN v_assessed = 0 THEN 'insufficient'")
  })
  it('keeps writes assigned-teacher only, idempotent and service-only',()=>{
    expect(sql).toContain("WHERE program_ref=p_program_ref AND teacher_id=p_user_id AND status='published'")
    expect(sql).toContain("operation='review_study_program'")
    expect(sql).toContain('TO service_role')
    expect(sql).toContain('ALTER TABLE public.institution_study_program_reviews ENABLE ROW LEVEL SECURITY')
  })
})
