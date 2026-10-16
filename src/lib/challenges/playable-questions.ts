import type { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { Question } from '@/types/database'
import { parseQuestionRows } from '@/lib/utils/question-public'

type ServiceClient = ReturnType<typeof createServiceRoleClient>

export type PlayableChallengeQuestions =
  | { questions: Question[]; error: null }
  | { questions: null; error: { code?: string } }

/**
 * Bir duellonun oynanabilir sorulari: `challenges.question_ids` sirasinda,
 * bankada hala bulunan ve icerigi gecerli olan sorular.
 *
 * GET /api/challenges/[id] bu kumeyi oyuncuya sunar, submit ayni kumeyi
 * notlar. Ikisi ayni yardimciyi kullandigi icin bankadan silinmis ya da
 * icerigi bozulmus bir soru duelloyu kilitlemez; oyuncu gormedigi soruya
 * cevap vermek zorunda kalmaz (disc #2530).
 */
export async function loadPlayableChallengeQuestions(
  admin: ServiceClient,
  questionIds: readonly string[],
): Promise<PlayableChallengeQuestions> {
  if (questionIds.length === 0) return { questions: [], error: null }

  const { data, error } = await admin
    .from('questions')
    .select('*')
    .in('id', [...questionIds])

  if (error) return { questions: null, error }

  const byId = new Map(parseQuestionRows(data).map((question) => [question.id, question] as const))
  return {
    questions: questionIds.flatMap((id) => {
      const question = byId.get(id)
      return question ? [question] : []
    }),
    error: null,
  }
}
