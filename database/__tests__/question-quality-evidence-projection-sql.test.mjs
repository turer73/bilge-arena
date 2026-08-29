import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '141_question_quality_evidence_projection.sql'),
  'utf8',
)

describe('141 revision-centred quality evidence projection', () => {
  it('projects psychometric provenance instead of an unlabeled score', () => {
    for (const field of [
      "'omittedN'", "'medianResponseTimeSec'", "'fastResponseRate'", "'eligibilityPolicy'",
    ]) expect(sql).toContain(field)
  })

  it('makes latest option statistics available only through the governed detail RPC', () => {
    expect(sql).toContain("'optionStatistics'")
    expect(sql).toMatch(/FROM public\.question_option_statistics option_stat/)
    expect(sql).toMatch(/ORDER BY latest\.window_end DESC/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_question_content_revision/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_question_content_revision[\s\S]+TO service_role/)
  })

  it('aggregates revision-bound student signals without exposing learner or evidence ids', () => {
    expect(sql).toContain("'appealSignals'")
    expect(sql).toContain("'verifiedOpenCount'")
    expect(sql).toMatch(/appeal\.revision_id=r\.id/)
    expect(sql).toMatch(/appeal\.evidence_kind IN \('verified_session','issued_attempt'\)/)
    expect(sql).not.toMatch(/'userId'|'attemptId'|'sessionAnswerId'/)
  })
})
