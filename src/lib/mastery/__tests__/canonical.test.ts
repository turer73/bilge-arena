import { describe, expect, it } from 'vitest'
import { buildCanonicalMasteryResponse, canonicalPlanInputs, parseCanonicalMasteryContext } from '../canonical'
import { parseMasteryMapResponse } from '../public-contract'
import { parseReleasedMasteryScope, type ReleasedMasteryScope } from '../scope'

const scope: ReleasedMasteryScope = { game: 'turkce', displayExamRef: 'LGS', questionExamRef: 'LGS',
  taxonomyVersion: 'ba-lgs-turkce-v1', mappingMode: 'canonical_reviewed', diagnosticEnabled: false }
const canonicalId = 'meb-turkce@2019:grade8:LGS:T.8.3.25'
const alias1 = '00000000-0000-4000-8000-000000000001', alias2 = '00000000-0000-4000-8000-000000000002'
function raw() {
  return { format: 'canonical-mastery@1', game: 'turkce', examRef: 'LGS', taxonomyVersion: scope.taxonomyVersion,
    integrity: { total: 2, mapped: 2, unmapped: 0, scopeMismatch: 0, nodeOrphan: 0, outcomeOrphan: 0, primaryMismatch: 0, emptyOutcome: 0 },
    items: [{ canonicalId, programKey: 'meb-turkce', programEdition: '2019', grade: 8,
      officialCode: 'T.8.3.25', title: 'Kazanım',
      path: [{ nodeType: 'course', title: 'Türkçe' }, { nodeType: 'language_skill', title: 'Okuma' },
        { nodeType: 'outcome', title: 'Kazanım', officialCode: 'T.8.3.25' }],
      aliases: [{ id: alias1, code: 'ALIAS-1', category: 'dil_bilgisi' }, { id: alias2, code: 'ALIAS-2', category: 'paragraf' }] }],
    states: [{ outcome_id: canonicalId, attempts: 3, correct_attempts: 2, weighted_earned: 2, weighted_possible: 3,
      delayed_correct: 1, v2_attempts: 3, difficulty_weighted_earned: 4, difficulty_weighted_possible: 6,
      timed_attempts: 3, total_time_sec: 60, fast_wrong: 1, hinted_attempts: 1, hint_stage_sum: 2,
      guess_annotations: 1, careless_annotations: 0, verified_evidence_days: 2, last_answered_at: '2026-10-05T20:00:00Z' }] }
}
function context() {
  const value = parseCanonicalMasteryContext(raw(), scope)
  expect(value).not.toBeNull()
  return value!
}

