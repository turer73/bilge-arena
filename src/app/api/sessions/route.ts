import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { sessionSubmitSchema } from '@/lib/validations/schemas'
import { FEATURES, FREE_DAILY_LIMIT } from '@/lib/constants/premium'
import { trDayStartUtcISO } from '@/lib/utils/tr-date'
import { z } from 'zod'
import { getFirstQuestionAttempt } from '@/lib/questions/attempt-store'
import { readVerifiedAttemptQuestionSnapshots } from '@/lib/verified-attempts'

// Replay korumasi: kullanici basina dk'da max 3 oturum
const sessionLimiter = createRateLimiter('session-submit', 3, 60_000)

// XP hesaplama — client'a guvenmeden server-side recalculate
const BASE_XP: Record<number, number> = { 1: 10, 2: 20, 3: 30, 4: 50, 5: 50 }
const completeSessionResultSchema = z.object({
  sessionId: z.string().min(1),
  totalXP: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  wrongCount: z.number().int().nonnegative(),
  alreadyProcessed: z.boolean(),
})

function serverCalculateXP(
  difficulty: number,
  currentStreak: number,
): number {
  const base = BASE_XP[difficulty] || 20
  const streakBonus = currentStreak >= 5 ? 10 : 0
  // Per-question duration comes from the client and remains useful analytics,
  // but must never influence rewards until server-side timing exists.
  return base + streakBonus
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
  const {
    attemptId,
    game,
    mode,
    answers: rawAnswers,
    category,
    difficulty: filterDifficulty,
    clientRequestId,
  } = parsed.data

  // P0 fix: ayni questionId birden fazla gonderilerek coin/XP farming'i onle.
  // Odul dongusu ham dizi uzerinde donuyordu (questionMap yalniz lookup) -> ayni
  // soru 100x gonderilince 100x coin. Soru basina en fazla 1 cevap say.
  const submittedAnswers = [...new Map(rawAnswers.map((a) => [a.questionId, a])).values()]

  // Service role client — RLS bypass (tum INSERT/UPDATE + limit-gate okumasi icin)
  const svc = createServiceRoleClient()

  // Gunluk quiz limiti feature acikken POST'ta da enforce edilir. UI ve server
  // ayni FEATURES.QUIZ_LIMIT kaynagini kullanir; kapali rollout'ta tamamlanmis
  // bir oturumun 403 ile sessizce kaybolmasina izin verilmez.
  if (FEATURES.QUIZ_LIMIT) {
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
  }

  // Grading and rewards use the immutable revision snapshot captured at issue
  // time. A later publish/quarantine can never change this attempt's key or XP.
  let snapshots
  try {
    snapshots = await readVerifiedAttemptQuestionSnapshots(svc, {
      attemptId,
      userId: user.id,
      requireActive: false,
    })
  } catch (error) {
    if ((error as Error).message === 'verified_attempt_snapshot_denied') {
      return NextResponse.json({ error: 'Deneme dogrulanamadi' }, { status: 403 })
    }
    console.error('[Sessions API] verified snapshot sorgu hatasi')
    return NextResponse.json({ error: 'Oturum kaydedilemedi' }, { status: 500 })
  }
  const snapshotMap = new Map(snapshots.map(snapshot => [snapshot.questionId, snapshot]))
  if (submittedAnswers.some(answer => !snapshotMap.has(answer.questionId))) {
    return NextResponse.json({ error: 'Sorular bulunamadi' }, { status: 400 })
  }
  // Streak XP has one server-canonical order: immutable issuance position.
  const answers = [...submittedAnswers].sort((left, right) => (
    (snapshotMap.get(left.questionId)?.position ?? 101)
    - (snapshotMap.get(right.questionId)?.position ?? 101)
  ))
  const questionIds = answers.map(answer => answer.questionId)
  const acceptedAttempts = new Map(await Promise.all(
    questionIds.map(async (questionId) => [
      questionId,
      await getFirstQuestionAttempt(`attempt:${attemptId}:user:${user.id}`, questionId),
    ] as const),
  ))

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
  }) => {
    const snapshot = snapshotMap.get(a.questionId)
    if (!snapshot) return null
    const correctIndex = snapshot.correctOption
    // Grade endpoint'inin sabitlediği İLK seçim otoriterdir. Client session
    // payload'ı doğru cevapla değiştirilse bile XP üretmez; grade edilmemiş
    // doğrudan session submit ise skip sayılır.
    const acceptedOption = acceptedAttempts.get(a.questionId) ?? -1
    const isActuallyCorrect = correctIndex === acceptedOption

    // Süresiz/practice ve denemede gerçek soru süresini koru. Zod üst sınırı
    // zaten 300 sn; timeLimit yalnız süre bonusunun eşiğidir.
    const safeTimeTaken = Math.min(Math.max(Number(a.timeTaken) || 0, 0), 300)

    let xpEarned = 0
    if (isActuallyCorrect) {
      streak++
      if (streak > maxStreak) maxStreak = streak
      correctCount++
      xpEarned = serverCalculateXP(
        snapshot.metadata.difficulty,
        streak,
      )
      totalXP += xpEarned
    } else {
      streak = 0
      wrongCount++
    }

    totalTime += safeTimeTaken

    return {
      question_id: a.questionId,
      user_id: user.id,
      selected_option: acceptedOption >= 0 ? acceptedOption : null,
      is_correct: isActuallyCorrect,
      is_skipped: acceptedOption < 0,
      time_taken_sec: Math.round(safeTimeTaken * 10) / 10,
      is_fast: safeTimeTaken < 10,
      xp_earned: xpEarned,
      question_order: snapshot.position - 1,
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
  const { data: rpcResult, error: rpcError } = await svc.rpc('complete_verified_game_session', {
    p_attempt_id: attemptId,
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

  const parsedRpcResult = completeSessionResultSchema.safeParse(rpcResult)
  if (rpcError || !parsedRpcResult.success) {
    console.error('[Sessions API] complete_verified_game_session RPC hatasi:', rpcError?.code)
    return NextResponse.json({ error: 'Oturum kaydedilemedi' }, { status: 500 })
  }

  const {
    sessionId,
    totalXP: persistedTotalXP,
    correctCount: persistedCorrectCount,
    wrongCount: persistedWrongCount,
    alreadyProcessed,
  } = parsedRpcResult.data
  // Migration 093, verified_attempt bind edilirken ayni transaction icinde gorev
  // ilerlemesini, rozetleri ve bunlarin odul ledger kayitlarini tamamlar. Route bu
  // alanlarda artik mutasyon yapmaz. Yalniz yeni tamamlamada, UI toast'i icin o
  // session'in kazandirdigi rozetleri salt-okuruz; replay yeniden bildirim uretmez.
  let newBadges: string[] = []
  if (!alreadyProcessed) {
    const { data: earnedBadges, error: badgeReadError } = await svc
      .from('user_achievements')
      .select('achievement_id')
      .eq('user_id', user.id)
      .eq('source_session_id', sessionId)
    if (badgeReadError) {
      console.error('[Sessions API] session badge read hatasi:', badgeReadError.code)
    } else {
      newBadges = (earnedBadges ?? [])
        .map((badge) => badge.achievement_id)
        .filter((code): code is string => typeof code === 'string')
    }
  }

  return NextResponse.json({
    sessionId,
    // Always return the transaction's persisted values. On an idempotent
    // replay these can intentionally differ from the current request body.
    totalXP: persistedTotalXP,
    correctCount: persistedCorrectCount,
    wrongCount: persistedWrongCount,
    maxStreak,
    newBadges,
  })
}
