import { z } from 'zod'

export const bilgeTahtaModeSchema = z.enum(['study', 'game'])

export const bilgeTahtaStageSchema = z.enum([
  'concept',
  'worked-example',
  'practice',
  'hint1',
  'hint2',
  'small-example',
  'solution',
  'transfer',
  'transfer-result',
])

const safeText = (maxLength: number) => z.string()
  .trim()
  .min(1)
  .max(maxLength)
  .transform((value) => value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''))

export const bilgeTahtaStepSchema = z.object({
  id: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  stage: bilgeTahtaStageSchema,
  title: safeText(160),
  content: safeText(8_000),
  formula: safeText(2_000).optional(),
  sourceLabel: safeText(120).optional(),
  guardrailLabel: safeText(120).optional(),
})

export const bilgeTahtaLessonSchema = z.object({
  mode: bilgeTahtaModeSchema,
  subjectLabel: safeText(120),
  title: safeText(180),
  steps: z.array(bilgeTahtaStepSchema).min(1).max(12),
})

export type BilgeTahtaMode = z.infer<typeof bilgeTahtaModeSchema>
export type BilgeTahtaStage = z.infer<typeof bilgeTahtaStageSchema>
export type BilgeTahtaStep = z.infer<typeof bilgeTahtaStepSchema>
export type BilgeTahtaLesson = z.infer<typeof bilgeTahtaLessonSchema>

export function parseBilgeTahtaLesson(input: unknown): BilgeTahtaLesson {
  return bilgeTahtaLessonSchema.parse(input)
}
