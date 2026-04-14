import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'

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
  const { answers } = await req.json()

  if (!Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: 'Cevaplar gerekli' }, { status: 400 })
  }

  const svc = createServiceRoleClient()

  // Duelloyu bul
  const { data: challenge } = await svc
    .from('challenges')
    .select('*')
    .eq('id', id)
    .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
    .single()

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

  // Server-side dogrulama
  const questionIds = answers.map((a: { questionId: string }) => a.questionId)
  const { data: questions } = await svc
    .from('questions')
    .select('id, content, difficulty')
    .in('id', questionIds)

  const questionMap = new Map((questions || []).map(q => [q.id, q]))

  let correct = 0
  let totalTime = 0

  for (const a of answers as { questionId: string; selectedOption: number; timeTaken: number }[]) {
    const q = questionMap.get(a.questionId)
    if (!q) continue
    const content = q.content as { answer?: number; correct?: number }
    const correctIndex = content.answer ?? content.correct
    if (correctIndex === a.selectedOption) correct++
    totalTime += a.timeTaken || 0
  }

  const score = {
    correct,
    total: answers.length,
    time_sec: Math.round(totalTime),
    xp: correct * 20, // Basit XP hesaplama
  }

  // Skoru kaydet
  const updateField = isChallenger ? 'challenger_score' : 'opponent_score'
  await svc.from('challenges').update({ [updateField]: score }).eq('id', id)

  // Her iki taraf da cevapladiysa sonuclandir
  const otherScore = isChallenger ? challenge.opponent_score : challenge.challenger_score

  if (otherScore) {
    // Her ikisi de cevapladi — kazanani belirle
    const myScore = score
    const theirScore = otherScore as { correct: number; time_sec: number }

    let winnerId: string | null = null
    if (myScore.correct > theirScore.correct) {
      winnerId = user.id
    } else if (myScore.correct < theirScore.correct) {
      winnerId = isChallenger ? challenge.opponent_id : challenge.challenger_id
    } else {
      // Esitlik — daha hizli olan kazanir
      winnerId = myScore.time_sec < theirScore.time_sec ? user.id :
        (myScore.time_sec > theirScore.time_sec ? (isChallenger ? challenge.opponent_id : challenge.challenger_id) : null)
    }

    await svc.from('challenges').update({
      status: 'completed',
      winner_id: winnerId,
    }).eq('id', id)

    // Kazanana bonus XP
    if (winnerId) {
      await svc.rpc('increment_xp', { p_user_id: winnerId, p_amount: challenge.xp_reward })
      await svc.from('xp_log').insert({
        user_id: winnerId,
        amount: challenge.xp_reward,
        reason: 'challenge_win',
        reference_id: id,
      }).then(() => {})
    }

    return NextResponse.json({ score, result: 'completed', winnerId })
  }

  return NextResponse.json({ score, result: 'waiting_opponent' })
}