describe('canonical mastery runtime', () => {
  it('only opts the explicit reviewed LGS/practice scope into the new reader', () => {
    expect(parseReleasedMasteryScope(scope)).toEqual(scope)
    expect(parseReleasedMasteryScope({ ...scope, displayExamRef: 'TYT' })).toBeNull()
    expect(parseReleasedMasteryScope({ ...scope, questionExamRef: null })).toBeNull()
    expect(parseReleasedMasteryScope({ ...scope, diagnosticEnabled: true })).toBeNull()
    expect(parseReleasedMasteryScope({ ...scope, taxonomyVersion: 'lgs-candidate@2' })).toBeNull()
  })
  it('renders one official leaf for two storage aliases and one discovery target', () => {
    const response = buildCanonicalMasteryResponse(context())!
    expect(response.outcomes).toHaveLength(1)
    expect(response.discovery).toMatchObject({ totalOutcomes: 1, evidenceTarget: 3, evidenceCollected: 2, diagnosticCompleted: false })
    expect(response.outcomes[0]).toMatchObject({ attempts: 3, verifiedEvidenceDays: 2, score: 0, status: 'insufficient' })
    expect(response.outcomes[0].path).toEqual(['LGS kazanım haritası', 'Türkçe', 'Okuma', 'Kazanım'])
    expect(JSON.stringify(response)).not.toContain(alias1)
    expect(JSON.stringify(response)).not.toContain('ALIAS-1')
    expect(parseMasteryMapResponse(response)).toEqual(response)
  })
  it('counts no absent or legacy aggregate as verified evidence', () => {
    const value = raw(); value.states = []
    const response = buildCanonicalMasteryResponse(parseCanonicalMasteryContext(value, scope)!)!
    expect(response.outcomes[0]).toMatchObject({ attempts: 0, verifiedEvidenceDays: 0, status: 'insufficient' })
  })
  it('supports official paths of different lengths without inventing bridge topics', () => {
    const value = raw(); value.items[0].path.splice(1, 1)
    const response = buildCanonicalMasteryResponse(parseCanonicalMasteryContext(value, scope)!)!
    expect(response.outcomes[0].path).toHaveLength(3)
    expect(parseMasteryMapResponse(response)).not.toBeNull()
    expect(parseMasteryMapResponse({ ...response, graphFormat: undefined })).toBeNull()
  })
  it('keeps multiple program roots distinct', () => {
    const value = raw(), second = structuredClone(value.items[0])
    second.programKey = 'meb-other'; second.canonicalId = second.canonicalId.replace('meb-turkce', 'meb-other')
    second.aliases = [{ id: '00000000-0000-4000-8000-000000000003', code: 'ALIAS-3', category: 'paragraf' }]
    value.items.push(second)
    const response = buildCanonicalMasteryResponse(parseCanonicalMasteryContext(value, scope)!)!
    expect(response.graph?.children).toHaveLength(2)
    expect(response.outcomes).toHaveLength(2)
  })
  it('normalizes plan targets, states and duplicate mappings before ranking', () => {
    const plan = canonicalPlanInputs(context(), [
      { questionId: 'q1', outcomeId: alias1 }, { questionId: 'q1', outcomeId: alias2 },
      { questionId: 'q2', outcomeId: alias2 }, { questionId: 'q3', outcomeId: 'foreign' },
    ], 'paragraf')
    expect(plan.outcomes).toEqual([{ id: canonicalId, code: canonicalId, category: 'paragraf', sortOrder: 0 }])
    expect(plan.outcomeStates).toHaveLength(1)
    expect(plan.outcomeStates[0]).toMatchObject({ attempts: 3, verifiedEvidenceDays: 2 })
    expect(plan.mappings).toEqual([{ questionId: 'q1', outcomeId: canonicalId }, { questionId: 'q2', outcomeId: canonicalId }])
  })
  const corruptions: Array<[string, (v: ReturnType<typeof raw>) => void]> = [
    ['other game', v => { v.game = 'fen' }], ['other exam', v => { v.examRef = 'TYT' }],
    ['stale taxonomy', v => { v.taxonomyVersion = 'old' }], ['unmapped scope', v => { v.integrity.unmapped = 1 }],
    ['no leaves', v => { v.items = [] }], ['duplicate canonical', v => { v.items.push(v.items[0]) }],
    ['duplicate alias', v => { v.items[0].aliases.push(v.items[0].aliases[0]) }],
    ['false official code', v => { v.items[0].officialCode = 'T.8.3.10' }],
    ['stale title', v => { v.items[0].title = 'Changed' }], ['storage bridge', v => { v.items[0].path[1].nodeType = 'internal_bridge' }],
    ['missing course', v => { v.items[0].path.shift() }], ['duplicate state', v => { v.states.push(v.states[0]) }],
    ['foreign state', v => { v.states[0].outcome_id = alias1 }], ['fractional count', v => { v.states[0].attempts = 3.5 }],
    ['inflated days', v => { v.states[0].verified_evidence_days = 4 }], ['inflated accuracy', v => { v.states[0].weighted_earned = 4 }],
    ['too many correct', v => { v.states[0].correct_attempts = 4 }], ['unverified aggregate', v => { v.states[0].v2_attempts = 2 }],
    ['inflated hints', v => { v.states[0].hint_stage_sum = 5 }], ['double annotation', v => { v.states[0].careless_annotations = 1 }],
  ]
  it.each(corruptions)('fails closed: %s', (_name, corrupt) => {
    const value = raw(); corrupt(value)
    expect(parseCanonicalMasteryContext(value, scope)).toBeNull()
  })
  it('does not relax legacy/public graph or diagnostic constraints', () => {
    const response = buildCanonicalMasteryResponse(context())!
    expect(parseMasteryMapResponse({ ...response, graphFormat: 'invented' })).toBeNull()
    expect(parseMasteryMapResponse({ ...response, examRef: 'TYT' })).toBeNull()
    expect(parseMasteryMapResponse({ ...response, coverage: { ...response.coverage, diagnosticAvailable: true } })).toBeNull()
    expect(parseMasteryMapResponse({ ...response, discovery: { ...response.discovery, diagnosticCompleted: true } })).toBeNull()
    response.outcomes[0].path.push('injected')
    expect(parseMasteryMapResponse(response)).toBeNull()
  })
})
