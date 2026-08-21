import { z } from 'zod'

const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
const text = (max: number) => z.string().trim().min(1).max(max)
export const contentPermission = z.enum([
  'content.prepare', 'content.review.stage1', 'content.review.stage2', 'content.publish',
  'content.appeals.manage', 'content.corrections.apply', 'content.psychometrics.refresh', 'content.enforcement.manage',
])

export const revisionCreateInputSchema = z.object({
  questionId: uuid, baseRevisionId: uuid.nullable(), payload: z.record(z.string(), z.unknown()), requestId: uuid,
}).strict()
export const revisionReviewInputSchema = z.object({
  stage: z.union([z.literal(1), z.literal(2)]), decision: z.enum(['approved', 'rejected']),
  rationale: text(500), requestId: uuid,
}).strict()
export const requestIdInputSchema = z.object({ requestId: uuid }).strict()
export const quarantineInputSchema = z.object({ reason: text(500), requestId: uuid }).strict()
export const appealSubmitInputSchema = z.object({
  questionId: uuid, sessionAnswerId: uuid.nullable(), reason: z.enum(['wrong_key', 'ambiguous', 'invalid_content', 'other']),
  explanation: z.string().trim().max(1000), requestId: uuid,
}).strict()
export const appealResolveInputSchema = z.object({
  status: z.enum(['acknowledged', 'investigating', 'resolved', 'rejected']),
  publicMessage: text(1000), internalNote: z.string().trim().max(4_000), requestId: uuid,
}).strict()
export const incidentCreateInputSchema = z.object({
  questionId: uuid, revisionId: uuid, correctedRevisionId: uuid,
  errorType: z.enum(['wrong_key', 'ambiguous', 'invalid_content', 'outcome_mismatch']), requestId: uuid,
}).strict()
export const psychometricRefreshInputSchema = z.object({
  windowStart: timestamp, windowEnd: timestamp, requestId: uuid,
}).strict().refine((value) => new Date(value.windowEnd).getTime() > new Date(value.windowStart).getTime())
export const enforcementInputSchema = z.object({ enforced: z.boolean(), requestId: uuid }).strict()

/**
 * RPC results are projections, not pass-through transport.  Migration 106 may
 * add audit/private fields, but routes can return only the public-safe keys.
 */
