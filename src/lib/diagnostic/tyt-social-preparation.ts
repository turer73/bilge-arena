import { z } from 'zod'
import { tytSocialPolicyVariantSchema } from '@/lib/exam-policy/tyt-social-contract'

// Deliberately a bounded 2027 preparation contract, not the official 2026 reader.
export const PREPARATION_HREF = '/arena/tani/sosyal-hazirlik'
export const preparationPolicy = z.literal('tyt-social-2027-v1')
export const preparationRequestSchema = z.object({
  requestId: z.uuid(), variant: tytSocialPolicyVariantSchema, noticeAccepted: z.literal(true),
}).strict()
export const preparationContextSchema = z.discriminatedUnion('available', [
  z.object({ available: z.literal(false) }).strict(),
  z.object({
    available: z.literal(true), policyVersion: preparationPolicy, examYear: z.literal(2027),
    variant: tytSocialPolicyVariantSchema.nullable(),
    resume: z.object({ requestId: z.uuid(), variant: tytSocialPolicyVariantSchema }).strict().nullable(),
    candidateQuestionCount: z.literal(20), bookletQuestionCount: z.literal(25),
    officialExamCertification: z.literal(false), wholeCurriculumMeasurement: z.literal(false),
  }).strict(),
])
const content = z.object({
  question: z.string(), options: z.array(z.string()).length(5),
  sentence: z.string().optional(), passage: z.string().optional(), context: z.string().optional(), type: z.string().optional(),
}).strict()
const question = z.object({
  id: z.uuid(), game: z.literal('sosyal'), category: z.string(), subcategory: z.string().nullable(),
  topic: z.string().nullable(), difficulty: z.number().int().min(1).max(5), level_tag: z.string().nullable(),
  base_points: z.number().int().nonnegative(), content,
}).strict()
export const preparationTicketSchema = z.object({
  attemptId: z.uuid(), expiresAt: z.iso.datetime({ offset: true }), examYear: z.literal(2027),
  questions: z.array(question).length(20),
  // Only answers already submitted by this authenticated learner are disclosed.
  progress: z.array(z.object({ questionId: z.uuid(), selectedOption: z.number().int().min(0).max(4),
    isCorrect: z.boolean(), correctOption: z.number().int().min(0).max(4), solution: z.string().nullable(),
  }).strict()).max(20),
}).strict().refine(t => new Set(t.questions.map(q => q.id)).size === 20
  && new Set(t.progress.map(p => p.questionId)).size === t.progress.length
  && t.progress.every(p => t.questions.some(q => q.id === p.questionId)), 'invalid preparation progress')
export type PreparationContext = z.infer<typeof preparationContextSchema>
export type PreparationRequest = z.infer<typeof preparationRequestSchema>
export type PreparationTicket = z.infer<typeof preparationTicketSchema>
export const PREPARATION_DESCRIPTION = 'İncelenmiş havuzdan 20 soruyla başlangıç çalışması. Sonuç yalnız bu sorulardaki gözlemdir; resmî sınav onayı veya tüm müfredat için seviye puanı değildir.'
