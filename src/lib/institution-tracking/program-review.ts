import { z } from 'zod'
import { institutionScopeIdentitySchema } from './scope'

const refSchema=z.string().regex(/^[0-9a-f]{32}$/)
const timestampSchema=z.string().datetime({offset:true})
const dateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const institutionProgramReviewTeacherResultSchema=z.enum(['effective','partial','ineffective','insufficient'])
export const institutionProgramReviewSuggestionSchema=z.enum([
  'effective','partial','ineffective','insufficient',
  'observed_improvement','mixed_observation','no_observed_improvement',
])

export const institutionProgramReviewEvidenceSchema=z.object({
  modelVersion:z.enum(['institution-program-review-v1','institution-program-review-v2']),
  baselineWindowStart:timestampSchema,baselineWindowEnd:timestampSchema,
  currentWindowStart:timestampSchema,currentWindowEnd:timestampSchema,
  targetedOutcomeCount:z.number().int().min(0).max(21),
  assessedOutcomeCount:z.number().int().min(0).max(21),
  improvedOutcomeCount:z.number().int().min(0).max(21),
  declinedOutcomeCount:z.number().int().min(0).max(21),
  insufficientOutcomeCount:z.number().int().min(0).max(21),
  systemSuggestion:institutionProgramReviewSuggestionSchema,
  causalClaim:z.boolean().default(false),
}).strict().superRefine((value,context)=>{
  const baselineStart=Date.parse(value.baselineWindowStart)
  const baselineEnd=Date.parse(value.baselineWindowEnd)
  const currentStart=Date.parse(value.currentWindowStart)
  const currentEnd=Date.parse(value.currentWindowEnd)
  if(value.assessedOutcomeCount+value.insufficientOutcomeCount!==value.targetedOutcomeCount
    || value.improvedOutcomeCount>value.assessedOutcomeCount
    || value.declinedOutcomeCount>value.assessedOutcomeCount
    || baselineStart>baselineEnd
    || baselineEnd>currentStart
    || currentStart>=currentEnd
    || (value.modelVersion==='institution-program-review-v2' && value.causalClaim!==false)){
    context.addIssue({code:'custom',message:'invalid program review evidence'})
  }
})

const institutionProgramReviewRecordBaseSchema=z.object({
  reviewRef:refSchema,
  teacherResult:institutionProgramReviewTeacherResultSchema,
  systemSuggestion:institutionProgramReviewSuggestionSchema,
  evidence:institutionProgramReviewEvidenceSchema,
  note:z.string().trim().min(1).max(500).nullable(),
  reviewedAt:timestampSchema,
}).strict()

export const institutionProgramReviewMutationSchema=institutionProgramReviewRecordBaseSchema.extend({
  replayed:z.boolean(),
}).strict()

export const institutionProgramReviewInputSchema=z.object({
  teacherResult:institutionProgramReviewTeacherResultSchema,
  note:z.string().trim().max(500).nullable().default(null),
  requestId:z.string().uuid(),
}).strict()

const institutionStudentProgramHistoryItemSchema=z.object({
    programRef:refSchema,
    scope:institutionScopeIdentitySchema,
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
  })

export const institutionStudentProgramHistorySchema=z.object({
  scope:institutionScopeIdentitySchema,
  programs:z.array(institutionStudentProgramHistoryItemSchema).max(8),
}).strict().superRefine((value,context)=>{
  if(value.programs.some((program)=>(
    program.scope.game!==value.scope.game
    || program.scope.examRef!==value.scope.examRef
    || program.scope.questionExamRef!==value.scope.questionExamRef
    || program.scope.taxonomyVersion!==value.scope.taxonomyVersion
    || program.scope.scopePolicyVersion!==value.scope.scopePolicyVersion
  ))){
    context.addIssue({code:'custom',message:'program history scope mismatch'})
  }
})

export type InstitutionProgramReviewEvidence=z.infer<typeof institutionProgramReviewEvidenceSchema>
export type InstitutionProgramReviewMutation=z.infer<typeof institutionProgramReviewMutationSchema>
export type InstitutionStudentProgramHistory=z.infer<typeof institutionStudentProgramHistorySchema>
