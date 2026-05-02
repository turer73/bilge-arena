import { NextResponse, type NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'

// Anon erisilebilir endpoint, IP bazli rate limit (pentest sertlestirme)
const limiter = createRateLimiter('leaderboard-sidebar', 60, 60_000)

interface SidebarLeader {
  rank: number
  user_id: string | null
  name: string
  avatar_url: string | null
  xp_earned: number
  is_me: boolean
}

/**
 * GET /api/leaderboard/sidebar?currentUserId=<uuid>
 *
 * Sidebar mini liderboard (top 5 + my rank). Browser->Supabase direkt
 * cagri yerine bu proxy uzerinden gecer (Madde 9 — pentest raporu
 * Browser->Supabase kapatma, sidebar quiz-engine'de her oyun render'inda
 * cagrilir, yuksek frekans).
 *
 * Oncelik: leaderboard_weekly_ranked view (Migration 031 SECURITY INVOKER,
 * Migration 040 city kaldirildi).
 * Fallback: profiles tablosu (toplam XP'ye gore).
 *
 * currentUserId verilmisse + ilk 5'te degilse, ayri sorgu ile rank getir.
 *
 * Cache: 60 saniye edge (sidebar her sayfa render'inda gosterilir).
 * Rate limit: 60 req/dk per IP.
 */
export async function GET(request: NextRequest) {
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const rl = await limiter.check(ip)
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    )
  }

  const { searchParams } = new URL(request.url)
  const currentUserId = searchParams.get('currentUserId')
  // UUID format guard (anti-injection — RPC'ye gitmiyor ama defensive)
  const isValidUuid = currentUserId && /^[0-9a-f-]{36}$/i.test(currentUserId)
  const safeUserId = isValidUuid ? currentUserId : null

  const supabase = createServiceRoleClient()

  // Haftalik view'i dene
  const { data: weeklyData, error: weeklyError } = await supabase
    .from('leaderboard_weekly_ranked')
    .select('user_id, display_name, username, avatar_url, xp_earned, current_rank')
    .order('current_rank', { ascending: true })
    .limit(5)

  if (weeklyError) {
    console.error('[LeaderboardSidebar] weekly view hatasi:', weeklyError)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  if (weeklyData && weeklyData.length > 0) {
    let myRank = 0
    const players: SidebarLeader[] = weeklyData.map((row, i) => {
      const isMe = !!safeUserId && row.user_id === safeUserId
      if (isMe) myRank = i + 1
      const name =
        ((row as Record<string, unknown>).username as string | null) ||
        row.display_name ||
        `Oyuncu ${i + 1}`
      return {
        rank: i + 1,
        user_id: row.user_id,
        name,
        avatar_url: row.avatar_url,
        xp_earned: Number(row.xp_earned || 0),
        is_me: isMe,
      }
    })

    // Kullanici ilk 5'te degilse, sirasini ayri sorgu ile getir
    if (myRank === 0 && safeUserId) {
      const { data: myData } = await supabase
        .from('leaderboard_weekly_ranked')
        .select('current_rank')
        .eq('user_id', safeUserId)
        .single()
      if (myData) myRank = myData.current_rank
    }

    return NextResponse.json(
      { players, myRank, source: 'weekly' },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        },
      },
    )
  }

  // Fallback: profiles tablosu
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, total_xp')
    .order('total_xp', { ascending: false })
    .limit(5)

  if (profilesError) {
    console.error('[LeaderboardSidebar] profiles hatasi:', profilesError)
    return NextResponse.json({ error: 'Fallback sorgu basarisiz' }, { status: 500 })
  }

  if (!profiles || profiles.length === 0) {
    return NextResponse.json(
      { players: [], myRank: 0, source: 'empty' },
      { headers: { 'Cache-Control': 'public, s-maxage=60' } },
    )
  }

  let myRank = 0
  const players: SidebarLeader[] = profiles.map((p, i) => {
    const isMe = !!safeUserId && p.id === safeUserId
    if (isMe) myRank = i + 1
    return {
      rank: i + 1,
      user_id: p.id,
      name: p.username || p.display_name || `Oyuncu ${i + 1}`,
      avatar_url: p.avatar_url,
      xp_earned: Number(p.total_xp || 0),
      is_me: isMe,
    }
  })

  return NextResponse.json(
    { players, myRank, source: 'profiles_fallback' },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
    },
  )
}
