import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const sql = readFileSync(new URL('../migrations/118_institution_study_program_draft_updates.sql', import.meta.url), 'utf8')

describe('institution study program draft update SQL', () => {
  it('permits only the owning teacher to edit an unpublished matching week', () => {
    expect(sql).toContain('program_ref=p_program_ref AND teacher_id=p_user_id FOR UPDATE')
    expect(sql).toContain("v_program.status<>'draft' OR v_program.week_start<>p_week_start")
    expect(sql).toContain("RAISE EXCEPTION 'only the matching draft program can be updated'")
  })
  it('replaces items atomically with bounded contiguous and identifier-minimal input', () => {
    expect(sql).toContain('DELETE FROM public.institution_study_program_items WHERE program_id=v_program.id')
    expect(sql).toContain("(value->>'position')::integer<>ordinal")
    expect(sql).toContain("value ?| ARRAY['studentId','userId','answerId','questionId']")
    expect(sql).toContain("operation='update_study_program_draft'")
    expect(sql).toContain('institution_pilot_payload_hash')
  })
  it('keeps the mutation service-only', () => {
    expect(sql).toContain('FROM PUBLIC,anon,authenticated,service_role')
    expect(sql).toContain('TO service_role')
  })
})
