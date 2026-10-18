import { DENEME_CONFIGS } from '@/lib/constants/modes'
import type { GameSlug } from '@/lib/constants/games'
import type { GameMode } from '@/types/database'

interface QuestionIdentity { id: string; category: string | null }

function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

function unique<T extends QuestionIdentity>(questions: readonly T[]): T[] {
  return [...new Map(questions.map(question => [question.id, question])).values()]
}

/** Compose the played list BEFORE issueVerifiedAttempt binds its positions.
 * Clients may shuffle answer options, but must preserve this question order. */
export function composeQuizQuestions<T extends QuestionIdentity>({
  questions, reviewQuestions, game, mode, limit,
}: {
  questions: readonly T[]
  reviewQuestions: readonly T[]
  game: GameSlug
  mode: GameMode
  limit: number
}): T[] {
  const pool = unique(questions)
  if (mode === 'deneme') {
    const selected: T[] = []
    const selectedIds = new Set<string>()
    for (const [category, count] of Object.entries(DENEME_CONFIGS[game]?.questionDistribution ?? {})) {
      const candidates = shuffled(pool.filter(question => question.category === category))
      for (const question of candidates.slice(0, Math.min(count, limit - selected.length))) {
        selected.push(question)
        selectedIds.add(question.id)
      }
      if (selected.length >= limit) break
    }
    selected.push(...shuffled(pool.filter(question => !selectedIds.has(question.id)))
      .slice(0, limit - selected.length))
    return shuffled(selected)
  }

  const reviewCount = Math.max(1, Math.floor(limit * 0.3))
  const review = shuffled(unique(reviewQuestions)).slice(0, reviewCount)
  const reviewIds = new Set(review.map(question => question.id))
  const fresh = shuffled(pool.filter(question => !reviewIds.has(question.id)))
    .slice(0, limit - review.length)
  return shuffled([...review, ...fresh])
}
