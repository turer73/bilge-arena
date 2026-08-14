import { z } from 'zod'

const refSchema = z.string().regex(/^[0-9a-f]{32}$/)
const timestampSchema = z.string().datetime({ offset: true })

export const institutionFollowupReasonSchema = z.enum([
  'support_needed',
  'inactivity',
  'learning_decline',
  'program_review',
])

export const institutionFollowupMetricsSchema = z.object({
  followedMemberRefs: z.array(refSchema).max(40),
  interventionEligibleCount: z.number().int().min(0).max(40),
  timelyInterventionCount: z.number().int().min(0).max(40),
  interventionStudentCount: z.number().int().min(0).max(40),
}).strict().superRefine((value, context) => {
  if (new Set(value.followedMemberRefs).size !== value.followedMemberRefs.length
    || value.timelyInterventionCount > value.interventionEligibleCount
    || value.interventionStudentCount !== value.interventionEligibleCount) {
    context.addIssue({ code: 'custom', message: 'invalid follow-up metrics' })
  }
})

export const institutionFollowupOpenInputSchema = z.object({
  classroomId: z.string().uuid(),
  memberRef: refSchema,
  reasonCode: institutionFollowupReasonSchema,
  note: z.string().trim().max(500).nullable().default(null),
  requestId: z.string().uuid(),
}).strict()

const institutionFollowupBaseSchema = z.object({
  followupRef: refSchema,
  reasonCode: institutionFollowupReasonSchema,
  status: z.enum(['open', 'resolved']),
  openedAt: timestampSchema,
  resolvedAt: timestampSchema.nullable(),
}).strict()

export const institutionFollowupMutationSchema = institutionFollowupBaseSchema.extend({
  replayed: z.boolean(),
}).strict().superRefine((value, context) => {
  if ((value.status === 'open' && value.resolvedAt !== null)
    || (value.status === 'resolved' && value.resolvedAt === null)) {
    context.addIssue({ code: 'custom', message: 'follow-up status mismatch' })
  }
})

export const institutionFollowupRecordSchema = institutionFollowupBaseSchema.extend({
  note: z.string().trim().min(1).max(500).nullable(),
}).strict().superRefine((value, context) => {
  if ((value.status === 'open' && value.resolvedAt !== null)
    || (value.status === 'resolved' && value.resolvedAt === null)) {
    context.addIssue({ code: 'custom', message: 'follow-up status mismatch' })
  }
})

export const institutionFollowupListSchema = z.object({
  followups: z.array(institutionFollowupRecordSchema).max(20),
}).strict()

export const institutionFollowupResolveInputSchema = z.object({
  requestId: z.string().uuid(),
}).strict()

export type InstitutionFollowupMetrics = z.infer<typeof institutionFollowupMetricsSchema>
export type InstitutionFollowupMutation = z.infer<typeof institutionFollowupMutationSchema>
export type InstitutionFollowupList = z.infer<typeof institutionFollowupListSchema>
