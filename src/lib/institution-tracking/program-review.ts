import { z } from 'zod'

const refSchema=z.string().regex(/^[0-9a-f]{32}$/)
const timestampSchema=z.string().datetime({offset:true})
const dateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const institutionProgramReviewResultSchema=z.enum(['effective','partial','ineffective','insufficient'])

export const institutionProgramReviewEvidenceSchema=z.object({
  modelVersion:z.literal('institution-program-review-v1'),
  baselineWindowStart:timestampSchema,baselineWindowEnd:timestampSchema,
  currentWindowStart:timestampSchema,currentWindowEnd:timestampSchema,
  targetedOutcomeCount:z.number().int().min(0).max(21),
  assessedOutcomeCount:z.number().int().min(0).max(21),
  improvedOutcomeCount:z.number().int().min(0).max(21),
  declinedOutcomeCount:z.number().int().min(0).max(21),
  insufficientOutcomeCount:z.number().int().min(0).max(21),
  systemSuggestion:institutionProgramReviewResultSchema,
}).strict().superRefine((value,context)=>{
  if(value.assessedOutcomeCount+value.insufficientOutcomeCount!==value.targetedOutcomeCount
    || value.improvedOutcomeCount>value.assessedOutcomeCount
    || value.declinedOutcomeCount>value.assessedOutcomeCount
    || value.baselineWindowEnd!==value.currentWindowStart){
    context.addIssue({code:'custom',message:'invalid program review evidence'})
  }
})

const institutionProgramReviewRecordBaseSchema=z.object({
  reviewRef:refSchema,
  teacherResult:institutionProgramReviewResultSchema,
  systemSuggestion:institutionProgramReviewResultSchema,
  evidence:institutionProgramReviewEvidenceSchema,
  note:z.string().trim().min(1).max(500).nullable(),
  reviewedAt:timestampSchema,
}).strict()

export const institutionProgramReviewMutationSchema=institutionProgramReviewRecordBaseSchema.extend({
  replayed:z.boolean(),
}).strict()

export const institutionProgramReviewInputSchema=z.object({
  teacherResult:institutionProgramReviewResultSchema,
  note:z.string().trim().max(500).nullable().default(null),
  requestId:z.string().uuid(),
}).strict()

export const institutionStudentProgramHistorySchema=z.object({
  programs:z.array(z.object({
    programRef:refSchema,
    status:z.enum(['published','completed']),
    weekStart:dateSchema,
    itemCount:z.number().int().min(1).max(21),
    publishedAt:timestampSchema,
    reviewEligible:z.boolean(),
    review:institutionProgramReviewRecordBaseSchema.nullable(),
  }).strict().superRefine((value,context)=>{
    if((value.status==='completed')!==Boolean(value.review)){
      context.addIssue({code:'custom',message:'program review history mismatch'})
    }
  })).max(8),
}).strict()

export type InstitutionProgramReviewEvidence=z.infer<typeof institutionProgramReviewEvidenceSchema>
export type InstitutionProgramReviewMutation=z.infer<typeof institutionProgramReviewMutationSchema>
export type InstitutionStudentProgramHistory=z.infer<typeof institutionStudentProgramHistorySchema>
