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

  // 1) XP claimed olarak işaretle — atomic guard (race condition onleme)
  const { data: claimed, error: claimError } = await supabase
    .from('user_daily_quests')
    .update({ xp_claimed: true })
    .eq('id', questId)
    .eq('xp_claimed', false)  // sadece henuz claim edilmemisse guncelle
    .select('id')

  if (claimError || !claimed || claimed.length === 0) {
    return NextResponse.json({ error: 'XP zaten alindi' }, { status: 400 })
  }

  // 2) XP log'a ekle
  await supabase
    .from('xp_log')
    .insert({
      user_id: user.id,
      amount: xpReward,
      reason: 'daily_quest',
      details: { quest_slug: uq.quest?.slug },
    })

  // 3) Profildeki XP'yi güncelle (atomic RPC, fallback ile)
  const { error: rpcError } = await supabase.rpc('increment_xp', {
    p_user_id: user.id,
    p_amount: xpReward,
  })

  if (rpcError) {
    // RPC yoksa fallback: profili çek ve güncelle
    const { data: prof } = await supabase
      .from('profiles')
      .select('total_xp')
      .eq('id', user.id)
      .single()

    if (prof) {
      await supabase
        .from('profiles')
        .update({ total_xp: (prof.total_xp ?? 0) + xpReward })
        .eq('id', user.id)
    }
  }

  return NextResponse.json({ success: true, xp_earned: xpReward })
}
