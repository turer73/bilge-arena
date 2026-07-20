import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { sessionSubmitSchema } from '@/lib/validations/schemas'
import { FREE_DAILY_LIMIT } from '@/lib/constants/premium'
import { trDayString, trDayStartUtcISO } from '@/lib/utils/tr-date'

// Replay korumasi: kullanici basina dk'da max 3 oturum
const sessionLimiter = createRateLimiter('session-submit', 3, 60_000)

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

  // Replay korumasi: ayni kullanicidan dakikada max 3 oturum
  const rl = await sessionLimiter.check(user.id)
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Cok hizli oturum gonderimi. Lutfen bekleyin.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 20) } },
    )
  }

  const body = await request.json()
  const parsed = sessionSubmitSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Eksik veri' }, { status: 400 })
  }
  const { game, mode, answers: rawAnswers, category, difficulty: filterDifficulty, timeLimit, clientRequestId } = parsed.data

  // P0 fix: ayni questionId birden fazla gonderilerek coin/XP farming'i onle.
  // Odul dongusu ham dizi uzerinde donuyordu (questionMap yalniz lookup) -> ayni
  // soru 100x gonderilince 100x coin. Soru basina en fazla 1 cevap say.
  const answers = [...new Map(rawAnswers.map((a) => [a.questionId, a])).values()]

  // timeLimit zaten Zod ile 5-120 arasinda sinirli
  const safeTimeLimit = timeLimit

  // Service role client — RLS bypass (tum INSERT/UPDATE + limit-gate okumasi icin)
  const svc = createServiceRoleClient()

  // P1 fix: gunluk quiz limiti POST'ta da enforce edilir. Onceden yalniz GET
  // /api/quiz-limit'te hesaplaniyordu (gosterim); dogrudan POST bu limiti bypass
  // ediyordu. Sayim quiz-limit ile ayni semantik (bugun baslangici + created_at).
  const { data: limitProfile } = await svc
    .from('profiles')
    .select('is_premium, premium_until')
    .eq('id', user.id)
    .single()
  const isPremium = limitProfile?.is_premium === true &&
    (!limitProfile.premium_until || new Date(limitProfile.premium_until) > new Date())
  if (!isPremium) {
    // TR gun-siniri: limit-penceresi odul-gunu ile ayni boundary (quiz-limit GET
    // ile tutarli). Onceden setHours(0,0,0,0)=UTC-gece-yarisi idi -> limit TR 03:00
    // resetleniyordu, odul-gunu TR gece-yarisi (uyumsuzluk).
    const { count: todayCount } = await svc
      .from('game_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', trDayStartUtcISO())
    if ((todayCount ?? 0) >= FREE_DAILY_LIMIT) {
      return NextResponse.json(
        { error: 'Günlük quiz limitine ulaştın.', code: 'daily_limit' },
        { status: 403 },
      )
    }
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
  let maxStreak = 0
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

    // timeTaken sinirla: 0 ile timeLimit arasi (client manipulasyonunu onle)
    const safeTimeTaken = Math.min(Math.max(Number(a.timeTaken) || 0, 0), safeTimeLimit)

    let xpEarned = 0
    if (isActuallyCorrect) {
      streak++
      if (streak > maxStreak) maxStreak = streak
      correctCount++
      xpEarned = serverCalculateXP(question.difficulty, safeTimeTaken, safeTimeLimit, streak)
      totalXP += xpEarned
    } else {
      streak = 0
      wrongCount++
    }

    totalTime += safeTimeTaken

    return {
      question_id: a.questionId,
      user_id: user.id,
      selected_option: a.selectedOption >= 0 ? a.selectedOption : null,
      is_correct: isActuallyCorrect,
      is_skipped: a.selectedOption < 0,
      time_taken_sec: Math.round(safeTimeTaken * 10) / 10,
      is_fast: safeTimeTaken < 10,
      xp_earned: xpEarned,
      question_order: i,
    }
  }).filter((a): a is NonNullable<typeof a> => a !== null)

  const avgTime = answers.length > 0 ? totalTime / answers.length : 0
  const baseXP = Math.floor(totalXP * 0.7)
  const bonusXP = totalXP - baseXP

  // 1-5b. Atomik oturum-tamamlama (migration 081, konu#6 Faz-1 karari): session+answers+
  // question-stats+coin+XP+topic-progress TEK RPC'de, tek transaction — kismi hata
  // (eskiden: answers yazilir ama XP RPC'si network-hatasi alirsa tutarsizlik) artik
  // yapisal olarak imkansiz (RAISE EXCEPTION tum transaction'i geri alir). Idempotency:
  // clientRequestId ayni oturum-kaydetme denemesi (network-retry) icin sabit — ikinci
  // gelişte yeniden odul uretmez, ilk sonucu doner.
  const { data: rpcResult, error: rpcError } = await svc.rpc('complete_game_session', {
    p_user_id: user.id,
    p_client_request_id: clientRequestId,
    p_game: game,
    p_mode: mode,
    p_category: category || null,
    p_filter_difficulty: filterDifficulty || null,
    p_answers: verifiedAnswers.map(a => ({
      question_id: a.question_id,
      selected_option: a.selected_option,
      is_correct: a.is_correct,
      is_skipped: a.is_skipped,
      time_taken_sec: a.time_taken_sec,
      is_fast: a.is_fast,
      xp_earned: a.xp_earned,
      question_order: a.question_order,
    })),
    p_total_xp: totalXP,
    p_base_xp: baseXP,
    p_bonus_xp: bonusXP,
    p_correct_count: correctCount,
    p_wrong_count: wrongCount,
    p_time_spent_sec: Math.round(totalTime),
    p_avg_time_sec: Math.round(avgTime * 10) / 10,
  })

  if (rpcError || !rpcResult) {
    console.error('[Sessions API] complete_game_session RPC hatasi:', rpcError?.message)
    return NextResponse.json({ error: 'Oturum kaydedilemedi' }, { status: 500 })
  }

  const sessionId = rpcResult.sessionId as string
  // Idempotent replay (network-retry, migration 081): RPC odul-uretmedi, sadece ilk
  // sonucu dondurdu -- quest/badge de TEKRAR calistirilmamali (Vercel Agent Review
  // bulgusu, PR#271 — replay'de quest current_value'nun ikinci kez artmasi onleniyor).
  const alreadyProcessed = rpcResult.alreadyProcessed === true

  // 6. Gunluk gorevleri guncelle
  if (!alreadyProcessed) {
    try {
      const today = trDayString(new Date())
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
            case 'streak_maintain': newValue = Math.max(newValue, maxStreak); break
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
  }

  // 7. Topic progress artik complete_game_session RPC icinde atomik guncelleniyor
  // (migration 081 — accuracy_pct GENERATED ALWAYS kolonuna yazma bug'i da duzeldi).

  // 8. Rozet kontrolu — session tamamlaninca yeni rozetleri kontrol et
  let newBadges: string[] = []
  if (!alreadyProcessed) {
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
  }

  return NextResponse.json({
    sessionId,
    totalXP,
    correctCount,
    wrongCount,
    maxStreak,
    newBadges,
  })
}
