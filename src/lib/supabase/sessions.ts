'use client'

import { createClient } from '@/lib/supabase/client'
import type { GameType } from '@/types/database'
import type { AnswerRecord } from '@/stores/quiz-store'

interface SaveSessionParams {
  userId: string
  game: GameType
  mode: string
  answers: AnswerRecord[]
  totalXP: number
  maxStreak: number
  category?: string | null
  difficulty?: number | null
}

/**
 * Oyun oturumunu Supabase'e kaydeder:
 * 1. game_sessions INSERT (status='active')
 * 2. session_answers INSERT (toplu)
 * 3. game_sessions UPDATE → status='completed'
 *    → Bu trigger'lar tetikler: leaderboard_weekly, streak, profil istatistikleri
 * 4. xp_log INSERT
 *    → Bu trigger profili gunceller: total_xp + level hesaplama
 *
 * Hata durumunda null dondurur, client tarafinda hata gosterilmez.
 */
export async function saveGameSession({
  userId,
  game,
  mode,
  answers,
  totalXP,
  maxStreak,
  category,
  difficulty,
}: SaveSessionParams): Promise<string | null> {
  const supabase = createClient()

  const correctCount = answers.filter(a => a.isCorrect).length
  const wrongCount = answers.filter(a => !a.isCorrect).length
  const totalTime = answers.reduce((sum, a) => sum + a.timeTaken, 0)
  const avgTime = answers.length > 0 ? totalTime / answers.length : 0
  const baseXP = Math.floor(totalXP * 0.7)
  const bonusXP = totalXP - baseXP

  // 1. INSERT game_sessions (status='active')
  const { data: session, error: sessionError } = await supabase
    .from('game_sessions')
    .insert({
      user_id: userId,
      game,
      mode,
      status: 'active',
      total_questions: answers.length,
      correct_count: correctCount,
      wrong_count: wrongCount,
      skipped_count: 0,
      base_xp: baseXP,
      bonus_xp: bonusXP,
      total_xp: totalXP,
      time_spent_sec: Math.round(totalTime),
      avg_time_sec: Math.round(avgTime * 10) / 10,
      streak_at_start: 0,
      filter_category: category || null,
      filter_difficulty: difficulty || null,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    console.error('[saveGameSession] Oturum INSERT hatasi:', sessionError?.message)
    return null
  }

  const sessionId = session.id

  // 2. INSERT session_answers (toplu)
  // DB trigger: update_question_stats → questions istatistik + user_question_history
  const answerRows = answers.map((a, i) => ({
    session_id: sessionId,
    question_id: a.questionId,
    user_id: userId,
    selected_option: a.selectedOption >= 0 ? a.selectedOption : null,
    is_correct: a.isCorrect,
    is_skipped: a.selectedOption < 0,
    time_taken_sec: Math.round(a.timeTaken * 10) / 10,
    is_fast: a.timeTaken < 10,
    xp_earned: a.xpEarned,
    question_order: i,
  }))

  const { error: answersError } = await supabase
    .from('session_answers')
    .insert(answerRows)

  if (answersError) {
    console.error('[saveGameSession] Cevap INSERT hatasi:', answersError.message)
    // Devam et — trigger sorunu olabilir, oturum yine de kaydedildi
  }

  // 3. UPDATE game_sessions status = 'completed'
  // DB trigger: update_weekly_leaderboard → leaderboard + streak + profil stats
  const { error: completeError } = await supabase
    .from('game_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', sessionId)

  if (completeError) {
    console.error('[saveGameSession] Oturum UPDATE hatasi:', completeError.message)
  }

  // 4. INSERT xp_log
  // DB trigger: apply_xp_to_profile → total_xp guncelle + seviye hesapla
  if (totalXP > 0) {
    const { error: xpError } = await supabase
      .from('xp_log')
      .insert({
        user_id: userId,
        amount: totalXP,
        reason: 'session_complete',
        reference_id: sessionId,
      })

    if (xpError) {
      console.error('[saveGameSession] XP log INSERT hatasi:', xpError.message)
    }
  }

  return sessionId
}
