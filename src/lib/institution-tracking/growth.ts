import { z } from 'zod'
import { institutionScopeIdentitySchema } from './scope'

const timestampSchema = z.string().datetime({ offset: true })

export const institutionGrowthMetricsSchema = z.object({
  modelVersion: z.enum(['institution-growth-v1', 'institution-growth-v2']),
  baselineWindowStart: timestampSchema,
  baselineWindowEnd: timestampSchema,
  currentWindowStart: timestampSchema,
  currentWindowEnd: timestampSchema,
  eligibleStudentCount: z.number().int().min(0).max(40),
  positiveGrowthStudentCount: z.number().int().min(0).max(40),
  excludedInsufficientCount: z.number().int().min(0).max(40),
}).strict().superRefine((value, context) => {
  if (value.positiveGrowthStudentCount > value.eligibleStudentCount
    || value.baselineWindowEnd !== value.currentWindowStart
    || Date.parse(value.baselineWindowStart) >= Date.parse(value.baselineWindowEnd)
    || Date.parse(value.currentWindowStart) >= Date.parse(value.currentWindowEnd)) {
    context.addIssue({ code: 'custom', message: 'invalid classroom growth metrics' })
  }
})

export const institutionGrowthMetricsV2RpcSchema = institutionGrowthMetricsSchema.safeExtend({
  supported: z.literal(true),
  modelVersion: z.literal('institution-growth-v2'),
  scope: institutionScopeIdentitySchema,
}).strict()

export const institutionGrowthUnavailableV2RpcSchema = z.object({
  supported: z.literal(false),
  reason: z.literal('insufficient_group'),
  modelVersion: z.literal('institution-growth-v2'),
  scope: institutionScopeIdentitySchema,
}).strict()

export type InstitutionGrowthMetrics = z.infer<typeof institutionGrowthMetricsSchema>
