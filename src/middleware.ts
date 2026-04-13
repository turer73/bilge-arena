import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export async function middleware(request: NextRequest) {
  // Health endpoint — Uptime Kuma icin auth bypass
  if (request.nextUrl.pathname === '/api/health/ping') {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
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
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Oturumu yenile + kullanici bilgisini al (tek cagri)
  const { data: { user } } = await supabase.auth.getUser()

  // Admin koruması — RBAC: en az 1 rolü olmalı
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!user) {
      return NextResponse.redirect(new URL('/giris', request.url))
    }
    // RLS bypass: once session-based dene, bos donerse service key ile dene
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_id')
      .eq('user_id', user.id)
      .limit(1)

    let hasRole = !!userRoles && userRoles.length > 0

    // Session-based bos donduyse service key ile REST API dene
    if (!hasRole) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
      if (serviceKey) {
        try {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${user.id}&select=role_id&limit=1`,
            {
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
              cache: 'no-store',
            }
          )
          if (res.ok) {
            const roles = await res.json()
            hasRole = Array.isArray(roles) && roles.length > 0
          }
        } catch {
          // Service key fetch failed, rely on session result
        }
      }
    }

    if (!hasRole) {
      return NextResponse.redirect(new URL('/arena', request.url))
    }

    // Admin sayfaları Cloudflare'da cache'lenmemeli
    response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate')
    response.headers.set('CDN-Cache-Control', 'no-store')
    response.headers.set('Cloudflare-CDN-Cache-Control', 'no-store')
  }

  // CSP violation reporting — report-only mode (engelleme yok, sadece izleme)
  response.headers.set(
    "Content-Security-Policy-Report-Only",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://analytics.panola.app https://pagead2.googlesyndication.com https://www.googletagmanager.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://analytics.panola.app https://generativelanguage.googleapis.com; img-src 'self' data: blob: https://*.supabase.co; style-src 'self' 'unsafe-inline'; font-src 'self' data:; report-uri https://csp.3d-labx.com/csp-report"
  )
  response.headers.set(
    "Report-To",
    JSON.stringify({ group: "csp-endpoint", max_age: 86400, endpoints: [{ url: "https://csp.3d-labx.com/csp-report" }] })
  )

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
