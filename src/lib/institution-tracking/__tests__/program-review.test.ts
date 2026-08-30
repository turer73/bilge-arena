import { describe, expect, it } from 'vitest'
import { institutionProgramReviewEvidenceSchema } from '../program-review'

const evidence = {
  modelVersion: 'institution-program-review-v2',
  baselineWindowStart: '2026-08-03T00:00:00.000Z',
  baselineWindowEnd: '2026-08-03T00:00:00.000Z',
  currentWindowStart: '2026-08-03T00:00:00.000Z',
  currentWindowEnd: '2026-08-17T00:00:00.000Z',
  targetedOutcomeCount: 1,
  assessedOutcomeCount: 0,
  improvedOutcomeCount: 0,
  declinedOutcomeCount: 0,
  insufficientOutcomeCount: 1,
  systemSuggestion: 'insufficient',
  causalClaim: false,
} as const

describe('institution program review evidence', () => {
  it('accepts an honest zero-length baseline after late membership acceptance', () => {
    expect(institutionProgramReviewEvidenceSchema.safeParse(evidence).success).toBe(true)
  })

  it('rejects overlapping or reversed observation windows', () => {
    expect(institutionProgramReviewEvidenceSchema.safeParse({
      ...evidence,
      currentWindowStart: '2026-08-02T00:00:00.000Z',
    }).success).toBe(false)
    expect(institutionProgramReviewEvidenceSchema.safeParse({
      ...evidence,
      baselineWindowStart: '2026-08-04T00:00:00.000Z',
    }).success).toBe(false)
  })
})
