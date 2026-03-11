import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { FREE_DAILY_LIMIT } from '@/lib/constants/premium'

/**
 * Günlük quiz limiti kontrol API'si.
 * Bugün kaç quiz oynandığını döner.
 *
 * Misafir → limit yok (localStorage'da sayılır)
 * Free    → 5/gün
 * Premium → sınırsız
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // Misafir kullanıcı — client-side kontrol
    return NextResponse.json({ limit: FREE_DAILY_LIMIT, used: 0, isPremium: false, isGuest: true })
  }

  // Premium kontrolü
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_premium, premium_until')
    .eq('id', user.id)
    .single()

  const isPremium = profile?.is_premium === true &&
    (!profile.premium_until || new Date(profile.premium_until) > new Date())

  if (isPremium) {
    return NextResponse.json({ limit: -1, used: 0, isPremium: true, isGuest: false })
  }

  // Bugünkü oturum sayısını hesapla
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('game_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', todayStart.toISOString())

  const used = count ?? 0

  return NextResponse.json({
    limit: FREE_DAILY_LIMIT,
    used,
    remaining: Math.max(0, FREE_DAILY_LIMIT - used),
    isPremium: false,
    isGuest: false,
  })
}
