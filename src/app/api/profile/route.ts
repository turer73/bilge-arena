import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { profileUpdateSchema } from '@/lib/validations/schemas'
import type { TablesUpdate } from '@/types/database.generated'
import { userHasPlatformAdminAccess } from '@/lib/supabase/platform-access'

// Cift kalkan rate limit (Madde 9 #5 pattern — topic-strengths icin de ayni):
//   - IP limit her hit'te ONCE (auth.getUser quota'sini koru)
//   - User limit auth varsa ek katman
const ipGetLimiter = createRateLimiter('profile-get-ip', 120, 60_000)
const userGetLimiter = createRateLimiter('profile-get-user', 60, 60_000)

const ipPatchLimiter = createRateLimiter('profile-patch-ip', 30, 60_000)
const userPatchLimiter = createRateLimiter('profile-patch-user', 10, 60_000)

/**
 * GET /api/profile
 *
 * Auth'lu kullanicinin kendi profilini + admin role flag'ini doner.
 * use-auth.ts hook'unun her sayfa yuklenmesinde cagirdigi endpoint.
 *
 * Madde 9 #5 (pentest raporu): Browser->Supabase direkt cagri yerine bu proxy.
 * Eski akis: client `.from('profiles').select('*').eq('id', user.id).single()`
 *           + ayri `.from('user_roles').select('role_id').eq(...)`.
 * Yeni akis: server-side auth + service-role + iki sorgu paralel.
 *
 * Cache: no-store (kullaniciya ozel veri, cache-key olarak cookie kullanmiyoruz).
 * Rate limit: IP 120/dk + user 60/dk.
 */
export async function GET(request: NextRequest) {
  // 1) IP rate limit
  const ip = getClientIp(request.headers)
  const ipRl = await ipGetLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  // 2) Auth check (cookie/JWT)
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  // 3) User rate limit
  const userRl = await userGetLimiter.check(user.id)
  if (!userRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
    )
  }

  // 4) Service-role query — platform admin, "herhangi bir rol" demek değildir.
  // Kurum ve öğretmen pilot rolleri de user_roles içinde tutulur.
  const admin = createServiceRoleClient()
  const [profileRes, isAdmin] = await Promise.all([
    admin.from('profiles').select('*').eq('id', user.id).single(),
    userHasPlatformAdminAccess(admin, user.id),
  ])

  if (profileRes.error || !profileRes.data) {
    // Auth user var ama profil yok — auto-create trigger calismadi
    console.error('[Profile GET] profil bulunamadi:', profileRes.error?.code)
    return NextResponse.json({ error: 'Profil bulunamadi' }, { status: 404 })
  }

  return NextResponse.json(
    { profile: profileRes.data, isAdmin },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * PATCH /api/profile — Profil bilgilerini guncelle
 *
 * Body: { username?, display_name?, city?, grade?, onboarding_completed? }
 * Madde 9 #5: service-role client kullanir (eski session client'tan fark:
 * sprint #10 authenticated REVOKE'tan sonra session client kirilir).
 */
export async function PATCH(request: NextRequest) {
  // 1) IP rate limit
  const ip = getClientIp(request.headers)
  const ipRl = await ipPatchLimiter.check(ip)
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
  const userRl = await userPatchLimiter.check(user.id)
  if (!userRl.success) {
    return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })
  }

  // 4) Body validation
  const body = await request.json()
  const parsed = profileUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Gecersiz veri' },
      { status: 400 },
    )
  }

  const { username, display_name, city, grade, exam_type, onboarding_completed, preferred_theme, is_discoverable } = parsed.data
  const updates: TablesUpdate<'profiles'> = {}
  if (username) updates.username = username
  if (display_name !== undefined) updates.display_name = display_name || null
  if (city !== undefined) updates.city = city || null
  if (grade !== undefined) updates.grade = grade
  if (exam_type !== undefined) updates.exam_type = exam_type
  if (onboarding_completed) updates.onboarding_completed = true
  if (preferred_theme !== undefined) updates.preferred_theme = preferred_theme
  if (is_discoverable !== undefined) updates.is_discoverable = is_discoverable

  // 5) Service-role update — sahip kontrolu auth.uid() = user.id ile yapildi
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select('id, username, display_name, city, grade, exam_type, avatar_url, onboarding_completed, is_discoverable')
    .single()

  if (error) {
    console.error('[Profile PATCH] Hata:', error.code)
    return NextResponse.json({ error: 'Profil guncellenemedi' }, { status: 500 })
  }

  return NextResponse.json(data)
}
