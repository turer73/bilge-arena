import { z } from 'zod'
import { aiPreparationDeclarationSchema } from './source-review-contract'

const uuid=z.string().uuid()
const hash=z.string().regex(/^[a-f0-9]{64}$/)
export const RETIREMENT_REVIEW_MAX_BYTES=65_536
export const retirementEvidenceSchema=z.object({
  version:z.literal('retirement-evidence@1'),questionId:uuid,revisionId:uuid,contentSha256:hash,baseRevisionId:uuid,
  reason:z.enum(['duplicate','invalid_content','out_of_curriculum']),
  evidenceRef:z.string().trim().min(1).max(1000),evidenceSha256:hash,
  survivor:z.object({questionId:uuid,publishedRevisionId:uuid,contentSha256:hash}).strict().nullable(),
}).strict().refine(value=>value.reason==='duplicate'
  ?value.survivor!==null&&value.survivor.questionId!==value.questionId:value.survivor===null,
{message:'Duplicate requires a different pinned survivor; other reasons require null survivor'})
export const retirementReviewInputSchema=z.object({
  acceptanceMode:z.literal('ai_assisted_owner_retirement'),evidence:retirementEvidenceSchema,
  preparation:aiPreparationDeclarationSchema,rationale:z.string().trim().min(1).max(1000),requestId:uuid,
}).strict().refine(value=>value.preparation.evidenceRef===value.evidence.evidenceRef
  &&value.preparation.evidenceSha256===value.evidence.evidenceSha256,{message:'Preparation and retirement evidence must bind the same package'})
export const retirementReviewStatusSchema=z.object({
  revisionId:uuid,accepted:z.boolean(),canAccept:z.boolean(),readyToPublish:z.boolean(),
  acceptanceMode:z.literal('ai_assisted_owner_retirement').nullable(),evidenceFingerprint:hash.nullable(),
})
export const retirementReviewResultSchema=z.object({
  questionId:uuid,revisionId:uuid,status:z.literal('stage1_approved'),
  acceptanceMode:z.literal('ai_assisted_owner_retirement'),replayed:z.boolean(),
})
export type RetirementReviewStatus=z.infer<typeof retirementReviewStatusSchema>
