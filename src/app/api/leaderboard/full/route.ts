import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { isPublicLeaderboardPrivacyReady } from '@/lib/leaderboard/privacy'

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
  nameplate: string
  decorations: string[]
}

interface ProfileRow {
  id: string
  username: string | null
  avatar_url: string | null
  total_xp: number | null
  level_name: string | null
  selected_nameplate: string | null
  selected_avatar_decorations: string[] | null
}

/**
 * GET /api/leaderboard/full
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
 * Giris yapan kullanici ilk 50'de degilse, ayri sorgu ile rank getir.
 * Kullanici kimligi sorgu parametresinden alinmaz; dogrulanmis oturumdan gelir.
 *
 * Cache: no-store. Liderlik gorunurlugu geri alinabilir bir onaydir ve
 * oturumlu yanit is_me/myRank ile kisiye ozeldir. Ortak ya da tarayici
 * cache'i, vazgecen bir kullaniciyi gostermeye veya oturumlar arasinda
 * kisiye ozel siralama tasimaya devam edebilir.
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
  // period=all -> haftalik view'i atla, dogrudan tum-zaman (profiles.total_xp).
  // Ana sayfa 'Tum Zamanlarin Liderleri' vitrini buraya yonlendirir (CTA tutarliligi).
  const allTime = searchParams.get('period') === 'all'
  const safeUserId = user?.id ?? null

  // Opt-out hemen etkili olmali; ayrica is_me/myRank cookie ile kisilesir.
  // URL-keyed browser/edge cache bu iki gizlilik sozlesmesini de bozar.
  const cacheControl = 'no-store'

  const supabase = createServiceRoleClient()

  // App-first rollout guard: migration 177 yoksa legacy tablo/view'i okumak
  // yerine bos don. Boylece deploy araliginda gizlilik geriye dusmez.
  if (!(await isPublicLeaderboardPrivacyReady(supabase))) {
    return NextResponse.json(
      { players: [], myRank: 0, source: 'privacy_pending' },
      { headers: { 'Cache-Control': cacheControl } },
    )
  }

  // Haftalik view'i dene (top 50) — period=all istenmediyse. allTime ise
  // dogrudan profiles (tum-zaman) yoluna gec (CTA tutarliligi, Codex #196 P2).
  if (!allTime) {
    const { data: weeklyData, error: weeklyError } = await supabase
      .from('leaderboard_weekly_ranked')
      .select('user_id, username, avatar_url, xp_earned, current_rank, level_name')
      .order('current_rank', { ascending: true })
      .limit(50)

    if (weeklyError) {
      console.error('[LeaderboardFull] weekly view hatasi:', weeklyError)
      return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
    }

    if (weeklyData && weeklyData.length > 0) {
      const rows = weeklyData
      // Nameplate + süs seçimi haftalık view'de yok → profiles'tan toplu çek
      const npMap = new Map<string, string>()
      const decoMap = new Map<string, string[]>()
      const ids = rows
        .map((r) => r.user_id)
        .filter((id): id is string => id !== null)
      if (ids.length > 0) {
        const { data: npData } = await supabase
          .from('profiles')
          .select('id, selected_nameplate, selected_avatar_decorations')
          .in('id', ids)
        for (const p of npData ?? []) {
          npMap.set(p.id, p.selected_nameplate ?? 'none')
          decoMap.set(p.id, (p.selected_avatar_decorations as string[]) ?? [])
        }
      }
      let myRank = 0
      const players: FullLeader[] = rows.map((row, index) => {
        const rank = row.current_rank ?? index + 1
        const isMe = !!safeUserId && row.user_id === safeUserId
        if (isMe) myRank = rank
        return {
          rank,
          name: row.username || `Oyuncu ${rank}`,
          avatar_url: row.avatar_url,
          xp: Number(row.xp_earned || 0),
          level_name: row.level_name,
          is_me: isMe,
          nameplate: npMap.get(row.user_id ?? '') ?? 'none',
          decorations: decoMap.get(row.user_id ?? '') ?? [],
        }
      })

      // Kullanici ilk 50'de degilse, sirasini ayri sorgu ile getir
      if (myRank === 0 && safeUserId) {
        const { data: myData } = await supabase
          .from('leaderboard_weekly_ranked')
          .select('current_rank')
          .eq('user_id', safeUserId)
          .single()
        if (myData) myRank = myData.current_rank ?? 0
      }

      return NextResponse.json(
        { players, myRank, source: 'weekly' },
        { headers: { 'Cache-Control': cacheControl } },
      )
    }
  }

  // Tum-zaman: profiles tablosu (period=all istegi) VEYA haftalik view bos (fallback)
  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, total_xp, level_name, selected_nameplate, selected_avatar_decorations')
    .eq('leaderboard_opt_in', true)
    .gt('total_xp', 0)
    .is('deleted_at', null)
    .order('total_xp', { ascending: false })
    .limit(50)

  if (profilesError) {
    console.error('[LeaderboardFull] profiles hatasi:', profilesError)
    return NextResponse.json({ error: 'Fallback sorgu basarisiz' }, { status: 500 })
  }

  // source: explicit period=all -> 'all_time'; haftalik-bos dususu -> 'profiles_fallback'
  const allTimeSource = allTime ? 'all_time' : 'profiles_fallback'

  if (!profilesData || profilesData.length === 0) {
    return NextResponse.json(
      { players: [], myRank: 0, source: allTime ? 'all_time' : 'empty' },
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
      name: p.username || `Oyuncu ${rank}`,
      avatar_url: p.avatar_url,
      xp: Number(p.total_xp || 0),
      level_name: p.level_name,
      is_me: isMe,
      nameplate: p.selected_nameplate ?? 'none',
      decorations: p.selected_avatar_decorations ?? [],
    }
  })

  // Tum-zaman sirasi: kullanici top-50'de degilse COUNT ile gercek sirayi getir
  // (haftalik yolun myRank-ek-sorgu paritesi; daha once fallback'te eksikti).
  if (myRank === 0 && safeUserId) {
    const { data: me } = await supabase
      .from('profiles')
      .select('total_xp, leaderboard_opt_in')
      .eq('id', safeUserId)
      .single()
    const myXp = Number(me?.total_xp || 0)
    if (me?.leaderboard_opt_in && myXp > 0) {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('leaderboard_opt_in', true)
        .is('deleted_at', null)
        .gt('total_xp', myXp)
      myRank = (count ?? 0) + 1
    }
  }

  return NextResponse.json(
    { players, myRank, source: allTimeSource },
    { headers: { 'Cache-Control': cacheControl } },
  )
}
