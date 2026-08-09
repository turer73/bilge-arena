import type { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  foldQuestionCard,
  getCardRetrievability,
  isCardDue,
  restoreQuestionCard,
  type ReviewEvent,
} from './fsrs'
import { getPersistentFsrsReadRollout } from './fsrs-rollout'

export type ReviewCardState = 'new' | 'learning' | 'review' | 'relearning'

export interface DueInfo {
  isDue: boolean
  dueAt: string
  stability: number
  difficulty: number
  retrievability: number
  state: ReviewCardState
  reps: number
  source: 'persistent' | 'fold'
}

const STATE_LABELS: ReviewCardState[] = ['new', 'learning', 'review', 'relearning']

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

function toDueInfo(
  card: ReturnType<typeof foldQuestionCard>,
  now: Date,
  source: DueInfo['source'],
): DueInfo {
  return {
    isDue: isCardDue(card, now),
    dueAt: card.due.toISOString(),
    stability: roundMetric(card.stability),
    difficulty: roundMetric(card.difficulty),
    retrievability: roundMetric(getCardRetrievability(card, now)),
    state: STATE_LABELS[card.state] ?? 'new',
    reps: card.reps,
    source,
  }
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

  const uniqueQuestionIds = Array.from(new Set(questionIds))
  const now = new Date()
  let foldQuestionIds = uniqueQuestionIds

  if (getPersistentFsrsReadRollout(userId).enabled) {
    const { data: cardRows, error: cardError } = await admin
      .from('review_cards')
      .select('question_id, due_at, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review_at')
      .eq('user_id', userId)
      .in('question_id', uniqueQuestionIds)

    if (cardError) throw cardError

    for (const row of cardRows ?? []) {
      if (!Number.isInteger(row.state) || row.state < 0 || row.state > 3) continue
      const card = restoreQuestionCard({
        dueAt: row.due_at,
        stability: Number(row.stability),
        difficulty: Number(row.difficulty),
        elapsedDays: row.elapsed_days,
        scheduledDays: row.scheduled_days,
        reps: row.reps,
        lapses: row.lapses,
        learningSteps: row.learning_steps,
        state: row.state as 0 | 1 | 2 | 3,
        lastReviewAt: row.last_review_at,
      })
      result.set(row.question_id, toDueInfo(card, now, 'persistent'))
    }

    // Backfill eksigi sessizce "due degil" sayilmaz. Yalniz eksik kartlar
    // mevcut history-fold yolundan hesaplanir.
    foldQuestionIds = uniqueQuestionIds.filter((questionId) => !result.has(questionId))
    if (foldQuestionIds.length === 0) return result
  }

  const { data: historyRows, error } = await admin
    .from('session_answers')
    .select('question_id, is_correct, is_skipped, answered_at')
    .eq('user_id', userId)
    .in('question_id', foldQuestionIds)
    .or('is_skipped.eq.false,is_skipped.is.null')
    .order('answered_at', { ascending: true })

  // Transient okuma hatasini YUTMA: bos map "due yok" gibi gorunur ve cagiran
  // (gunluk plan) yarim/yanlis snapshot'i tum TR-gunu boyunca persist eder
  // (Codex P2). Fail-loud: fetchDueQuestions/study-today try/catch'i 500'e cevirir,
  // questions/random ise 7-gun fallback'ine duser -- ikisi de bu throw'a hazir.
  if (error) throw error

  const eventsByQuestion = new Map<string, ReviewEvent[]>()
  for (const row of historyRows ?? []) {
    if (row.is_skipped) continue
    const list = eventsByQuestion.get(row.question_id as string) ?? []
    list.push({ isCorrect: row.is_correct as boolean, answeredAt: row.answered_at as string })
    eventsByQuestion.set(row.question_id as string, list)
  }

  for (const [questionId, events] of eventsByQuestion) {
    const card = foldQuestionCard(events)
    result.set(questionId, toDueInfo(card, now, 'fold'))
  }
  return result
}
