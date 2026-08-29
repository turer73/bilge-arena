import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '143_question_revision_psychometrics_v3.sql'),
  'utf8',
)

describe('143 conservative question psychometrics contract', () => {
  it('binds verified rows to the same user and normalizes the rest score', () => {
    expect(sql).toMatch(/attempt\.user_id=a\.user_id/)
    expect(sql).toMatch(/session\.user_id=a\.user_id/)
    expect(sql).toMatch(/session\.correct_count-\(a\.is_correct\)::int[\s\S]+session\.total_questions-1/)
  })

  it('uses first question exposure across revisions and diagnostic history', () => {
    expect(sql).toMatch(/earlier\.question_id=a\.question_id/)
    expect(sql).not.toMatch(/earlier\.question_revision_id=a\.question_revision_id/)
    expect(sql).toMatch(/FROM public\.adaptive_diagnostic_answers diagnostic/)
  })

  it('does not promote client time to verified eligibility evidence', () => {
    expect(sql).toContain('no_timing_normalized_rest_v3')
    expect(sql).not.toMatch(/time_taken_sec\s+BETWEEN/)
    expect(sql).toMatch(/median_response_time_sec=NULL,fast_response_rate=NULL/)
  })

  it('validates option JSON before generating option rows', () => {
    expect(sql).toMatch(/jsonb_typeof\(v_content->'options'\)/)
    expect(sql).toMatch(/jsonb_array_length\(v_content->'options'\) NOT BETWEEN 2 AND 10/)
    expect(sql).toMatch(/v_correct_option NOT BETWEEN 0 AND v_option_count-1/)
  })
})
