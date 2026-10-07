import { z } from 'zod'
import { TYT_SOCIAL_SUPPORTED_POLICY_VERSION } from '@/lib/exam-policy/tyt-social-contract'
import { examRoleSchema } from '../exam-role/contracts'

// Exact lower-case pins match the database contract; no client-supplied gates.
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
const sha256 = z.string().regex(/^[0-9a-f]{64}$/)
const pin = z.object({ questionId: uuid, revisionId: uuid, contentSha256: sha256, examRole: examRoleSchema }).strict()
export const reviewedPoolInputSchema = z.object({
  policyVersion: z.literal(TYT_SOCIAL_SUPPORTED_POLICY_VERSION),
  items: z.array(pin).min(1).max(100),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.items.map(i => i.questionId)).size !== value.items.length
    || new Set(value.items.map(i => i.revisionId)).size !== value.items.length) {
    ctx.addIssue({ code: 'custom', message: 'Duplicate pool identity' })
  }
})

const counts = z.object({
  common_history: z.number().int().min(0).max(100),
  common_geography: z.number().int().min(0).max(100),
  common_philosophy: z.number().int().min(0).max(100),
  standard_religion: z.number().int().min(0).max(100),
  alternate_philosophy: z.number().int().min(0).max(100),
}).strict()
export const reviewedPoolResultSchema = z.object({
  version: z.literal('tyt-social-reviewed-pool-preflight@1'),
  policyVersion: z.literal(TYT_SOCIAL_SUPPORTED_POLICY_VERSION),
  manifestSha256: sha256,
  candidateEvidenceOnly: z.literal(true),
  publicationAuthorized: z.literal(false),
  activationSupported: z.literal(false),
  globalGateUnchanged: z.literal(true),
  databaseWrites: z.literal(0),
  selectedCount: z.number().int().min(1).max(100),
  eligibleCount: z.number().int().min(0).max(100),
  poolEvidenceReady: z.boolean(),
  roleCounts: counts,
  roleDeficits: counts,
  items: z.array(pin.extend({
    eligible: z.boolean(),
    issues: z.array(z.enum([
      'POLICY_UNAVAILABLE', 'PIN_NOT_FOUND', 'CONTENT_HASH_MISMATCH',
      'NOT_CURRENT_PUBLICATION', 'QUESTION_INACTIVE', 'LIVE_REVISION_DRIFT',
      'ROLE_SCOPE_MISMATCH', 'INVALID_CONTENT', 'SOURCE_ACCEPTANCE_MISSING',
      'OUTCOME_SCOPE_INVALID', 'QUALITY_DECISION_MISSING', 'ROLE_ACCEPTANCE_MISSING',
    ])).max(12),
  }).strict()).min(1).max(100),
}).strict().superRefine((value, ctx) => {
  const eligible = value.items.filter(i => i.eligible)
  const validCounts = examRoleSchema.options.every(role =>
    value.roleCounts[role] === eligible.filter(i => i.examRole === role).length
    && value.roleDeficits[role] === Math.max(5 - value.roleCounts[role], 0))
  if (value.selectedCount !== value.items.length || value.eligibleCount !== eligible.length
    || new Set(value.items.map(i => i.questionId)).size !== value.items.length
    || new Set(value.items.map(i => i.revisionId)).size !== value.items.length
    || value.items.some(i => i.eligible !== (i.issues.length === 0)) || !validCounts
    || value.poolEvidenceReady !== (value.eligibleCount === value.selectedCount
      && examRoleSchema.options.every(role => value.roleDeficits[role] === 0))) {
    ctx.addIssue({ code: 'custom', message: 'Inconsistent preflight result' })
  }
})

export function reviewedPoolResultMatchesRequest(
  input: z.infer<typeof reviewedPoolInputSchema>, result: z.infer<typeof reviewedPoolResultSchema>,
): boolean {
  return input.items.length === result.items.length && result.items.every(item => {
    const requested = input.items.find(pin => pin.questionId === item.questionId)
    return requested?.revisionId === item.revisionId && requested.contentSha256 === item.contentSha256
      && requested.examRole === item.examRole
  })
}
