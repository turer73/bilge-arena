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

  // 2) XP log
  await svc.from('xp_log').insert({
    user_id: user.id,
    amount: xpReward,
    reason: 'daily_quest',
    details: { quest_slug: (uq.quest as { slug?: string } | null)?.slug },
  })

  // 3) Profil XP guncelle
  const { error: rpcError } = await svc.rpc('increment_xp', { p_user_id: user.id, p_amount: xpReward })
  if (rpcError) {
    const { data: prof } = await svc.from('profiles').select('total_xp').eq('id', user.id).single()
    if (prof) {
      await svc.from('profiles').update({ total_xp: (prof.total_xp ?? 0) + xpReward }).eq('id', user.id)
    }
  }

  return NextResponse.json({ success: true, xp_earned: xpReward })
}
