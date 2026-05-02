import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'

// Cift kalkan rate limit (Codex PR #75 P1):
//   IP-bazli (anon + abuse): 60 req/dk — kazima/spam ucretine engel
//   User-bazli (auth + realtime): 240 req/dk (4 req/sn) — sidebar
//     Supabase Realtime XP update'lerinde her olay fetchSidebarLeaderboard
//     tetikler. NAT/okul/sirket Wi-Fi'sinde 60 req/dk yetersiz, blank
//     leaderboard yan etkisi olur (use-sidebar-data realtime subscription).
const ipLimiter = createRateLimiter('leaderboard-sidebar-ip', 60, 60_000)
const userLimiter = createRateLimiter('leaderboard-sidebar-user', 240, 60_000)

interface SidebarLeader {
  rank: number
  // user_id REMOVED (review LOW): client is_me uses pre-computed flag,
  // no need to expose internal UUID — data minimization.
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
 *
 * Rate limit (Codex P1 fix):
 *   - Auth user (cookie): user-id basis 240 req/dk (realtime XP overflow tolere)
 *   - Anon: IP basis 60 req/dk (anti-abuse)
 *   - getClientIp helper anti-XFF-spoof (PR #76)
 */
export async function GET(request: NextRequest) {
  // Auth context'i cek (cookie). Anon ise user null, IP rate'a dus.
  const cookieClient = await createClient()
  const {
    data: { user },
  } = await cookieClient.auth.getUser()

  if (user) {
    const rl = await userLimiter.check(user.id)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Cok fazla istek' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
      )
    }
  } else {
    const ip = getClientIp(request.headers)
    const rl = await ipLimiter.check(ip)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Cok fazla istek' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
      )
    }
  }

  const { searchParams } = new URL(request.url)
  const currentUserId = searchParams.get('currentUserId')
  // UUID format guard — kanonik 8-4-4-4-12 (review LOW: tighten edildi)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const isValidUuid = !!currentUserId && UUID_RE.test(currentUserId)
  const safeUserId = isValidUuid ? currentUserId : null

  // Cache strategy (review LOW: user-specific payload fragility):
  //   - currentUserId yoksa: public cache OK (anonim leaderboard)
  //   - currentUserId varsa: is_me + myRank user-specific -> private cache
  const cacheControl = safeUserId
    ? 'private, max-age=60'
    : 'public, s-maxage=60, stale-while-revalidate=30'

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
      { headers: { 'Cache-Control': cacheControl } },
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
      { headers: { 'Cache-Control': cacheControl } },
    )
  }

  let myRank = 0
  const players: SidebarLeader[] = profiles.map((p, i) => {
    const isMe = !!safeUserId && p.id === safeUserId
    if (isMe) myRank = i + 1
    return {
      rank: i + 1,
      name: p.username || p.display_name || `Oyuncu ${i + 1}`,
      avatar_url: p.avatar_url,
      xp_earned: Number(p.total_xp || 0),
      is_me: isMe,
    }
  })

  return NextResponse.json(
    { players, myRank, source: 'profiles_fallback' },
    { headers: { 'Cache-Control': cacheControl } },
  )
}
