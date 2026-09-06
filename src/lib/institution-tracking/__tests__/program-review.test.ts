import { describe, expect, it } from 'vitest'
import {
  institutionProgramReviewEvidenceSchema,
  institutionProgramReviewMutationSchema,
  institutionStudentProgramHistorySchema,
} from '../program-review'

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

describe('review and program completion are independent facts',()=>{
  const scope={game:'matematik',examRef:'TYT',questionExamRef:'TYT',taxonomyVersion:'ba-tyt-math-v1',scopePolicyVersion:'institution-scope-v1'}
  const review={reviewRef:'c'.repeat(32),teacherResult:'insufficient',systemSuggestion:'insufficient',evidence,note:null,reviewedAt:'2026-08-18T10:00:00.000Z'}
  const program={programRef:'b'.repeat(32),scope,status:'published',weekStart:'2026-08-03',itemCount:4,publishedAt:'2026-08-03T09:00:00.000Z',reviewEligible:true,review}

  it('accepts an observed review with still-pending work',()=>{
    expect(institutionStudentProgramHistorySchema.safeParse({scope,programs:[program]}).success).toBe(true)
  })
  it('still rejects completed programs with no teacher review',()=>{
    expect(institutionStudentProgramHistorySchema.safeParse({scope,programs:[{...program,status:'completed',review:null}]}).success).toBe(false)
  })
  it('validates authoritative status without upgrading historical replay responses',()=>{
    expect(institutionProgramReviewMutationSchema.parse({...review,replayed:true}).programStatus).toBeUndefined()
    expect(institutionProgramReviewMutationSchema.parse({...review,replayed:false,programStatus:'published'}).programStatus).toBe('published')
    expect(institutionProgramReviewMutationSchema.safeParse({...review,replayed:false,programStatus:'draft'}).success).toBe(false)
  })
})
