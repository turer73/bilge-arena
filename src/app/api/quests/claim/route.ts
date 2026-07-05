import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { questClaimSchema } from '@/lib/validations/schemas'

const claimLimiter = createRateLimiter('quest-claim', 10, 60_000)

// POST: Tamamlanan görevin XP ödülünü al
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await claimLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Çok hızlı istek' }, { status: 429 })

  const body = await request.json()
  const parsed = questClaimSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'questId gerekli' }, { status: 400 })
  }
  const { questId } = parsed.data

  const svc = createServiceRoleClient()

  const { data: uq } = await svc
    .from('user_daily_quests')
    .select('*, quest:daily_quests(*)')
    .eq('id', questId)
    .eq('user_id', user.id)
    .single()

  if (!uq) return NextResponse.json({ error: 'Görev bulunamadı' }, { status: 404 })
  if (!uq.is_completed) return NextResponse.json({ error: 'Görev henüz tamamlanmadı' }, { status: 400 })
  if (uq.xp_claimed) return NextResponse.json({ error: 'XP zaten alındı' }, { status: 400 })

  const xpReward = (uq.quest as { xp_reward?: number } | null)?.xp_reward ?? 50

  // 1) Atomic claim guard
  const { data: claimed } = await svc
    .from('user_daily_quests')
    .update({ xp_claimed: true })
    .eq('id', questId)
    .eq('xp_claimed', false)
    .select('id')

  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: 'XP zaten alındı' }, { status: 400 })
  }

  // 2) Profil XP + seviye + ledger — increment_xp icinde atomik
  const { error: rpcError } = await svc.rpc('increment_xp', { p_user_id: user.id, p_amount: xpReward, p_reason: 'daily_quest' })
  if (rpcError) {
    const { data: prof } = await svc.from('profiles').select('total_xp').eq('id', user.id).single()
    if (prof) {
      await svc.from('profiles').update({ total_xp: (prof.total_xp ?? 0) + xpReward }).eq('id', user.id)
    }
  }

  // 4) Görev tamamlama coin ödülü: XP ödülünün %20'si (min 5, max 25)
  // Fix: await edilmeliydi — fire-and-forget `.then()` ile coin RPC hata verse de
  // yanit success + coins_earned donuyordu (kullanici coin almadan aldi saniyordu).
  const coinReward = Math.max(5, Math.min(25, Math.round(xpReward * 0.2)))
  const { error: coinError } = await svc.rpc('increment_coins', { p_user_id: user.id, p_amount: coinReward })
  if (coinError) {
    console.error('[QuestClaim] increment_coins hatası:', coinError.message)
  }

  return NextResponse.json({
    success: true,
    xp_earned: xpReward,
    coins_earned: coinError ? 0 : coinReward,
  })
}
