import { z } from 'zod'

export const MEASUREMENT_NOTICE = 'Bu gönüllü tur, soruların ölçüm verisini toplar; kalibre edilmiş seviye testi değildir. İlk cevabın kilitlenir, çözümler tur sonunda açılır. Puan, ödül veya sıralaman değişmez. İstediğin zaman bırakabilirsin.'
export const RENDER_VERSION = 'measurement-text@1' as const
const uuid = z.string().uuid()
const position = z.number().int().min(1).max(30)
const game = z.enum(['matematik', 'turkce', 'fen', 'sosyal'])
const exam = z.enum(['TYT', 'LGS'])
const question = z.object({ id: uuid, position, text: z.string().min(1).max(20_000),
  passage: z.string().max(30_000).nullable(), options: z.array(z.string().min(1).max(10_000)).min(4).max(5),
}).strict()
const feedback = z.object({ questionId: uuid, position, text: z.string().min(1).max(20_000),
  selectedText: z.string().nullable(), correctText: z.string(), isCorrect: z.boolean(), solution: z.string().nullable(),
}).strict()
export const measurementSessionSchema = z.object({
  id: uuid, formId: uuid, game, examRef: exam, examYear: z.number().int().min(2026).max(2100),
  protocol: z.literal('closed-measurement@1'), status: z.enum(['active', 'completed', 'abandoned', 'expired', 'withdrawn']),
  answered: z.number().int().min(0).max(30), questionCount: z.number().int().min(5).max(30),
  expiresAt: z.iso.datetime({ offset: true }), question: question.nullable(),
  feedback: z.array(feedback).min(5).max(30).nullable(), calibrated: z.literal(false),
}).strict().superRefine((s, ctx) => {
  if (s.answered > s.questionCount || (s.status === 'active'
    ? !s.question || s.question.position !== s.answered + 1 || s.feedback !== null
      || s.question.options.length !== (s.examRef === 'LGS' ? 4 : 5)
    : s.question !== null || (s.status === 'completed'
      ? s.answered !== s.questionCount || s.feedback?.length !== s.questionCount
      : s.feedback !== null))) ctx.addIssue({ code: 'custom', message: 'measurement state mismatch' })
  if (s.feedback && (new Set(s.feedback.map(f => f.questionId)).size !== s.questionCount
    || s.feedback.some((f, i) => f.position !== i + 1))) ctx.addIssue({ code: 'custom', message: 'feedback order mismatch' })
})
export const measurementContextSchema = z.object({
  forms: z.array(z.object({ id: uuid, game, examRef: exam, examYear: z.number().int(),
    questionCount: z.number().int().min(5).max(30) }).strict()).max(100),
  session: measurementSessionSchema.nullable(),
}).strict()
const declaration = {
  renderOk: z.boolean(), assistanceUsed: z.boolean(), interrupted: z.boolean(), renderVersion: z.literal(RENDER_VERSION),
}
export const measurementRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), formId: uuid, requestId: uuid, noticeAccepted: z.literal(true) }).strict(),
  z.object({ action: z.literal('abandon'), sessionId: uuid }).strict(),
  z.object({ action: z.literal('acknowledge'), sessionId: uuid, position, requestId: uuid, ...declaration }).strict(),
  z.object({ action: z.literal('answer'), sessionId: uuid, position, requestId: uuid,
    selectedOption: z.number().int().min(-1).max(4), ...declaration }).strict(),
])
export type MeasurementSession = z.infer<typeof measurementSessionSchema>
export type MeasurementContext = z.infer<typeof measurementContextSchema>
export type MeasurementRequest = z.infer<typeof measurementRequestSchema>
