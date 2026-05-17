import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'

const ipLimiter = createRateLimiter('profile-sync-ip', 30, 60_000)
const userLimiter = createRateLimiter('profile-sync-user', 5, 60_000)

/**
 * POST /api/profile/sync
 *
 * Google OAuth metadata (display_name, avatar_url) ile profili senkronize eder.
 * use-auth.ts hook'unun her sayfa yuklenmesinde gerektiginde cagirdigi endpoint.
 *
 * Madde 9 #5 (pentest raporu): Browser->Supabase direkt cagri yerine bu proxy.
 * Eski akis: client `auth.getUser()` -> metadata oku -> `.from('profiles').update(...)`.
 * Yeni akis: server-side auth + metadata server-tarafindan oku + service-role update.
 *
 * Guvenlik:
 *   - Metadata istemciden alinmaz; server-side `auth.getUser()` cagrisindan gelir.
 *   - Sadece display_name ve avatar_url update edilebilir; baska alan kabul edilmez.
 *   - Kullanici sadece **kendi** profilini sync edebilir (auth.uid() = filter).
 *
 * Akilli davranis:
 *   - Custom avatar varsa (avatar_url path '/avatars/' iceriyorsa) Google avatar
 *     uzerine yazilmaz.
 *   - display_name zaten Google name ile esitse update atilmaz.
 *   - Hicbir degisiklik yoksa { updated: false } doner (db'ye dokunulmaz).
 *
 * Rate limit: IP 30/dk + user 5/dk (login sirasinda + 1-2 sayfa gecisi olabilir).
 */
export async function POST(request: NextRequest) {
  // 1) IP rate limit
  const ip = getClientIp(request.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  // 2) Auth check
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  // 3) User rate limit
  const userRl = await userLimiter.check(user.id)
  if (!userRl.success) {
    return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })
  }

  // 4) Mevcut profili oku (service-role)
  const admin = createServiceRoleClient()
  const { data: profile, error: pErr } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (pErr || !profile) {
    console.error('[Profile Sync] profil bulunamadi:', pErr?.code)
    return NextResponse.json({ error: 'Profil bulunamadi' }, { status: 404 })
  }

  // 5) Google metadata oku (server-side auth.user'dan)
  const meta = user.user_metadata ?? {}
  const googleName = (meta.full_name || meta.name) as string | null | undefined
  const googleAvatar = (meta.avatar_url || meta.picture) as string | null | undefined
  const hasCustomAvatar = profile.avatar_url?.includes('/avatars/') ?? false

  const updates: Record<string, string> = {}
  if (googleName && googleName !== profile.display_name) {
    updates.display_name = googleName
  }
  if (!hasCustomAvatar && googleAvatar && googleAvatar !== profile.avatar_url) {
    updates.avatar_url = googleAvatar
  }

  // 6) Roller (paralel olabilirdi ama sync nadiren cagrildigi icin onemli degil)
  const { data: roles } = await admin
    .from('user_roles')
    .select('role_id')
    .eq('user_id', user.id)
    .limit(1)

  const isAdmin = !!(roles && roles.length > 0)

  // 7) Degisiklik yoksa direkt don
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { profile, isAdmin, updated: false },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  // 8) Update et + guncel profili dondur
  const { data: updatedProfile, error: uErr } = await admin
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select('*')
    .single()

  if (uErr || !updatedProfile) {
    console.error('[Profile Sync] update hatasi:', uErr?.code)
    // Update basarisiz olsa bile mevcut profili dondur — UI bozulmasin
    return NextResponse.json(
      { profile, isAdmin, updated: false },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return NextResponse.json(
    { profile: updatedProfile, isAdmin, updated: true },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
