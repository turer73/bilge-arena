import { z } from 'zod'

const uuid = z.string().uuid()
const rationale = z.string().trim().min(10).max(1000)
export const examRoleSchema = z.enum([
  'common_history', 'common_geography', 'common_philosophy',
  'standard_religion', 'alternate_philosophy',
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
