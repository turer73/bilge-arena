import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isCsrfOriginAllowed, CSRF_PROTECTED_METHODS } from '@/lib/utils/csrf'
import type { Database } from '@/types/database.client'
import {
  INSTITUTION_PILOT_ENTRY_PERMISSION,
  PLATFORM_ADMIN_ENTRY_PERMISSIONS,
} from '@/lib/admin/platform-permissions'
import { userHasAnyPlatformPermissionViaRest } from '@/lib/supabase/platform-access'
import { safeMfaReturnPath } from '@/lib/auth/aal2'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

function preserveRefreshedCookies(source: NextResponse, target: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie)
  return target
}

export async function proxy(request: NextRequest) {
  // Health endpoint — Uptime Kuma icin auth bypass
  if (request.nextUrl.pathname === '/api/health/ping') {
    return NextResponse.next()
  }

  // ── CSRF Origin allowlist (klipper review H1/P5) ──
  // State-changing istekler icin Origin/Referer kontrol; SameSite=Lax'in
  // defense-in-depth katmani. Auth callback ve health istisna.
  if (CSRF_PROTECTED_METHODS.has(request.method)) {
    const isAuthCallback = request.nextUrl.pathname.startsWith('/auth/callback')
    if (!isAuthCallback && !isCsrfOriginAllowed(request.headers)) {
      return NextResponse.json(
        { error: 'CSRF: Origin reddedildi' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      )
    }
  }

  // Response'u bir kez olustur — setAll icinde yeniden olusturmak
  // Next.js internal header'larini (Next-Router-State-Tree vb.) kaybettirir
  const response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Oturumu yenile + kullanici bilgisini al (tek cagri)
  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isAdminSurface = pathname === '/admin' || pathname.startsWith('/admin/')
  const isAdminApi = pathname === '/api/admin' || pathname.startsWith('/api/admin/')
  const isInstitutionSurface = pathname === '/arena/kurum' || pathname.startsWith('/arena/kurum/')
  const isInstitutionApi = pathname === '/api/institution' || pathname.startsWith('/api/institution/')
  const isTeacherStaffSurface = pathname === '/arena/sinif/ogretmen'
    || pathname.startsWith('/arena/sinif/ogretmen/')
  const needsAal2 = isAdminSurface
    || isAdminApi
    || isInstitutionSurface
    || isInstitutionApi
    || isTeacherStaffSurface

  if (needsAal2 && user) {
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalError || aal.currentLevel !== 'aal2') {
      if (pathname.startsWith('/api/')) {
        return preserveRefreshedCookies(response, NextResponse.json(
          {
            error: 'İki adımlı doğrulama gerekli',
            code: 'aal2_required',
            mfaUrl: `/hesap/guvenlik?next=${encodeURIComponent(safeMfaReturnPath(pathname))}`,
          },
          { status: 428, headers: { 'Cache-Control': 'no-store' } },
        ))
      }
      const mfaUrl = new URL('/hesap/guvenlik', request.url)
      mfaUrl.searchParams.set('next', safeMfaReturnPath(`${pathname}${request.nextUrl.search}`))
      return preserveRefreshedCookies(response, NextResponse.redirect(mfaUrl))
    }
  }

  // Admin koruması — kurum/öğretmen pilot rolleri de user_roles tablosunda
  // tutuluyor. Bu nedenle "herhangi bir rol" admin yetkisi değildir; yalnız
  // gerçek bir admin yüzeyi izni /admin kabuğunu açabilir.
  if (isAdminSurface) {
    if (!user) {
      return preserveRefreshedCookies(response, NextResponse.redirect(new URL('/giris', request.url)))
    }
    const serviceKey =
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    const hasAdminAccess = await userHasAnyPlatformPermissionViaRest({
      supabaseUrl: SUPABASE_URL,
      serviceKey,
      userId: user.id,
      permissions: PLATFORM_ADMIN_ENTRY_PERMISSIONS,
    })

    if (!hasAdminAccess) {
      const hasInstitutionAccess = await userHasAnyPlatformPermissionViaRest({
        supabaseUrl: SUPABASE_URL,
        serviceKey,
        userId: user.id,
        permissions: [INSTITUTION_PILOT_ENTRY_PERMISSION],
      })
      return preserveRefreshedCookies(
        response,
        NextResponse.redirect(new URL(hasInstitutionAccess ? '/arena/kurum' : '/arena', request.url)),
      )
    }

    // Admin sayfaları Cloudflare'da cache'lenmemeli
    response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate')
    response.headers.set('CDN-Cache-Control', 'no-store')
    response.headers.set('Cloudflare-CDN-Cache-Control', 'no-store')
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
