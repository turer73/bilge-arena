import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'

// Cift kalkan rate limit (sidebar pattern, daha dusuk esikler):
//   - siralama dedicated page; sidebar gibi her render'da gelmiyor.
//   - IP limit ONCE, anon flood'u erken kes — auth.getUser() Supabase
//     roundtrip'i tetiklenmesin.
//   - User limit ek katman, NAT/Wi-Fi paylasimi durumunda auth user IP
//     limit'inden bagimsiz korumali.
const ipLimiter = createRateLimiter('leaderboard-full-ip', 60, 60_000)
const userLimiter = createRateLimiter('leaderboard-full-user', 120, 60_000)

interface FullLeader {
  rank: number
  name: string
  avatar_url: string | null
  xp: number
  level_name: string | null
  is_me: boolean
}

interface WeeklyRow {
  user_id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  xp_earned: number | null
  current_rank: number
  level_name: string | null
}

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  total_xp: number | null
  level_name: string | null
}

/**
 * GET /api/leaderboard/full?currentUserId=<uuid>
 *
 * /arena/siralama sayfasinda gosterilen tam liderboard (top 50 + my rank).
 * Browser->Supabase direkt cagri yerine bu proxy uzerinden gecer
 * (Madde 9 — pentest raporu Browser->Supabase kapatma).
 *
 * Oncelik: leaderboard_weekly_ranked view (Migration 031 SECURITY INVOKER,
 * Migration 040 city kaldirildi).
 * Fallback: profiles tablosu (toplam XP'ye gore — tum zamanlar).
 *
 * Source semantik:
 *   - 'weekly'             — view'de veri var (haftalik siralama)
 *   - 'profiles_fallback'  — view bos, profiles fallback (tum zamanlar)
 *   - 'empty'              — ikisi de bos (henuz oyuncu yok)
 *
 * currentUserId verilmisse + ilk 50'de degilse, ayri sorgu ile rank getir.
 *
 * Cache:
 *   - anon (currentUserId yok): public s-maxage=120 (lower frequency, daha
 *     uzun cache'leyebiliriz, sidebar 60s)
 *   - auth (currentUserId var): private max-age=60 (is_me + myRank
 *     user-specific payload)
 *
 * Rate limit (sidebar PR #75 + #78 P1 paterni, daha dusuk esikler):
 *   1. IP limit her zaman ONCE (anon flood'u erken kes — auth API
 *      roundtrip engellemek): 60 req/dk per IP
 *   2. Auth user ise (IP gectikten sonra) user-id limit ek katman:
 *      120 req/dk
 *   - getClientIp helper anti-XFF-spoof (PR #76)
 */
export async function GET(request: NextRequest) {
  // 1. IP rate limit ONCE — auth.getUser() Supabase roundtrip'ten once.
  //    Anonim flood'da auth quota tuketilmesin (Codex PR #78 P1 paterni).
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
  // UUID format guard — kanonik 8-4-4-4-12 (sidebar review LOW: tighten edildi)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const isValidUuid = !!currentUserId && UUID_RE.test(currentUserId)
  const safeUserId = isValidUuid ? currentUserId : null

  // Cache strategy (sidebar paterni):
  //   - currentUserId yoksa: public cache OK (anonim leaderboard)
  //   - currentUserId varsa: is_me + myRank user-specific -> private cache
  const cacheControl = safeUserId
    ? 'private, max-age=60'
    : 'public, s-maxage=120, stale-while-revalidate=60'

  const supabase = createServiceRoleClient()

  // Haftalik view'i dene (top 50)
  const { data: weeklyData, error: weeklyError } = await supabase
    .from('leaderboard_weekly_ranked')
    .select('user_id, username, display_name, avatar_url, xp_earned, current_rank, level_name')
    .order('current_rank', { ascending: true })
    .limit(50)

  if (weeklyError) {
    console.error('[LeaderboardFull] weekly view hatasi:', weeklyError)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  if (weeklyData && weeklyData.length > 0) {
    const rows = weeklyData as WeeklyRow[]
    let myRank = 0
    const players: FullLeader[] = rows.map((row) => {
      const isMe = !!safeUserId && row.user_id === safeUserId
      if (isMe) myRank = row.current_rank
      return {
        rank: row.current_rank,
        name: row.username || row.display_name || `Oyuncu ${row.current_rank}`,
        avatar_url: row.avatar_url,
        xp: Number(row.xp_earned || 0),
        level_name: row.level_name,
        is_me: isMe,
      }
    })

    // Kullanici ilk 50'de degilse, sirasini ayri sorgu ile getir
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

  // Fallback: profiles tablosu (tum zamanlar)
  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, total_xp, level_name')
    .gt('total_xp', 0)
    .is('deleted_at', null)
    .order('total_xp', { ascending: false })
    .limit(50)

  if (profilesError) {
    console.error('[LeaderboardFull] profiles hatasi:', profilesError)
    return NextResponse.json({ error: 'Fallback sorgu basarisiz' }, { status: 500 })
  }

  if (!profilesData || profilesData.length === 0) {
    return NextResponse.json(
      { players: [], myRank: 0, source: 'empty' },
      { headers: { 'Cache-Control': cacheControl } },
    )
  }

  const profiles = profilesData as ProfileRow[]
  let myRank = 0
  const players: FullLeader[] = profiles.map((p, i) => {
    const rank = i + 1
    const isMe = !!safeUserId && p.id === safeUserId
    if (isMe) myRank = rank
    return {
      rank,
      name: p.username || p.display_name || `Oyuncu ${rank}`,
      avatar_url: p.avatar_url,
      xp: Number(p.total_xp || 0),
      level_name: p.level_name,
      is_me: isMe,
    }
  })

  return NextResponse.json(
    { players, myRank, source: 'profiles_fallback' },
    { headers: { 'Cache-Control': cacheControl } },
  )
}
