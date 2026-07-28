import { z } from 'zod'
import type { Question, QuestionContent } from '@/types/database'
import type { Tables } from '@/types/database.generated'

export type QuestionRow = Tables<'questions'>

const questionContentSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).min(2),
  answer: z.number().int().nonnegative(),
  solution: z.string().optional(),
  sentence: z.string().optional(),
  passage: z.string().optional(),
  context: z.string().optional(),
  hint: z.string().optional(),
  type: z.string().optional(),
  explanation: z.string().optional(),
}).refine((content) => content.answer < content.options.length, {
  message: 'answer must point to an option',
})

const gameSchema = z.enum(['wordquest', 'matematik', 'turkce', 'fen', 'sosyal'])
const difficultySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
])

export function parseQuestionContent(content: QuestionRow['content']): QuestionContent | null {
  const parsed = questionContentSchema.safeParse(content)
  return parsed.success ? parsed.data : null
}

export function toDomainQuestion(row: QuestionRow): Question | null {
  const content = parseQuestionContent(row.content)
  const game = gameSchema.safeParse(row.game)
  const difficulty = difficultySchema.safeParse(row.difficulty)

  if (!content || !game.success || !difficulty.success) return null

  return {
    id: row.id,
    external_id: row.external_id,
    game: game.data,
    category: row.category,
    subcategory: row.subcategory,
    topic: row.topic,
    difficulty: difficulty.data,
    level_tag: row.level_tag,
    content,
    base_points: row.base_points ?? difficulty.data * 10,
    is_active: row.is_active ?? true,
    is_boss: row.is_boss ?? false,
    times_answered: row.times_answered ?? 0,
    times_correct: row.times_correct ?? 0,
    source: row.source ?? 'unknown',
    exam_ref: row.exam_ref,
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
  }
}

export function parseQuestionRows(rows: QuestionRow[] | null | undefined): Question[] {
  if (!rows) return []
  return rows.flatMap((row) => {
    const question = toDomainQuestion(row)
    return question ? [question] : []
  })
}

/**
 * Soru API yanıtları için public alan whitelist'i.
 *
 * RPC'ler tam DB satırı döndürür; iç telemetri/operasyon alanları
 * (times_answered, times_correct, is_active, source, external_id,
 * created_at...) client'a sızmamalı. Quiz'in kullandığı alanlar:
 * grading + açıklama paneli için content (answer/solution dahil),
 * companion/XP için difficulty + base_points, konu anlatımı için
 * game/category/subcategory/topic, WordQuest için level_tag.
 */
export type PublicQuestion = Pick<
  Question,
  | 'id'
  | 'game'
  | 'category'
  | 'subcategory'
  | 'topic'
  | 'difficulty'
  | 'level_tag'
  | 'content'
  | 'base_points'
>

export function toPublicQuestion(q: Question): PublicQuestion {
  return {
    id: q.id,
    game: q.game,
    category: q.category,
    subcategory: q.subcategory,
    topic: q.topic,
    difficulty: q.difficulty,
    level_tag: q.level_tag,
    content: q.content,
    base_points: q.base_points,
  }
}
