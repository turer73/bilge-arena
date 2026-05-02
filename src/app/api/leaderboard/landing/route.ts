import { NextResponse, type NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'

// Anon erisilebilir endpoint, IP bazli rate limit (pentest sertlestirme)
const limiter = createRateLimiter('leaderboard-landing', 60, 60_000)

interface LandingLeader {
  rank: number
  username: string
  total_xp: number
  current_streak: number
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
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const rl = await limiter.check(ip)
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    )
  }

  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('username, display_name, total_xp, current_streak')
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
    username: p.username || p.display_name || `Oyuncu ${i + 1}`,
    total_xp: p.total_xp || 0,
    current_streak: p.current_streak || 0,
  }))

  // Edge cache 5 dk (s-maxage), browser cache yok
  return NextResponse.json(
    { leaders },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    },
  )
}
