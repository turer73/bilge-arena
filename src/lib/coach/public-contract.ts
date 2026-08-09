import { z } from 'zod'
import type { PublicQuestion } from '@/lib/utils/question-public'
import type { CoachContentSource } from './hints'

const publicQuestionContentSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(5),
  sentence: z.string().optional(),
  passage: z.string().optional(),
  context: z.string().optional(),
  type: z.string().optional(),
}).strict()

const publicQuestionSchema: z.ZodType<PublicQuestion> = z.object({
  id: z.string().uuid(),
  game: z.enum(['wordquest', 'matematik', 'turkce', 'fen', 'sosyal']),
  category: z.string().min(1),
  subcategory: z.string().nullable(),
  topic: z.string().nullable(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  level_tag: z.string().nullable(),
  base_points: z.number().finite(),
  content: publicQuestionContentSchema,
}).strict()

const sourceSchema = z.enum(['authored', 'ai', 'fallback', 'solution', 'approved_transfer'])

const evaluationSchema = z.object({
  passed: z.literal(true),
  policyVersion: z.string().min(1).max(80),
}).strict()

const guidanceSchema = z.object({
  sessionId: z.string().uuid(),
  stage: z.enum(['hint1', 'hint2', 'hint3']),
  hint: z.string().min(1).max(1_000),
  source: sourceSchema,
  sourceLabel: z.string().min(1).max(100),
  evaluation: evaluationSchema,
  nextToken: z.string().min(1).max(4_000),
}).strict()

const solutionSchema = z.object({
  sessionId: z.string().uuid(),
  stage: z.literal('solution'),
  hint: z.string().min(1).max(2_000),
  source: z.literal('solution'),
  sourceLabel: z.string().min(1).max(100),
  evaluation: evaluationSchema,
  transferQuestion: publicQuestionSchema,
  nextToken: z.string().min(1).max(4_000),
}).strict()

const transferSchema = z.object({
  sessionId: z.string().uuid(),
  stage: z.literal('transfer'),
  isCorrect: z.boolean(),
  correctOption: z.number().int().min(0).max(4),
  solution: z.string().max(2_000).nullable(),
  source: z.literal('approved_transfer'),
  sourceLabel: z.string().min(1).max(100),
  evaluation: evaluationSchema,
  nextToken: z.null(),
}).strict()

export const coachPublicResponseSchema = z.union([
  guidanceSchema,
  solutionSchema,
  transferSchema,
])

export type CoachPublicResponse = z.infer<typeof coachPublicResponseSchema>

export function parseCoachPublicResponse(value: unknown): CoachPublicResponse | null {
  const parsed = coachPublicResponseSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function isCoachContentSource(value: unknown): value is CoachContentSource {
  return sourceSchema.safeParse(value).success
}
