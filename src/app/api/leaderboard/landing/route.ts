import { NextResponse, type NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { isPublicLeaderboardPrivacyReady } from '@/lib/leaderboard/privacy'

// Anon erisilebilir endpoint, IP bazli rate limit (pentest sertlestirme)
const limiter = createRateLimiter('leaderboard-landing', 60, 60_000)

interface LandingLeader {
  rank: number
  username: string
  total_xp: number
}

/**
 * GET /api/leaderboard/landing
 *
 * Landing sayfasinda gosterilen top 5 leaderboard. Browser->Supabase
 * direkt cagri yerine bu proxy uzerinden gecer (Madde 9 — pentest raporu
 * Browser->Supabase kapatma).
 *
 * Service-role client kullanir cunku Migration 040 sonrasi anon role
 * `deleted_at` sutununa erisemez (column-level GRANT yok). Filter atmak
 * icin RLS bypass gerek.
 *
 * Cache: 5 dakika edge (frequently visited landing page).
 * Rate limit: 60 req/dk per IP (anon erisim icin).
 */
export async function GET(request: NextRequest) {
  // Rate limit
  const ip = getClientIp(request.headers)
  const rl = await limiter.check(ip)
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    )
  }

  const supabase = createServiceRoleClient()

  if (!(await isPublicLeaderboardPrivacyReady(supabase))) {
    return NextResponse.json(
      { leaders: [], privacyReady: false },
      { headers: { 'Cache-Control': 'public, s-maxage=30' } },
    )
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('username, total_xp')
    .eq('leaderboard_opt_in', true)
    .order('total_xp', { ascending: false })
    .gt('total_xp', 0)
    .is('deleted_at', null)
    .limit(5)

  if (error) {
    console.error('[LeaderboardLanding] query hatasi:', error)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  const leaders: LandingLeader[] = (data ?? []).map((p, i) => ({
    rank: i + 1,
    username: p.username || `Oyuncu ${i + 1}`,
    total_xp: p.total_xp || 0,
  }))

  // Edge cache 5 dk (s-maxage), browser cache yok
  return NextResponse.json(
    { leaders, privacyReady: true },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    },
  )
}
