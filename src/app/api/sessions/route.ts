import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// XP hesaplama — client'a guvenmeden server-side recalculate
const BASE_XP: Record<number, number> = { 1: 10, 2: 20, 3: 30, 4: 50, 5: 50 }

function serverCalculateXP(
  difficulty: number,
  timeTaken: number,
  timeLimit: number,
  currentStreak: number
): number {
  const base = BASE_XP[difficulty] || 20
  const remainingSeconds = Math.max(0, timeLimit - timeTaken)
  const timeBonus = remainingSeconds >= 20 ? 5 : 0
  const streakBonus = currentStreak >= 5 ? 10 : 0
  return base + timeBonus + streakBonus
}

// POST: Oyun oturumunu kaydet (server-side XP hesaplama)
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const body = await request.json()
  const { game, mode, answers, maxStreak, category, difficulty: filterDifficulty, timeLimit = 30 } = body

  if (!game || !mode || !Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: 'Eksik veri' }, { status: 400 })
  }

  // Soru ID'lerini topla ve DB'den dogrula
  const questionIds = answers.map((a: { questionId: string }) => a.questionId)

  const { data: questions } = await supabase
    .from('questions')
    .select('id, content, difficulty')
    .in('id', questionIds)

  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: 'Sorular bulunamadi' }, { status: 400 })
  }

  const questionMap = new Map(questions.map(q => [q.id, q]))

  // Server-side XP hesaplama
  let totalXP = 0
  let streak = 0
  let correctCount = 0
  let wrongCount = 0
  let totalTime = 0

  const verifiedAnswers = answers.map((a: {
    questionId: string
    selectedOption: number
    isCorrect: boolean
    timeTaken: number
  }, i: number) => {
    const question = questionMap.get(a.questionId)
    if (!question) return null

    // Dogru cevabi DB'den kontrol et
    // TYT: content.answer, WordQuest: content.correct
    const content = question.content as { answer?: number; correct?: number }
    const correctIndex = content.answer ?? content.correct
    const isActuallyCorrect = correctIndex === a.selectedOption

    if (isActuallyCorrect) {
      streak++
      correctCount++
      const xp = serverCalculateXP(question.difficulty, a.timeTaken, timeLimit, streak)
      totalXP += xp
    } else {
      streak = 0
      wrongCount++
    }

    totalTime += a.timeTaken

    return {
      question_id: a.questionId,
      user_id: user.id,
      selected_option: a.selectedOption >= 0 ? a.selectedOption : null,
      is_correct: isActuallyCorrect,
      is_skipped: a.selectedOption < 0,
      time_taken_sec: Math.round(a.timeTaken * 10) / 10,
      is_fast: a.timeTaken < 10,
      xp_earned: isActuallyCorrect ? serverCalculateXP(question.difficulty, a.timeTaken, timeLimit, streak) : 0,
      question_order: i,
    }
  }).filter((a): a is NonNullable<typeof a> => a !== null)

  const avgTime = answers.length > 0 ? totalTime / answers.length : 0
  const baseXP = Math.floor(totalXP * 0.7)
  const bonusXP = totalXP - baseXP

  // 1. INSERT game_sessions
  const { data: session, error: sessionError } = await supabase
    .from('game_sessions')
    .insert({
      user_id: user.id,
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
      filter_difficulty: filterDifficulty || null,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    console.error('[Sessions API] Oturum INSERT hatasi:', sessionError?.message)
    return NextResponse.json({ error: 'Oturum kaydedilemedi' }, { status: 500 })
  }

  const sessionId = session.id

  // 2. INSERT session_answers
  const answerRows = verifiedAnswers.map((a) => ({
    ...a,
    session_id: sessionId,
  }))

  await supabase.from('session_answers').insert(answerRows)

  // 3. UPDATE game_sessions status = 'completed'
  await supabase
    .from('game_sessions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', sessionId)

  // 4. INSERT xp_log (trigger profili gunceller)
  if (totalXP > 0) {
    await supabase.from('xp_log').insert({
      user_id: user.id,
      amount: totalXP,
      reason: 'session_complete',
      reference_id: sessionId,
    })
  }

  return NextResponse.json({
    sessionId,
    totalXP,
    correctCount,
    wrongCount,
    maxStreak: maxStreak ?? streak,
  })
}
