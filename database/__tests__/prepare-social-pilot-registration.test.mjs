import { describe, expect, it } from 'vitest'
import { renderSocialPilotDraft } from '../prepare-social-pilot-registration.mjs'
const fixture = () => ({ packId: '11111111-1111-4111-8111-111111111111', version: 'fixture-only',
  sourcePackageSha256: 'a'.repeat(64), preflight: { candidateCount: 24, sourcePackageComplete: false,
    unexpectedReviewIds: [], results: Array.from({ length: 24 }, (_, i) => ({
      questionId: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
      revisionId: `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`,
      contentSha256: (i + 1).toString(16).padStart(64, '0'), status: 'conflicting_evidence',
    })) } })
describe('offline Social registration draft', () => {
  it('never releases or fabricates acceptance even when source findings exist', () => {
    const sql = renderSocialPilotDraft(fixture())
    expect(sql).toContain('Source gate complete: false')
    expect(sql).toContain('validate_social_discovery_pack')
    expect(sql).not.toMatch(/UPDATE|accepted_by|accepted_at|status.*released|answer|solution/i)
  })
  it.each(['missing', 'invalid', 'inactive', 'current_revision_mismatch'])('refuses %s inputs', status => {
    const input = fixture(); input.preflight.results[0].status = status
    expect(() => renderSocialPilotDraft(input)).toThrow('24 current pinned')
  })
  it('refuses duplicate pins and SQL metacharacters', () => {
    const input = fixture(); input.preflight.results[1] = input.preflight.results[0]
    expect(() => renderSocialPilotDraft(input)).toThrow()
    expect(() => renderSocialPilotDraft({ ...fixture(), version: "bad';DROP TABLE profiles;--" })).toThrow()
  })
})
