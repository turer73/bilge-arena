import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../migrations/122_institution_classroom_growth_metrics.sql', import.meta.url), 'utf8')

describe('institution classroom growth metrics migration', () => {
  it('uses adjacent mature windows and verified evidence thresholds', () => {
    expect(sql).toContain("p_window_end - interval '56 days'")
    expect(sql).toContain("p_window_end - interval '28 days'")
    expect(sql).toContain('baseline_evidence_count >= 6 AND baseline_attempt_count >= 3')
    expect(sql).toContain('current_evidence_count >= 6 AND current_attempt_count >= 3')
    expect(sql).toContain("outcome.taxonomy_version = 'ba-tyt-math-v1'")
  })

  it('excludes insufficient exposure and avoids a raw class average', () => {
    expect(sql).toContain('v_active_count - v_eligible_count')
    expect(sql).toContain('current_score >= baseline_score + 5')
    expect(sql).toContain('(baseline_score >= 80 AND current_score >= 80)')
    expect(sql).not.toContain('avg(current_score)')
  })

  it('keeps the tenant-scoped projection service-only', () => {
    expect(sql).toContain("membership.institution_id = v_classroom.institution_id")
    expect(sql).toContain("v_role = 'teacher' AND v_classroom.teacher_id <> p_user_id")
    expect(sql).toContain('TO service_role')
  })
})
