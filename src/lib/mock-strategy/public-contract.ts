import { z } from 'zod'

const segmentSchema = z.object({
  key: z.enum(['opening', 'middle', 'closing']),
  planned: z.number().int().min(0).max(100),
  answered: z.number().int().min(0).max(100),
  correct: z.number().int().min(0).max(100),
  averageSeconds: z.number().finite().nonnegative().nullable(),
  unknownTiming: z.number().int().min(0).max(100),
}).strict().refine(segment => (
  segment.correct <= segment.answered
  && segment.answered <= segment.planned
  && segment.unknownTiming <= segment.answered
))

const analysisSchema = z.object({
  basis: z.literal('server_receipt_approximate'),
  segments: z.tuple([segmentSchema, segmentSchema, segmentSchema]).refine(
    segments => segments.map(segment => segment.key).join(',') === 'opening,middle,closing',
  ),
  unanswered: z.number().int().min(0).max(100),
  unknownTiming: z.number().int().min(0).max(100),
  rushedWrong: z.number().int().min(0).max(100),
  stuck: z.number().int().min(0).max(100),
  recommendations: z.array(z.enum([
    'check_fast_answers',
    'set_first_pass_limit',
    'reserve_final_pass',
    'timing_evidence_incomplete',
    'keep_pace',
  ])).min(1).max(3),
}).strict()

export const mockStrategyPublicResponseSchema = z.object({
  experiment: z.object({
    key: z.literal('mock_strategy_analysis_v1'),
    revision: z.number().int().positive(),
    variant: z.enum(['control', 'treatment']),
  }).strict(),
  analysis: analysisSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.experiment.variant === 'control' && value.analysis !== null) {
    context.addIssue({ code: 'custom', message: 'control cannot include analysis' })
  }
  if (value.experiment.variant === 'treatment' && value.analysis === null) {
    context.addIssue({ code: 'custom', message: 'treatment requires analysis' })
  }
})

export type MockStrategyPublicResponse = z.infer<typeof mockStrategyPublicResponseSchema>

export function parseMockStrategyPublicResponse(value: unknown): MockStrategyPublicResponse | null {
  const parsed = mockStrategyPublicResponseSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
