import type { createServiceRoleClient } from '@/lib/supabase/service-role'
import { foldQuestionCard, isCardDue, type ReviewEvent } from './fsrs'

export interface DueInfo {
  isDue: boolean
  dueAt: string
}

/**
 * Verilen soru-id'leri icin TAM (dogru+yanlis) session_answers gecmisini
 * ceker, her soruyu kronolojik olarak FSRS'e katlar (src/lib/review/fsrs.ts)
 * ve soru-id -> {isDue, dueAt} haritasi doner. questions/random (review-havuzu
 * secimi) ve /api/review/wrong-answers (Yanlislarim ekrani due-rozeti) AYNI
 * fold-mantigini paylasir -- tekrar yazilmasin diye buraya cikarildi.
 */
export async function computeDueMap(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  questionIds: string[],
): Promise<Map<string, DueInfo>> {
  const result = new Map<string, DueInfo>()
  if (questionIds.length === 0) return result

  const { data: historyRows, error } = await admin
    .from('session_answers')
    .select('question_id, is_correct, answered_at')
    .eq('user_id', userId)
    .in('question_id', questionIds)
    .order('answered_at', { ascending: true })

  // Transient okuma hatasini YUTMA: bos map "due yok" gibi gorunur ve cagiran
  // (gunluk plan) yarim/yanlis snapshot'i tum TR-gunu boyunca persist eder
  // (Codex P2). Fail-loud: fetchDueQuestions/study-today try/catch'i 500'e cevirir,
  // questions/random ise 7-gun fallback'ine duser -- ikisi de bu throw'a hazir.
  if (error) throw error

  const eventsByQuestion = new Map<string, ReviewEvent[]>()
  for (const row of historyRows ?? []) {
    const list = eventsByQuestion.get(row.question_id as string) ?? []
    list.push({ isCorrect: row.is_correct as boolean, answeredAt: row.answered_at as string })
    eventsByQuestion.set(row.question_id as string, list)
  }

  const now = new Date()
  for (const [questionId, events] of eventsByQuestion) {
    const card = foldQuestionCard(events)
    result.set(questionId, { isDue: isCardDue(card, now), dueAt: card.due.toISOString() })
  }
  return result
}
