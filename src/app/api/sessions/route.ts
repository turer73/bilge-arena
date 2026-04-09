import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

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

  // Service role client — RLS bypass (tum INSERT/UPDATE islemleri icin)
  const svc = createServiceRoleClient()

  // 1. INSERT game_sessions
  const { data: session, error: sessionError } = await svc
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

  await svc.from('session_answers').insert(answerRows)

  // 3. UPDATE game_sessions status = 'completed'
  await svc
    .from('game_sessions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', sessionId)

  // 4. INSERT xp_log (trigger profili gunceller)
  if (totalXP > 0) {
    await svc.from('xp_log').insert({
      user_id: user.id,
      amount: totalXP,
      reason: 'session_complete',
      reference_id: sessionId,
    })
  }

  // 5. Profil istatistiklerini guncelle — RPC ile atomik
  const { error: xpError } = await svc.rpc('increment_xp', { p_user_id: user.id, p_amount: totalXP })
  if (xpError) {
    console.error('[Sessions API] increment_xp RPC hatasi:', xpError.message)
    // Fallback: profil total'lerini session toplamlarindan hesapla
    const { data: sessions } = await svc
      .from('game_sessions')
      .select('total_xp, correct_count, total_questions')
      .eq('user_id', user.id)
      .eq('status', 'completed')
    if (sessions) {
      const totals = sessions.reduce((acc, s) => ({
        xp: acc.xp + (s.total_xp || 0),
        correct: acc.correct + (s.correct_count || 0),
        total: acc.total + (s.total_questions || 0),
      }), { xp: 0, correct: 0, total: 0 })
      await svc.from('profiles').update({
        total_xp: totals.xp,
        correct_answers: totals.correct,
        total_questions: totals.total,
        total_sessions: sessions.length,
      }).eq('id', user.id)
    }
  }

  // 6. Gunluk gorevleri guncelle
  try {
    const today = new Date().toISOString().split('T')[0]
    const accuracy = answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0
    const { data: userQuests } = await svc
      .from('user_daily_quests')
      .select('*, quest:daily_quests(*)')
      .eq('user_id', user.id)
      .eq('date', today)
      .eq('is_completed', false)

    if (userQuests && userQuests.length > 0) {
      for (const uq of userQuests) {
        const quest = uq.quest as { quest_type: string; target_value: number; target_game?: string } | null
        if (!quest) continue

        let newValue = uq.current_value
        switch (quest.quest_type) {
          case 'play_sessions': newValue += 1; break
          case 'correct_answers': newValue += correctCount; break
          case 'streak_maintain': newValue = Math.max(newValue, maxStreak ?? streak); break
          case 'accuracy': newValue = Math.max(newValue, accuracy); break
          case 'specific_game': if (game === quest.target_game) newValue += 1; break
        }

        const isCompleted = newValue >= quest.target_value
        await svc.from('user_daily_quests').update({
          current_value: newValue,
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
        }).eq('id', uq.id)
      }
    }
  } catch (e) {
    console.error('[Sessions API] Quest update hatasi:', e)
  }

  // 7. Topic progress guncelle (adaptif zorluk icin)
  try {
    const { data: existingProgress } = await svc
      .from('user_topic_progress')
      .select('id, questions_seen, correct')
      .eq('user_id', user.id)
      .eq('game', game)
      .eq('category', category || '')
      .maybeSingle()

    if (existingProgress) {
      const newSeen = existingProgress.questions_seen + answers.length
      const newCorrect = existingProgress.correct + correctCount
      await svc.from('user_topic_progress').update({
        questions_seen: newSeen,
        correct: newCorrect,
        accuracy_pct: Math.round((newCorrect / newSeen) * 100),
      }).eq('id', existingProgress.id)
    } else if (category) {
      await svc.from('user_topic_progress').insert({
        user_id: user.id,
        game,
        category,
        questions_seen: answers.length,
        correct: correctCount,
        accuracy_pct: answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0,
      })
    }
  } catch (e) {
    console.error('[Sessions API] Topic progress hatasi:', e)
  }

  // 8. Rozet kontrolu — session tamamlaninca yeni rozetleri kontrol et
  let newBadges: string[] = []
  try {
    const { BADGES, checkBadgeEarned } = await import('@/lib/constants/badges')
    const { data: prof } = await svc.from('profiles')
      .select('total_xp, total_sessions, correct_answers, longest_streak')
      .eq('id', user.id).single()
    const { count: dqCount } = await svc.from('user_daily_quests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('is_completed', true)
    const { data: existing } = await svc.from('user_achievements')
      .select('achievement_id').eq('user_id', user.id)

    if (prof) {
      const stats = {
        gamesPlayed: prof.total_sessions ?? 0,
        correctAnswers: prof.correct_answers ?? 0,
        bestStreak: prof.longest_streak ?? 0,
        totalXP: prof.total_xp ?? 0,
        dailyQuestsCompleted: dqCount ?? 0,
      }
      const existingCodes = new Set((existing ?? []).map(b => b.achievement_id))
      const earned = BADGES.filter(b => !existingCodes.has(b.code) && checkBadgeEarned(b, stats))
      if (earned.length > 0) {
        await svc.from('user_achievements').insert(
          earned.map(b => ({ user_id: user.id, achievement_id: b.code, earned_at: new Date().toISOString() }))
        )
        newBadges = earned.map(b => b.code)
      }
    }
  } catch (e) {
    console.error('[Sessions API] Badge check hatasi:', e)
  }

  return NextResponse.json({
    sessionId,
    totalXP,
    correctCount,
    wrongCount,
    maxStreak: maxStreak ?? streak,
    newBadges,
  })
}
