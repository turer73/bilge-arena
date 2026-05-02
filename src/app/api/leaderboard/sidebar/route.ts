import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'

// Cift kalkan rate limit (Codex PR #75 P1 + PR #78 P1):
//   1. IP limit (her hit'te ONCE): 300 req/dk
//      - NAT/okul/sirket Wi-Fi'sinde 30+ kullanici toleransi (PR #75 review)
//      - Anonim flood'u erken kes — auth.getUser() Supabase roundtrip'ini
//        engelle (PR #78 review: anon flood auth quota tuketmemeli)
//   2. User limit (IP gectikten sonra, auth varsa): 240 req/dk
//      - Auth user'i IP basina degil user-id basina kontrol — ek katman
//      - sidebar Supabase Realtime XP update'lerinde realtime overflow tolere
const ipLimiter = createRateLimiter('leaderboard-sidebar-ip', 300, 60_000)
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
 * Rate limit (Codex PR #75 + PR #78 P1 fix'leri):
 *   1. IP limit her zaman ONCE (anon flood'u erken kes — auth API roundtrip
 *      engellemek): 300 req/dk per IP (NAT toleransli)
 *   2. Auth user ise (IP gectikten sonra) user-id limit ek katman:
 *      240 req/dk realtime XP overflow tolere
 *   - getClientIp helper anti-XFF-spoof (PR #76)
 */
export async function GET(request: NextRequest) {
  // 1. IP rate limit ONCE — auth.getUser() Supabase roundtrip'ten once.
  //    Anonim flood'da auth quota tuketilmesin (Codex PR #78 P1).
  const ip = getClientIp(request.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  // 2. IP gectikten sonra auth check + ek user-id limit (cift kalkan).
  //    Auth user yoksa IP limit yeterli, ek check yok.
  const cookieClient = await createClient()
  const {
    data: { user },
  } = await cookieClient.auth.getUser()

  if (user) {
    const userRl = await userLimiter.check(user.id)
    if (!userRl.success) {
      return NextResponse.json(
        { error: 'Cok fazla istek' },
        { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
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
