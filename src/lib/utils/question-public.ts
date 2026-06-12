import type { Question } from '@/types/database'

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
