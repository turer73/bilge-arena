import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { BADGES, checkBadgeEarned } from '@/lib/constants/badges'
import { createRateLimiter } from '@/lib/utils/rate-limit'

const badgesGetLimiter = createRateLimiter('badges-get', 30, 60_000)  // 30 req/dk
const badgesPostLimiter = createRateLimiter('badges-check', 5, 60_000)  // 5 req/dk (oyun sonu trigger)

// GET: Kullanıcının kazanılmış rozetlerini getir
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await badgesGetLimiter.check(user.id)
  if (!rl.success) {
    return NextResponse.json({ error: 'Cok fazla istek' }, { status: 429 })
  }

  // Kazanılmış rozetleri al
  const svcRead = createServiceRoleClient()
  const { data: earned } = await svcRead
    .from('user_achievements')
    .select('achievement_id, earned_at')
    .eq('user_id', user.id)

  const earnedCodes = new Set((earned ?? []).map((e: { achievement_id: string }) => e.achievement_id))

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

  const rlPost = await badgesPostLimiter.check(user.id)
  if (!rlPost.success) {
    return NextResponse.json({ error: 'Cok fazla istek' }, { status: 429 })
  }

  const svc = createServiceRoleClient()

  // Kullanıcı istatistiklerini al (Faz 3: multiplayer sayaclari)
  const { data: profile } = await svc
    .from('profiles')
    .select('total_xp, total_sessions, correct_answers, longest_streak, current_streak, multiplayer_wins, rooms_completed, multiplayer_firsts')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profil bulunamadi' }, { status: 404 })
  }

  // Tamamlanan günlük görev sayısını al
  const { count: dailyQuestsCount } = await svc
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
    // Art arda giriş serisi
    loginStreak: profile.current_streak ?? 0,
    // Faz 3 multiplayer
    multiplayerWins: profile.multiplayer_wins ?? 0,
    roomsCompleted: profile.rooms_completed ?? 0,
    multiplayerFirsts: profile.multiplayer_firsts ?? 0,
  }

  // Mevcut rozetleri al
  const { data: existingBadges } = await svc
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

  // Yeni rozetleri kaydet — award_badges RPC'si (atomik insert + XP ödülü, disc#1492)
  const badgeCodes = newBadges.map((b) => b.code)
  const { data: awardResult, error: awardErr } = await svc.rpc('award_badges', {
    p_user_id: user.id,
    p_badge_codes: badgeCodes,
  })

  if (awardErr) {
    console.error('[Badges API] award_badges RPC hatası:', awardErr)
    return NextResponse.json({ error: 'Rozet kaydedilemedi' }, { status: 500 })
  }

  const awardedCodes = awardResult?.[0]?.awarded_codes ?? []
  const totalXPEarned = awardResult?.[0]?.total_xp_earned ?? 0

  // XP log artık increment_xp içinde yazılıyor (tek satır, reason='badge_earned')

  return NextResponse.json({
    newBadges: awardedCodes.map((code: string) => {
      const badge = newBadges.find((b) => b.code === code)
      return badge ? { code: badge.code, name: badge.name, icon: badge.icon, xpReward: badge.xpReward } : null
    }).filter(Boolean),
    totalXPEarned,
  })
}
