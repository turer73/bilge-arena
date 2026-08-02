import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { challengeSubmitSchema } from '@/lib/validations/schemas'
import { dbErrorResponse } from '@/lib/utils/api-error'
import type { TablesUpdate } from '@/types/database.generated'

const submitLimiter = createRateLimiter('challenge-submit', 5, 60_000)

/**
 * POST /api/challenges/[id]/submit — Duello cevaplarini gonder
 * Body: { answers: [{ questionId, selectedOption, isCorrect, timeTaken }] }
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
  const body = await req.json()
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

  // Skor hesapla
  const isChallenger = challenge.challenger_id === user.id
  const existingScore = isChallenger ? challenge.challenger_score : challenge.opponent_score

  if (existingScore) {
    return NextResponse.json({ error: 'Zaten cevap gonderilmis' }, { status: 400 })
  }

  // Server-side dogrulama. Dedup: ayni questionId birden fazla gonderilerek
  // skor sisirmeyi onle (sessions P0 ile ayni sinif) — soru basi 1 cevap.
  const uniqueAnswers = [...new Map(
    (answers as { questionId: string; selectedOption: number; timeTaken: number }[])
      .map((a) => [a.questionId, a]),
  ).values()]
  const questionIds = uniqueAnswers.map((a) => a.questionId)
  const { data: questions } = await svc
    .from('questions')
    .select('id, content, difficulty')
    .in('id', questionIds)

  const questionMap = new Map((questions || []).map(q => [q.id, q]))

  let correct = 0
  let totalTime = 0

  for (const a of uniqueAnswers) {
    const q = questionMap.get(a.questionId)
    if (!q) continue
    const content = q.content as { answer?: number; correct?: number }
    const correctIndex = content.answer ?? content.correct
    if (correctIndex === a.selectedOption) correct++
    totalTime += a.timeTaken || 0
  }

  const score = {
    correct,
    total: uniqueAnswers.length,
    time_sec: Math.round(totalTime),
    xp: correct * 20, // Basit XP hesaplama
  }

  // Atomik submit (mig 077): skor-yaz + kazanan-belirle + XP tek transaction,
  // challenge satiri FOR UPDATE kilitli -> eszamanli-submit race kok-cozumu.
  const { data: rpcData, error: rpcError } = await svc.rpc('submit_challenge_answer', {
    p_challenge_id: id,
    p_user_id: user.id,
    p_score: score,
  })

  // Deploy-sirasi guvenligi: mig 077 henuz uygulanmadiysa (RPC yok) eski
  // non-atomik yola dus — merge-before-migration'da duello kirilmasin. Migration
  // gelince atomik yol otomatik devreye girer.
  if (rpcError && (rpcError.code === 'PGRST202' || rpcError.code === '42883')) {
    // Computed key ({ [updateField]: score }) TS'te index-signature'a genisliyor
    // ve supabase-js'in update tipi bunu reddediyor; iki ayri literal daha dar.
    const scorePatch: TablesUpdate<'challenges'> = isChallenger
      ? { challenger_score: score }
      : { opponent_score: score }
    await svc.from('challenges').update(scorePatch).eq('id', id)

    const otherScore = isChallenger ? challenge.opponent_score : challenge.challenger_score
    if (otherScore) {
      const theirScore = otherScore as { correct: number; time_sec: number }
      let winnerId: string | null = null
      if (score.correct > theirScore.correct) {
        winnerId = user.id
      } else if (score.correct < theirScore.correct) {
        winnerId = isChallenger ? challenge.opponent_id : challenge.challenger_id
      } else {
        winnerId = score.time_sec < theirScore.time_sec ? user.id :
          (score.time_sec > theirScore.time_sec ? (isChallenger ? challenge.opponent_id : challenge.challenger_id) : null)
      }
      await svc.from('challenges').update({ status: 'completed', winner_id: winnerId }).eq('id', id)
      if (winnerId) {
        await svc.rpc('increment_xp', { p_user_id: winnerId, p_amount: challenge.xp_reward, p_reason: 'challenge_win', p_reference_id: id })
      }
      return NextResponse.json({ score, result: 'completed', winnerId })
    }
    return NextResponse.json({ score, result: 'waiting_opponent' })
  }

  if (rpcError) {
    return dbErrorResponse('challenges/[id]/submit rpc', rpcError)
  }

  const result = rpcData as { ok: boolean; error?: string; result?: string; winnerId?: string | null }
  if (!result?.ok) {
    const statusMap: Record<string, number> = {
      not_found: 404, not_participant: 403, already_completed: 400, already_submitted: 400,
    }
    return NextResponse.json(
      { error: result?.error ?? 'submit_failed' },
      { status: statusMap[result?.error ?? ''] ?? 400 },
    )
  }

  return NextResponse.json({ score, result: result.result, winnerId: result.winnerId ?? null })
}