const revisionMutationResultSchema = z.object({
  replayed: z.boolean(),
  revisionId: uuid.optional(),
  status: z.string().max(40).optional(),
}).strip()
export const revisionCreateResultSchema = revisionMutationResultSchema
export const revisionReviewResultSchema = revisionMutationResultSchema
export const revisionPublishResultSchema = revisionMutationResultSchema
export const quarantineResultSchema = z.object({
  replayed: z.boolean(), questionId: uuid.optional(), status: z.string().max(40).optional(),
}).strip()
export const appealResolveResultSchema = z.object({
  replayed: z.boolean(), appealId: uuid.optional(), status: z.string().max(40).optional(),
}).strip()
export const appealSubmitResultSchema = z.object({
  replayed: z.boolean(), appealId: uuid.optional(), status: z.string().max(40).optional(),
  ackDueAt: timestamp.optional(), resolveDueAt: timestamp.optional(),
}).strip()
export const incidentCreateResultSchema = z.object({
  replayed: z.boolean(), incidentId: uuid.optional(), status: z.string().max(40).optional(),
  eligibleCount: z.number().int().nonnegative().max(1_000_000).optional(),
  manualRequiredCount: z.number().int().nonnegative().max(1_000_000).optional(),
}).strip()
export const incidentApplyResultSchema = z.object({
  replayed: z.boolean(), incidentId: uuid.optional(),
  eligibleCount: z.number().int().nonnegative().max(1_000_000).optional(),
  changedCount: z.number().int().nonnegative().max(1_000_000).optional(),
  manualRequiredCount: z.number().int().nonnegative().max(1_000_000).optional(),
}).strip()
export const psychometricResultSchema = z.object({
  replayed: z.boolean(), revisionId: uuid, sampleN: z.number().int().nonnegative(), correctN: z.number().int().nonnegative(),
  pCorrect: z.number().min(0).max(1).nullable(), wilsonLow: z.number().min(0).max(1).nullable(),
  wilsonHigh: z.number().min(0).max(1).nullable(), discrimination: z.number().min(-1).max(1).nullable(),
  omittedN: z.number().int().nonnegative().optional(), medianResponseTimeSec: z.number().nonnegative().nullable().optional(),
  fastResponseRate: z.number().min(0).max(1).nullable().optional(), eligibilityPolicy: z.string().max(120).optional(),
}).strip().refine((value) => value.correctN <= value.sampleN)
export const enforcementResultSchema = z.object({ enforced: z.boolean(), replayed: z.boolean().optional(), updatedAt: timestamp.optional() }).strip()
export const appealListSchema = z.object({ appeals: z.array(z.object({
  status: z.enum(['submitted', 'acknowledged', 'investigating', 'resolved', 'rejected', 'withdrawn']),
  submittedAt: timestamp, acknowledgmentDueAt: timestamp, resolutionDueAt: timestamp,
  publicMessage: z.string().max(1000).nullable(),
}).strict()).max(1_000) }).strict()
export const appealAdminQueueSchema = z.object({ items: z.array(z.object({
  appealId: uuid, questionId: uuid, revisionId: uuid.nullable(),
  reasonCode: z.enum(['wrong_key', 'ambiguous', 'invalid_content', 'outcome_mismatch', 'other']),
  description: z.string().max(1000),
  status: z.enum(['submitted', 'acknowledged', 'investigating', 'resolved', 'rejected', 'withdrawn']),
  submittedAt: timestamp, ackDueAt: timestamp, resolveDueAt: timestamp,
  slaBreachedAt: timestamp.nullable(), hasSessionEvidence: z.boolean(),
  latestPublicMessage: z.string().max(1000).nullable(), latestInternalNote: z.string().max(2000).nullable(),
}).strict()).max(100), nextCursor: z.string().max(200).nullable() }).strict()
export const correctionsSchema = z.object({ corrections: z.array(z.object({
  sessionDate: z.string().date(), reason: z.string().max(120), scoreDelta: z.union([z.literal(-1), z.literal(1)]),
  correctedAt: timestamp,
}).strict()).max(1_000) }).strict()
export const queueSchema = z.object({ items: z.array(z.object({
  revisionId: uuid, questionId: uuid, status: z.string().max(40), createdAt: timestamp,
}).strict()).max(200), nextCursor: z.string().max(500).nullable() }).strict()
const revisionContentSchema = z.object({
  question: z.unknown().optional(), options: z.array(z.unknown()).max(5).optional(), answer: z.number().int().min(0).max(4).optional(),
  solution: z.unknown().optional(), explanation: z.unknown().optional(), hint: z.unknown().optional(), sentence: z.unknown().optional(),
  passage: z.unknown().optional(), context: z.unknown().optional(), type: z.unknown().optional(),
}).strict()
const revisionDetailSchema = z.object({
  revisionId: uuid, questionId: uuid, revisionNo: z.number().int().positive(),
  status: z.enum(['draft', 'stage1_approved', 'stage2_approved', 'published', 'rejected', 'superseded']),
  changeKind: z.enum(['legacy_import', 'create', 'edit', 'correct_answer', 'retire']), summary: z.string().max(500),
  preparedAt: timestamp, publishedAt: timestamp.nullable(),
  metadata: z.object({
    game: z.enum(['wordquest', 'matematik', 'turkce', 'fen', 'sosyal']), category: z.string().max(120),
    subcategory: z.string().max(120).optional(), topic: z.string().max(200).optional(), difficulty: z.number().int().min(1).max(5),
    levelTag: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(), examRef: z.string().max(20).optional(), isBoss: z.boolean(),
  }).strict(),
  content: revisionContentSchema,
  source: z.object({
    kind: z.enum(['original', 'licensed', 'public_domain', 'user_generated', 'official_exam']), title: z.string().max(200),
    url: z.string().url().optional(), licenseCode: z.string().max(80), licenseUrl: z.string().url().optional(),
    attribution: z.string().max(1000).optional(), provenanceRef: z.string().max(500).optional(),
  }).strict(),
  outcomes: z.array(z.object({ outcomeId: uuid, weight: z.number().positive().max(1), primary: z.boolean() }).strict()).max(5),
  approvals: z.array(z.object({ stage: z.union([z.literal(1), z.literal(2)]), decision: z.enum(['approved', 'rejected']), decidedAt: timestamp }).strict()).max(2),
  validation: z.object({
    policyVersion: z.string().max(100),
    verdict: z.enum(['APPROVED', 'REJECTED', 'NEEDS_REVIEW', 'INCONCLUSIVE']),
    findings: z.array(z.object({
      code: z.enum(['WRONG_KEY_SUSPECTED', 'NO_CORRECT_OPTION', 'MULTIPLE_CORRECT', 'MISSING_PREMISE', 'AMBIGUOUS_WORDING', 'SOLUTION_CONTRADICTS_ANSWER', 'INCOMPLETE_SOLUTION', 'LOGICAL_FALLACY']),
      evidence: z.string().max(4_000), optionIndexes: z.array(z.number().int().min(0).max(4)).max(5).optional(),
    }).strict()).max(50),
    rationale: z.string().max(8_000), blindConsensusIndex: z.number().int().min(0).max(4).nullable(),
    blindAgreementRatio: z.number().min(0).max(1).nullable(), decidedAt: timestamp,
  }).strict().nullable().optional(),
  psychometrics: z.array(z.object({
    windowStart: timestamp, windowEnd: timestamp, sampleN: z.number().int().nonnegative(), correctN: z.number().int().nonnegative(),
    pCorrect: z.number().min(0).max(1).nullable(), wilsonLow: z.number().min(0).max(1).nullable(), wilsonHigh: z.number().min(0).max(1).nullable(),
    discrimination: z.number().min(-1).max(1).nullable(), materializedAt: timestamp,
  }).strict()).max(12),
  incidents: z.array(z.object({
    incidentId: uuid, erroneousRevisionId: uuid, correctedRevisionId: uuid,
    errorType: z.enum(['wrong_key', 'ambiguous', 'invalid_content', 'outcome_mismatch']), status: z.enum(['open', 'applied', 'superseded', 'closed']),
    eligibleCount: z.number().int().nonnegative(), changedCount: z.number().int().nonnegative(), manualRequiredCount: z.number().int().nonnegative(),
    createdAt: timestamp, closedAt: timestamp.nullable(),
  }).strict()).max(1_000),
}).strict()
export const revisionSchema = z.object({ revision: revisionDetailSchema }).strict()

export function contentGovernanceRpcStatus(code?: string): number {
  if (code === '42501') return 403
  if (code === 'P0002') return 404
  if (code === '22023' || code === '23505' || code === '23514' || code === 'P0003') return 409
  return 500
}
export function contentNoStoreJson(body: unknown, init?: { status?: number; headers?: HeadersInit }): Response {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'private, no-store')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Content-Type-Options', 'nosniff')
  return Response.json(body, { ...init, headers })
}
