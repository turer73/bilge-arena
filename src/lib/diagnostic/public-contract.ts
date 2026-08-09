import type { PublicQuestion } from '@/lib/utils/question-public'
import { z } from 'zod'

export type DiagnosticPublicStatus = 'active' | 'completed' | 'abandoned' | 'expired'
export type DiagnosticPublicBand = 'foundation' | 'developing' | 'strong'

export interface DiagnosticOutcomeSummaryPublic {
  code: string
  title: string
  category: string
  attempts: number
  correctAttempts: number
  score: number
  recommendedDifficulty: number
  band: DiagnosticPublicBand
}

export interface DiagnosticSummaryPublic {
  completedAt: string
  outcomes: DiagnosticOutcomeSummaryPublic[]
}

export interface DiagnosticSessionPublic {
  id: string
  kind: 'initial' | 'recheck'
  status: DiagnosticPublicStatus
  expiresAt: string
  progress: {
    answered: number
    total: number
    coveredOutcomes: number
    totalOutcomes: number
  }
  question: PublicQuestion | null
}

export interface DiagnosticResponsePublic {
  supported: boolean
  game: string
  examRef: string | null
  session: DiagnosticSessionPublic | null
  summary: DiagnosticSummaryPublic | null
}

const publicQuestionContentSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).min(2).max(5),
  sentence: z.string().optional(),
  passage: z.string().optional(),
  context: z.string().optional(),
  type: z.string().optional(),
}).strict()

const publicQuestionSchema = z.object({
  id: z.string().uuid(),
  game: z.enum(['wordquest', 'matematik', 'turkce', 'fen', 'sosyal']),
  category: z.string().min(1),
  subcategory: z.string().nullable(),
  topic: z.string().nullable(),
  difficulty: z.number().int().min(1).max(5),
  level_tag: z.string().nullable(),
  base_points: z.number().finite().nonnegative(),
  content: publicQuestionContentSchema,
}).strict()

const outcomeSummarySchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  attempts: z.number().int().min(1).max(2),
  correctAttempts: z.number().int().min(0).max(2),
  score: z.number().finite().min(0).max(100),
  recommendedDifficulty: z.number().int().min(1).max(5),
  band: z.enum(['foundation', 'developing', 'strong']),
}).strict().refine((value) => value.correctAttempts <= value.attempts)

const summarySchema = z.object({
  completedAt: z.string().datetime({ offset: true }),
  outcomes: z.array(outcomeSummarySchema).length(6),
}).strict().refine((value) => (
  new Set(value.outcomes.map((outcome) => outcome.code)).size === value.outcomes.length
  && new Set(value.outcomes.map((outcome) => outcome.category)).size === value.outcomes.length
))

const sessionSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['initial', 'recheck']),
  status: z.enum(['active', 'completed', 'abandoned', 'expired']),
  expiresAt: z.string().datetime({ offset: true }),
  progress: z.object({
    answered: z.number().int().min(0).max(10),
    total: z.literal(10),
    coveredOutcomes: z.number().int().min(0).max(6),
    totalOutcomes: z.literal(6),
  }).strict(),
  question: publicQuestionSchema.nullable(),
}).strict().refine((value) => (
  value.progress.coveredOutcomes <= value.progress.answered
  && ((value.status === 'active' && value.question !== null)
    || (value.status !== 'active' && value.question === null))
))

const responseSchema = z.object({
  supported: z.boolean(),
  game: z.string().min(1),
  examRef: z.string().nullable(),
  session: sessionSchema.nullable(),
  summary: summarySchema.nullable(),
}).strict().refine((value) => {
  if (!value.supported) return value.session === null && value.summary === null
  return value.game === 'matematik'
    && value.examRef === 'TYT'
    && (!value.session?.question || value.session.question.game === value.game)
})

export function parseDiagnosticResponse(value: unknown): DiagnosticResponsePublic | null {
  const parsed = responseSchema.safeParse(value)
  return parsed.success ? parsed.data as DiagnosticResponsePublic : null
}
