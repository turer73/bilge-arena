import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendPushNotification } from '@/lib/utils/push'

const CRON_SECRET = process.env.CRON_SECRET

/**
 * GET /api/cron/daily-streak-reminder
 * Streak kaybetme riskindeki kullanicilara push hatirlatma gonderir.
 * Vercel Cron tarafindan tetiklenir (her gun 18:00 UTC, TR 21:00).
 *
 * Hedef kitle: dun oynamis (last_played_at = bugun - 1 gun) ama bugun
 *              henuz oynamamis kullanicilar — streak >= 1.
 *
 * Guvenlik: CRON_SECRET header'i gerekli (weekly-digest paterni).
 */
export async function GET(req: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET ayarlanmamis' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  // RLS bypass icin service-role client (Codex P1 fix): cron context'te
  // auth.uid() NULL — anon-key client push_subscriptions.push_own RLS'i
  // gecemez (USING auth.uid() = user_id). Service-role RLS bypass eder.
  const supabase = createServiceRoleClient()

  // Dun (UTC) baslangici + bugun (UTC) baslangici — date range ile filtre
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setUTCHours(0, 0, 0, 0)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setUTCDate(todayStart.getUTCDate() - 1)

  // Streak >= 1 + dun oynamis + bugun oynamamis profiller
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, current_streak')
    .gte('current_streak', 1)
    .gte('last_played_at', yesterdayStart.toISOString())
    .lt('last_played_at', todayStart.toISOString())

  if (profileError) {
    console.error('[StreakReminder] profile query hatasi:', profileError)
    return NextResponse.json({ error: 'Profil sorgusu basarisiz' }, { status: 500 })
  }

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ sent: 0, candidates: 0 })
  }

  // Bu profillerin push aboneliklerini cek
  const userIds = profiles.map((p) => p.id)
  const { data: subscriptions, error: subError } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)

  if (subError) {
    console.error('[StreakReminder] subscription query hatasi:', subError)
    return NextResponse.json({ error: 'Abonelik sorgusu basarisiz' }, { status: 500 })
  }

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, candidates: profiles.length })
  }

  // streak lookup (user_id -> current_streak)
  const streakMap = new Map(profiles.map((p) => [p.id, p.current_streak as number]))

  let sentCount = 0
  let expiredCount = 0
  const expiredEndpoints: string[] = []

  for (const sub of subscriptions) {
    const streak = streakMap.get(sub.user_id) ?? 0
    if (streak < 1) continue

    const result = await sendPushNotification(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      {
        title: 'Bilge Arena',
        body: `${streak} gunluk serini kaybetme! Bugun de bir oyun oyna.`,
        url: '/arena',
      },
    )
    if (result === 'sent') sentCount += 1
    else if (result === 'expired') {
      expiredCount += 1
      expiredEndpoints.push(sub.endpoint)
    }
  }

  // Expired subscription cleanup — 410/404 donen endpoint'leri DB'den sil
  // (sonsuza kadar tekrar denenmemesi icin)
  if (expiredEndpoints.length > 0) {
    const { error: deleteError } = await supabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', expiredEndpoints)
    if (deleteError) {
      console.error('[StreakReminder] expired cleanup hatasi:', deleteError)
    }
  }

  return NextResponse.json({
    sent: sentCount,
    expired: expiredCount,
    candidates: profiles.length,
    subscriptions: subscriptions.length,
  })
}
