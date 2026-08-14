import { z } from 'zod'

const timestampSchema = z.string().datetime({ offset: true })

export const institutionGrowthMetricsSchema = z.object({
  modelVersion: z.literal('institution-growth-v1'),
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

export type InstitutionGrowthMetrics = z.infer<typeof institutionGrowthMetricsSchema>
