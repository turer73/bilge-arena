import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Günlük giriş ödülü API'si.
 *
 * Her gün ilk girişte artan XP verir:
 *   Gün 1: 10 XP, Gün 2: 20 XP ... Gün 7+: 70 XP (max)
 *
 * Dönüş:
 *   - already_claimed: Bugün zaten giriş ödülü alınmış
 *   - claimed: XP verildi
 *   - streak_reset: Seri kırıldı, 1'den başladı
 */
export async function POST() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Profili çek
  const { data: profile } = await supabase
    .from('profiles')
    .select('current_streak, last_played_at, total_xp')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 404 })
  }

  const now = new Date()
  const todayStr = now.toISOString().split('T')[0] // YYYY-MM-DD

  // Son oynanma tarihini kontrol et
  const lastPlayed = profile.last_played_at
    ? new Date(profile.last_played_at)
    : null

  const lastPlayedStr = lastPlayed
    ? lastPlayed.toISOString().split('T')[0]
    : null

  // Bugün zaten giriş yapılmış mı?
  if (lastPlayedStr === todayStr) {
    return NextResponse.json({
      status: 'already_claimed',
      streak: profile.current_streak,
      xpAwarded: 0,
    })
  }

  // Dünkü tarih kontrolü — seri devam mı, kırıldı mı?
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  let newStreak: number
  let streakReset = false

  if (lastPlayedStr === yesterdayStr) {
    // Dün de giriş yapılmış — seri devam
    newStreak = profile.current_streak + 1
  } else {
    // Seri kırıldı veya ilk giriş
    newStreak = 1
    if (profile.current_streak > 0) {
      streakReset = true
    }
  }

  // XP hesapla: gün * 10, max 70
  const xpReward = Math.min(newStreak * 10, 70)

  // Profili güncelle
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      current_streak: newStreak,
      last_played_at: now.toISOString(),
      total_xp: (profile.total_xp || 0) + xpReward,
    })
    .eq('id', user.id)

  if (updateError) {
    console.error('[DailyLogin] Güncelleme hatası:', updateError)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  // XP log'a kaydet
  await supabase.from('xp_log').insert({
    user_id: user.id,
    amount: xpReward,
    source: 'daily_login',
  }).then(() => {})

  return NextResponse.json({
    status: streakReset ? 'streak_reset' : 'claimed',
    streak: newStreak,
    xpAwarded: xpReward,
    maxXP: 70,
  })
}
