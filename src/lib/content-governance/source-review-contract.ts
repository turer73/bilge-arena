import { z } from 'zod'
import { sourceComparisonSchema } from '@/lib/question-audit/source-comparison'

export const SOURCE_REVIEW_MAX_BYTES = 1_048_576
export const aiPreparationDeclarationSchema = z.object({
  version: z.literal('ai-preparation-declaration@1'),
  agent: z.string().trim().min(1).max(120),
  evidenceRef: z.string().trim().min(1).max(1000),
  evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  revisionEvidenceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledgesNonIndependentReview: z.literal(true),
  acceptsResponsibility: z.literal(true),
}).strict()
const commonInput = {
  report: sourceComparisonSchema,
  rationale: z.string().trim().min(1).max(1000),
  requestId: z.string().uuid(),
}
export const sourceReviewInputSchema = z.union([
  z.object({ ...commonInput, acceptanceMode: z.literal('separate_reviewer').optional() }).strict(),
  z.object({ ...commonInput, acceptanceMode: z.literal('ai_assisted_owner'), preparation: aiPreparationDeclarationSchema }).strict(),
])

// Intentionally omit draft/report/actor details from the browser status projection.
export const sourceReviewStatusSchema = z.object({
  revisionId: z.string().uuid(), accepted: z.boolean(), readyToPublish: z.boolean(),
  acceptanceMode: z.enum(['separate_reviewer', 'ai_assisted_owner']).nullable().optional(),
  canAcceptAiPrepared: z.boolean().optional(),
  evidenceFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
})
export const sourceReviewDraftSchema = z.object({
  id: z.string().uuid(), game: z.string(), category: z.string(), topic: z.string().nullable(),
  exam_ref: z.string().nullable(), content: z.record(z.string(), z.unknown()),
  published_revision_id: z.string().uuid(), content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
