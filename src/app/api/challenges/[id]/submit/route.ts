import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { challengeSubmitSchema } from '@/lib/validations/schemas'
import { dbErrorResponse } from '@/lib/utils/api-error'
import { isValidUuid } from '@/lib/utils/uuid'
import { loadPlayableChallengeQuestions } from '@/lib/challenges/playable-questions'

const submitLimiter = createRateLimiter('challenge-submit', 5, 60_000)

const RPC_ERROR_RESPONSES: Record<string, { status: number; message: string }> = {
  not_found: { status: 404, message: 'Duello bulunamadi' },
  not_participant: { status: 403, message: 'Bu duelloya katilimci degilsiniz' },
  already_completed: { status: 400, message: 'Duello zaten tamamlanmis' },
  already_submitted: { status: 400, message: 'Zaten cevap gonderilmis' },
  expired: { status: 400, message: 'Duellonun suresi dolmus' },
  invalid_score: { status: 400, message: 'Cevaplar duellonun sorulariyla eslesmiyor' },
}

interface SubmitRpcResult {
  ok: boolean
  error?: string
  result?: 'waiting_opponent' | 'completed'
  winnerId?: string | null
  xpAwarded?: number
  score?: { correct: number; total: number; time_sec: number | null; xp: number }
}

/**
 * POST /api/challenges/[id]/submit — Duello cevaplarini gonder
 * Body: { answers: [{ questionId, selectedOption }] }
 *
 * Butunluk (disc #2530):
 * - Cevaplar duellonun oynanabilir soru kumesini (GET ile ayni:
 *   loadPlayableChallengeQuestions) birebir karsilamali; eksik, fazla,
 *   tekrar eden veya yabanci soru 400 doner. Skor yalniz bu sorulardan,
 *   sunucudaki cevap anahtariyla hesaplanir.
 * - Istemcinin gonderdigi sure ve isCorrect yok sayilir. Sureyi
 *   submit_challenge_answer, katilimcinin sorulari ilk actigi andan olcer.
 * - Sure dolumu, eszamanli gonderim ve XP tavani RPC icinde, duello satiri
 *   kilitliyken uygulanir.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const rl = await submitLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const { id } = await params
  if (!id || !isValidUuid(id)) {
    return NextResponse.json({ error: 'id gecersiz' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = challengeSubmitSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Cevaplar gerekli' }, { status: 400 })
  }
  const { answers } = parsed.data

  const svc = createServiceRoleClient()

  // H-150-4: .single() → .maybeSingle() — sorgu hatalarini gizlemez
  const { data: challenge, error: cErr } = await svc
    .from('challenges')
    .select('*')
    .eq('id', id)
    .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
    .maybeSingle()

  if (cErr) {
    console.error('[/api/challenges/[id]/submit POST] query error:', cErr.code)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  if (!challenge) {
    return NextResponse.json({ error: 'Duello bulunamadi' }, { status: 404 })
  }

  if (challenge.status !== 'accepted' && challenge.status !== 'pending') {
    return NextResponse.json({ error: 'Duello zaten tamamlanmis' }, { status: 400 })
  }

  const isChallenger = challenge.challenger_id === user.id
  const existingScore = isChallenger ? challenge.challenger_score : challenge.opponent_score
  if (existingScore) {
    return NextResponse.json({ error: 'Zaten cevap gonderilmis' }, { status: 400 })
  }

  // Oynanabilir soru kumesi GET ile ayni yardimcidan gelir: bankada hala
  // bulunan ve icerigi gecerli sorular. Oyuncu gormedigi soruya cevap vermez.
  const challengeQuestionIds: string[] = Array.isArray(challenge.question_ids) ? challenge.question_ids : []
  const playable = await loadPlayableChallengeQuestions(svc, challengeQuestionIds)
  if (playable.error) {
    console.error('[/api/challenges/[id]/submit POST] questions query error:', playable.error.code)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  // Cevap kumesi oynanabilir soru kumesiyle birebir ayni olmali.
  const answerKey = new Map(playable.questions.map((q) => [q.id, q.content.answer] as const))
  const answered = new Set(answers.map((a) => a.questionId))
  const exactSet = answerKey.size > 0
    && answered.size === answers.length
    && answered.size === answerKey.size
    && answers.every((a) => answerKey.has(a.questionId))
  if (!exactSet) {
    return NextResponse.json(
      { error: 'Cevaplar duellonun sorulariyla eslesmiyor' },
      { status: 400 },
    )
  }

  const correct = answers.reduce(
    (sum, a) => sum + (answerKey.get(a.questionId) === a.selectedOption ? 1 : 0),
    0,
  )

  const score = {
    correct,
    total: answerKey.size,
    xp: correct * 20,
  }

  // Atomik submit: skor yazma + kazanan + XP tavani tek transaction'da,
  // duello satiri FOR UPDATE kilitli. Sure sunucuda hesaplanir.
  const { data: rpcData, error: rpcError } = await svc.rpc('submit_challenge_answer', {
    p_challenge_id: id,
    p_user_id: user.id,
    p_score: score,
  })

  if (rpcError) {
    return dbErrorResponse('challenges/[id]/submit rpc', rpcError)
  }

  const result = rpcData as SubmitRpcResult | null
  if (!result?.ok) {
    const mapped = RPC_ERROR_RESPONSES[result?.error ?? '']
    return NextResponse.json(
      { error: mapped?.message ?? 'Cevaplar kaydedilemedi' },
      { status: mapped?.status ?? 400 },
    )
  }

  return NextResponse.json({
    score: result.score ?? { ...score, time_sec: null },
    result: result.result,
    winnerId: result.winnerId ?? null,
    // Migration 20261016190000 oncesi RPC xpAwarded dondurmez; istemci o durumda
    // duellonun xp_reward degerine duser.
    xpAwarded: typeof result.xpAwarded === 'number' ? result.xpAwarded : null,
  })
}
