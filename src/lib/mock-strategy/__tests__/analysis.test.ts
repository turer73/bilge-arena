import { describe, expect, it } from 'vitest'
import { buildMockStrategyAnalysis, type MockStrategyEvidence } from '../analysis'

const base = Date.parse('2026-08-08T10:00:00.000Z')
const iso = (seconds: number) => new Date(base + seconds * 1_000).toISOString()

function evidence(items: MockStrategyEvidence['items'], plannedCount = 6): MockStrategyEvidence {
  return {
    plannedCount,
    startedAt: iso(0),
    deadlineAt: iso(600),
    items,
  }
}

describe('buildMockStrategyAnalysis', () => {
  it('uses only bounded server-receipt intervals and builds ordered segments', () => {
    const result = buildMockStrategyAnalysis(evidence([
      { position: 0, answered: true, isCorrect: false, isSkipped: false, openedAt: iso(5), submittedAt: iso(15) },
      { position: 1, answered: true, isCorrect: true, isSkipped: false, openedAt: iso(20), submittedAt: iso(50) },
      { position: 2, answered: true, isCorrect: true, isSkipped: false, openedAt: iso(60), submittedAt: iso(160) },
      { position: 3, answered: true, isCorrect: false, isSkipped: true, openedAt: iso(170), submittedAt: iso(175) },
      { position: 4, answered: true, isCorrect: true, isSkipped: false, openedAt: null, submittedAt: iso(200) },
    ]))

    expect(result).toMatchObject({
      basis: 'server_receipt_approximate',
      unanswered: 1,
      unknownTiming: 1,
      rushedWrong: 1,
      stuck: 1,
      recommendations: ['check_fast_answers', 'set_first_pass_limit', 'reserve_final_pass'],
    })
    expect(result?.segments).toEqual([
      { key: 'opening', planned: 2, answered: 2, correct: 1, averageSeconds: 20, unknownTiming: 0 },
      { key: 'middle', planned: 2, answered: 2, correct: 1, averageSeconds: 52.5, unknownTiming: 0 },
      { key: 'closing', planned: 2, answered: 1, correct: 1, averageSeconds: null, unknownTiming: 1 },
    ])
  })

  it('does not turn missing or invalid timing evidence into zero seconds', () => {
    const result = buildMockStrategyAnalysis(evidence([
      { position: 0, answered: true, isCorrect: false, isSkipped: false, openedAt: iso(30), submittedAt: iso(20) },
      { position: 1, answered: true, isCorrect: true, isSkipped: false, openedAt: iso(590), submittedAt: iso(610) },
    ], 2))

    expect(result?.unknownTiming).toBe(2)
    expect(result?.rushedWrong).toBe(0)
    expect(result?.segments[0].averageSeconds).toBeNull()
    expect(result?.recommendations).toContain('timing_evidence_incomplete')
  })

  it('fails closed on duplicate/out-of-range positions and inconsistent answer flags', () => {
    const valid = { position: 0, answered: true, isCorrect: true, isSkipped: false, openedAt: iso(1), submittedAt: iso(2) }
    expect(buildMockStrategyAnalysis(evidence([valid, valid], 2))).toBeNull()
    expect(buildMockStrategyAnalysis(evidence([{ ...valid, position: 2 }], 2))).toBeNull()
    expect(buildMockStrategyAnalysis(evidence([{ ...valid, answered: false }], 2))).toBeNull()
  })

  it('recommends preserving pace when no warning signal exists', () => {
    const result = buildMockStrategyAnalysis(evidence([
      { position: 0, answered: true, isCorrect: true, isSkipped: false, openedAt: iso(1), submittedAt: iso(31) },
      { position: 1, answered: true, isCorrect: true, isSkipped: false, openedAt: iso(32), submittedAt: iso(72) },
      { position: 2, answered: true, isCorrect: true, isSkipped: false, openedAt: iso(73), submittedAt: iso(123) },
    ], 3))
    expect(result?.recommendations).toEqual(['keep_pace'])
  })
})
