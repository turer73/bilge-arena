import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST: Tamamlanan görevin XP ödülünü al
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const { questId } = await request.json()

  if (!questId) {
    return NextResponse.json({ error: 'questId gerekli' }, { status: 400 })
  }

  // Görevi kontrol et
  const { data: uq } = await supabase
    .from('user_daily_quests')
    .select('*, quest:daily_quests(*)')
    .eq('id', questId)
    .eq('user_id', user.id)
    .single()

  if (!uq) {
    return NextResponse.json({ error: 'Gorev bulunamadi' }, { status: 404 })
  }

  if (!uq.is_completed) {
    return NextResponse.json({ error: 'Gorev henuz tamamlanmadi' }, { status: 400 })
  }

  if (uq.xp_claimed) {
    return NextResponse.json({ error: 'XP zaten alindi' }, { status: 400 })
  }

  const xpReward = uq.quest?.xp_reward ?? 50

  // 1) XP claimed olarak işaretle
  await supabase
    .from('user_daily_quests')
    .update({ xp_claimed: true })
    .eq('id', questId)

  // 2) XP log'a ekle
  await supabase
    .from('xp_log')
    .insert({
      user_id: user.id,
      amount: xpReward,
      reason: 'daily_quest',
      details: { quest_slug: uq.quest?.slug },
    })

  // 3) Profildeki XP'yi güncelle
  await supabase.rpc('increment_xp', {
    p_user_id: user.id,
    p_amount: xpReward,
  }).then(({ error }) => {
    // RPC yoksa fallback
    if (error) {
      return supabase
        .from('profiles')
        .update({ total_xp: (uq as unknown as { profile_xp: number }).profile_xp + xpReward })
        .eq('id', user.id)
    }
  })

  return NextResponse.json({ success: true, xp_earned: xpReward })
}
