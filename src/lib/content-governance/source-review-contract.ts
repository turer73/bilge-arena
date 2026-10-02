import { z } from 'zod'
import { sourceComparisonSchema } from '@/lib/question-audit/source-comparison'

export const SOURCE_REVIEW_MAX_BYTES = 1_048_576
export const sourceReviewInputSchema = z.object({
  report: sourceComparisonSchema,
  rationale: z.string().trim().min(1).max(1000),
  requestId: z.string().uuid(),
}).strict()

// Intentionally omit draft/report/actor details from the browser status projection.
export const sourceReviewStatusSchema = z.object({
  revisionId: z.string().uuid(), accepted: z.boolean(), readyToPublish: z.boolean(),
})
export const sourceReviewDraftSchema = z.object({
  id: z.string().uuid(), game: z.string(), category: z.string(), topic: z.string().nullable(),
  exam_ref: z.string().nullable(), content: z.record(z.string(), z.unknown()),
  published_revision_id: z.string().uuid(), content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
