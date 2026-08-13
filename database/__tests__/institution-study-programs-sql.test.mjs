import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../migrations/116_institution_study_programs.sql', import.meta.url), 'utf8')

describe('institution study program SQL boundary', () => {
  it('keeps program tables private and mutations service-only', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(sql).toContain('TO service_role')
    expect(sql).toContain('SECURITY DEFINER SET search_path = pg_catalog')
  })

  it('requires the assigned teacher and a distinct publish transition', () => {
    expect(sql).toContain("teacher_id = p_user_id AND status = 'active'")
    expect(sql).toContain("ARRAY['manager','teacher']::text[]")
    expect(sql).toContain("IF v_program.status <> 'draft'")
    expect(sql).toContain("SET status='published',reviewed_at=clock_timestamp(),published_at=clock_timestamp()")
  })

  it('enforces idempotency, opaque refs and bounded weekly items', () => {
    expect(sql).toContain('institution_pilot_payload_hash')
    expect(sql).toContain("operation = 'create_study_program_draft'")
    expect(sql).toContain("operation='publish_study_program'")
    expect(sql).toContain("program_ref ~ '^[0-9a-f]{32}$'")
    expect(sql).toContain('jsonb_array_length(p_items) NOT BETWEEN 1 AND 21')
    expect(sql).toContain("value ?| ARRAY['studentId','userId','answerId','questionId']")
  })
})
