import { z } from 'zod'

const uuid = z.string().uuid()
const rationale = z.string().trim().min(10).max(1000)
const sha256 = z.string().regex(/^[0-9a-f]{64}$/)
const timestamp = z.string().datetime({ offset: true })
export const examRoleSchema = z.enum([
  'common_history', 'common_geography', 'common_philosophy',
  'standard_religion', 'alternate_philosophy',
])
export const examRoleWorkflowStateSchema = z.enum([
  'source_prepare', 'content_stage1', 'content_stage2', 'content_publish',
  'role_prepare', 'role_stage1', 'role_stage2', 'ready', 'schema_drift',
])
export const prepareExamRoleInputSchema = z.object({
  revisionId: uuid,
  examRole: examRoleSchema,
  rationale,
  requestId: uuid,
}).strict()
export const reviewExamRoleInputSchema = z.object({
  candidateId: uuid,
  stage: z.union([z.literal(1), z.literal(2)]),
  decision: z.enum(['approved', 'rejected']),
  rationale,
  requestId: uuid,
}).strict()
export const examRoleResultSchema = z.object({
  candidateId: uuid,
  revisionId: uuid,
  policyVersion: z.string().min(1).max(120),
  examRole: examRoleSchema,
  status: z.enum(['pending', 'stage1_approved', 'approved', 'rejected']),
  replayed: z.boolean(),
}).strict()

export const examRoleQueueQuerySchema = z.object({
  state: examRoleWorkflowStateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: uuid.optional(),
}).strict()

const roleCountsSchema = z.object({
  common_history: z.number().int().nonnegative(),
  common_geography: z.number().int().nonnegative(),
  common_philosophy: z.number().int().nonnegative(),
  standard_religion: z.number().int().nonnegative(),
  alternate_philosophy: z.number().int().nonnegative(),
}).strict()

export const examRoleOperationsSchema = z.object({
  items: z.array(z.object({
    questionId: uuid,
    revisionId: uuid.nullable(),
    publishedRevisionId: uuid.nullable(),
    revisionStatus: z.enum([
      'draft', 'stage1_approved', 'stage2_approved', 'published',
      'rejected', 'superseded',
    ]).nullable(),
    revisionCreatedAt: timestamp.nullable(),
    // Unknown legacy values must remain visible as schema_drift work instead of
    // making the entire operational queue unreadable.
    category: z.string().trim().min(1).max(120),
    difficulty: z.number().int().min(1).max(5),
    workflowState: examRoleWorkflowStateSchema,
    sourcePolicyReady: z.boolean(),
    sourceKind: z.enum([
      'original', 'licensed', 'public_domain', 'user_generated', 'official_exam',
    ]).nullable(),
    sourceTitle: z.string().max(200).nullable(),
    licenseCode: z.string().max(80).nullable(),
    provenanceReady: z.boolean(),
    outcomeCount: z.number().int().min(0).max(5),
    allowedRoles: z.array(examRoleSchema).max(2),
    candidateId: uuid.nullable(),
    proposedRole: examRoleSchema.nullable(),
    candidateStatus: z.enum(['pending', 'stage1_approved']).nullable(),
    examRole: examRoleSchema.nullable(),
  }).strict()).max(100),
  nextCursor: uuid.nullable(),
  readiness: z.object({
    policyVersion: z.string().min(1).max(120),
    scopeStatus: z.enum(['draft', 'validating', 'released', 'retired']),
    diagnosticEnabled: z.boolean(),
    activeQuestionCount: z.number().int().nonnegative(),
    sourceApprovedQuestionCount: z.number().int().nonnegative(),
    sourceUnapprovedQuestionCount: z.number().int().nonnegative(),
    sourceEvidenceSha256: sha256,
    sourceReady: z.boolean(),
    assignedQuestionCount: z.number().int().nonnegative(),
    unassignedQuestionCount: z.number().int().nonnegative(),
    invalidRoleCount: z.number().int().nonnegative(),
    invalidApprovalProvenanceCount: z.number().int().nonnegative(),
    roleCounts: roleCountsSchema,
    candidatePolicyReady: z.boolean(),
    masteryReaderReady: z.boolean(),
    officialSectionComposerReady: z.boolean(),
    mappingTotal: z.number().int().nonnegative(),
    mappingMapped: z.number().int().nonnegative(),
    mappingUnmapped: z.number().int().nonnegative(),
    mappingScopeMismatch: z.number().int().nonnegative(),
    mappingNodeOrphan: z.number().int().nonnegative(),
    mappingOutcomeOrphan: z.number().int().nonnegative(),
    mappingPrimaryMismatch: z.number().int().nonnegative(),
    mappingEmptyOutcome: z.number().int().nonnegative(),
    mappingReady: z.boolean(),
    immutableSourceEvidenceRecorded: z.boolean(),
    reviewReady: z.boolean(),
    releaseReady: z.boolean(),
  }).strict(),
}).strict()

export type ExamRoleOperations = z.infer<typeof examRoleOperationsSchema>
export type ExamRoleWorkflowState = z.infer<typeof examRoleWorkflowStateSchema>
export type ExamRole = z.infer<typeof examRoleSchema>

export const releaseTytSocialInputSchema = z.object({
  expectedSourceEvidenceSha256: sha256,
  expectedActiveQuestionCount: z.number().int().positive(),
  requestId: uuid,
}).strict()

export const releaseTytSocialResultSchema = z.object({
  scopeStatus: z.literal('released'),
  diagnosticEnabled: z.literal(false),
  activeQuestionCount: z.number().int().positive(),
  sourceEvidenceSha256: sha256,
  historicalEvidenceDisposition: z.literal('not_backfilled'),
  replayed: z.boolean(),
}).strict()
