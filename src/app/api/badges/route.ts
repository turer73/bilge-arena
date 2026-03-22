import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { BADGES, checkBadgeEarned } from '@/lib/constants/badges'

// GET: Kullanıcının kazanılmış rozetlerini getir
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  // Kazanılmış rozetleri al
  const { data: earned } = await supabase
    .from('user_achievements')
    .select('achievement_id, earned_at')
    .eq('user_id', user.id)

  const earnedCodes = new Set((earned ?? []).map((e) => e.achievement_id))

  return NextResponse.json({
    earned: earned ?? [],
    earnedCodes: Array.from(earnedCodes),
  })
}

// POST: Rozetleri kontrol et ve yenilerini kaydet
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  // Kullanıcı istatistiklerini al
  const { data: profile } = await supabase
    .from('profiles')
    .select('total_xp, total_sessions, correct_answers, longest_streak')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profil bulunamadi' }, { status: 404 })
  }

  // Tamamlanan günlük görev sayısını al
  const { count: dailyQuestsCount } = await supabase
    .from('user_daily_quests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_completed', true)

  const stats = {
    gamesPlayed: profile.total_sessions ?? 0,
    correctAnswers: profile.correct_answers ?? 0,
    bestStreak: profile.longest_streak ?? 0,
    totalXP: profile.total_xp ?? 0,
    dailyQuestsCompleted: dailyQuestsCount ?? 0,
  }

  // Mevcut rozetleri al
  const { data: existingBadges } = await supabase
    .from('user_achievements')
    .select('achievement_id')
    .eq('user_id', user.id)

  const existingCodes = new Set((existingBadges ?? []).map((b) => b.achievement_id))

  // Yeni kazanılan rozetleri bul
  const newBadges = BADGES.filter(
    (badge) => !existingCodes.has(badge.code) && checkBadgeEarned(badge, stats)
  )

  if (newBadges.length === 0) {
    return NextResponse.json({ newBadges: [], totalXPEarned: 0 })
  }

  // Yeni rozetleri kaydet
  const inserts = newBadges.map((badge) => ({
    user_id: user.id,
    achievement_id: badge.code,
    earned_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('user_achievements')
    .insert(inserts)

  if (error) {
    console.error('[Badges API] Insert error:', error)
    // Duplicate hatasını yoksay (zaten kazanılmış)
    if (!error.message.includes('duplicate')) {
      return NextResponse.json({ error: 'Rozet kaydedilemedi' }, { status: 500 })
    }
  }

  // Rozet XP ödüllerini topla ve profile ekle
  const totalXPEarned = newBadges.reduce((sum, b) => sum + b.xpReward, 0)

  if (totalXPEarned > 0) {
    await supabase
      .from('profiles')
      .update({ total_xp: (profile.total_xp ?? 0) + totalXPEarned })
      .eq('id', user.id)

    // XP log'a kaydet
    for (const badge of newBadges) {
      await supabase.from('xp_log').insert({
        user_id: user.id,
        amount: badge.xpReward,
        reason: 'badge_earned',
        reference_id: badge.code,
      })
    }
  }

  return NextResponse.json({
    newBadges: newBadges.map((b) => ({ code: b.code, name: b.name, icon: b.icon, xpReward: b.xpReward })),
    totalXPEarned,
  })
}
