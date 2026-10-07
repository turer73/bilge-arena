import { describe, expect, it } from 'vitest'
import { assessSocialPilotReadiness } from '../social-pilot-readiness'
import { SOCIAL_PILOT_CATEGORIES } from '../social-pilot'
import { SOURCE_COMPARISON_VERSION } from '../../question-audit/source-comparison'

function fixture() {
  const rows = SOCIAL_PILOT_CATEGORIES.flatMap(category => [1, 2, 3, 3, 4, 5].map((difficulty, i) => ({
    id: `11111111-1111-4111-8111-${String(SOCIAL_PILOT_CATEGORIES.indexOf(category) * 6 + i).padStart(12, '0')}`,
    published_revision_id: `22222222-2222-4222-8222-${String(SOCIAL_PILOT_CATEGORIES.indexOf(category) * 6 + i).padStart(12, '0')}`,
    content_sha256: (SOCIAL_PILOT_CATEGORIES.indexOf(category) * 6 + i + 1).toString(16).padStart(64, '0'),
    game: 'sosyal', exam_ref: 'TYT', category, difficulty,
    content: { question: 'TEST FIXTURE', options: ['A', 'B', 'C', 'D', 'E'], answer: 0, solution: 'TEST FIXTURE' },
  })))
  return { rows, currentRows: rows.map(row => ({ ...structuredClone(row), is_active: true })), reviews: {} }
}

// Deliberately fictional evidence, confined to tests. Never used by the CLI.
function review(row: ReturnType<typeof fixture>['rows'][number]) {
  return {
    format: SOURCE_COMPARISON_VERSION, questionId: row.id, revisionId: row.published_revision_id,
    contentSha256: row.content_sha256,
    sources: [0, 1].map(i => ({ id: `s${i}`, title: 'TEST FIXTURE', institutionOrAuthor: `Fixture ${i}`,
      editionOrDate: '2026', language: 'tr', kind: i === 0 ? 'official_curriculum' : 'textbook',
      url: `https://example.org/fixture-${i}`, workId: `fixture-${i}`, independenceGroup: `fixture-${i}`,
      independenceRationale: 'TEST ONLY', access: 'inspected_section', locator: 'TEST ONLY',
      accessedAt: '2026-09-29T00:00:00Z', retrievalRef: `fixture-${i}`, retrievedTextSha256: String(i + 1).repeat(64),
      license: { code: 'UNKNOWN', url: null, checked: false, usage: 'reference_only' } })),
    claims: ['stem', 'solution', 'curriculum', 'option0', 'option1', 'option2', 'option3', 'option4'].map(target => ({
      id: target, target: target.startsWith('option') ? 'option' : target,
      optionIndex: target.startsWith('option') ? Number(target.at(-1)) : null,
      statement: 'TEST ONLY', reasoningSummary: 'TEST ONLY',
      evidence: [0, 1].map(i => ({ sourceId: `s${i}`, relation: 'supports', locator: 'TEST ONLY',
        scopeMatch: true, scopeNote: 'TEST ONLY', explanation: 'TEST ONLY' })) })),
    optionChecks: row.content.options.map((_, index) => ({ index, assessment: index === 0 ? 'supported' : 'excluded',
      claimIds: [`option${index}`], explanation: 'TEST ONLY' })),
    examComparison: { status: 'not_found', sourceIds: [], reference: null, comparison: 'TEST ONLY',
      optionOrderChecked: false, answerKeyTransfer: false }, terminology: [], limitations: ['TEST ONLY'],
  }
}

describe('social pilot preflight', () => {
  it('accepts complete declarations but never calls them publication or runtime approval', () => {
    const input = fixture()
    input.reviews = Object.fromEntries(input.rows.map(row => [row.id, review(row)]))
    expect(assessSocialPilotReadiness(input)).toMatchObject({ sourcePackageComplete: true,
      totals: { evidence_complete: 24 }, runtimeEnabled: false, publicationAuthorized: false })
  })
  it('re-evaluates stale and contradictory reports without discarding the other 22 results', () => {
    const input = fixture()
    const reviews = Object.fromEntries(input.rows.map(row => [row.id, review(row)]))
    reviews[input.rows[0].id].contentSha256 = 'f'.repeat(64)
    reviews[input.rows[1].id].claims[0].evidence[0].relation = 'contradicts'
    input.reviews = reviews
    expect(assessSocialPilotReadiness(input)).toMatchObject({ sourcePackageComplete: false,
      totals: { revision_mismatch: 1, conflicting_evidence: 1, evidence_complete: 22 } })
  })
  it('reports every missing review and never enables runtime or grants publication', () => {
    const result = assessSocialPilotReadiness(fixture())
    expect(result).toMatchObject({ candidateCount: 24, totals: { missing: 24 },
      sourcePackageComplete: false, runtimeEnabled: false, publicationAuthorized: false })
  })
  it.each(['published_revision_id', 'content_sha256', 'content', 'category', 'difficulty', 'exam_ref', 'game'])('blocks fresh %s drift before trusting a report', field => {
    const input = fixture()
    Object.assign(input.currentRows[0], { [field]: field === 'content' ? { question: 'Changed' } : field === 'difficulty' ? 5 : 'changed' })
    expect(assessSocialPilotReadiness(input).results[0].status).toBe('current_revision_mismatch')
  })
  it('requires an explicit active current row', () => {
    const input = fixture(); input.currentRows[0].is_active = false
    expect(assessSocialPilotReadiness(input).results[0].status).toBe('inactive')
    input.currentRows.shift()
    expect(assessSocialPilotReadiness(input).results[0].status).toBe('current_question_missing')
  })
  it('rejects duplicate fresh rows instead of last-write-wins', () => {
    const input = fixture(); input.currentRows.push(input.currentRows[0])
    expect(() => assessSocialPilotReadiness(input)).toThrow('Duplicate current question')
  })
  it('does not accept a claimed APPROVED summary or malformed report', () => {
    const input = fixture()
    input.reviews = { [input.rows[0].id]: { status: 'evidence_complete', approved: true }, [input.rows[1].id]: null }
    expect(assessSocialPilotReadiness(input).totals).toEqual({ invalid: 2, missing: 22 })
  })
  it('reports unexpected review IDs', () => {
    const input = fixture(); input.reviews = { unrelated: {} }
    expect(assessSocialPilotReadiness(input).unexpectedReviewIds).toEqual(['unrelated'])
  })
  it('compares JSON content structurally rather than key order', () => {
    const input = fixture()
    const row = input.currentRows[0]
    row.content = { solution: 'TEST FIXTURE', answer: 0, options: ['A', 'B', 'C', 'D', 'E'], question: 'TEST FIXTURE' }
    expect(assessSocialPilotReadiness(input).results[0].status).toBe('missing')
  })
})
