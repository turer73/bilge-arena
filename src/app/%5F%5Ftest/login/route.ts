import { NextRequest, NextResponse } from 'next/server'
import { safeAuthNext } from '@/lib/auth/safe-next'
import {
  ISOLATED_TEST_ORIGIN,
  isIsolatedAcademyTest,
} from '@/lib/auth/isolated-test'

// `%5F%5Ftest` is required because App Router treats `__test` as a private folder.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LOGIN_PATH = '/__test/login'
const NEXT_COOKIE = 'ba_test_next'

function isLocalRequest(request: NextRequest): boolean {
  return request.nextUrl.hostname === 'localhost'
}

function unavailable(): NextResponse {
  return new NextResponse('Test girişi yalnız izole yerel geliştirme ortamında kullanılabilir.', {
    status: 404,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  })
}

function setCookieValues(headers: Headers): string[] {
  const values = headers.getSetCookie()
  if (values.length > 0) return values
  const fallback = headers.get('set-cookie')
  return fallback ? [fallback] : []
}

function copyUpstreamCookies(upstream: Response, response: NextResponse): void {
  for (const cookie of setCookieValues(upstream.headers)) {
    response.headers.append('Set-Cookie', cookie)
  }
}

function baseHeaders(contentType = 'text/html; charset=utf-8'): HeadersInit {
  return {
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isIsolatedAcademyTest() || !isLocalRequest(request)) return unavailable()

  try {
    const upstream = await fetch(`${ISOLATED_TEST_ORIGIN}${LOGIN_PATH}`, {
      cache: 'no-store',
      redirect: 'manual',
    })
    const response = new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: baseHeaders(upstream.headers.get('content-type') ?? undefined),
    })
    response.cookies.set(NEXT_COOKIE, safeAuthNext(request.nextUrl.searchParams.get('next'), '/arena/kule'), {
      httpOnly: true,
      sameSite: 'strict',
      path: LOGIN_PATH,
      maxAge: 600,
    })
    // NextResponse.cookies.set rewrites the Set-Cookie header. Append the
    // upstream CSRF cookie afterwards so both cookies reach the browser.
    copyUpstreamCookies(upstream, response)
    return response
  } catch {
    return new NextResponse('Izole test giris servisine ulasilamiyor.', {
      status: 503,
      headers: baseHeaders('text/plain; charset=utf-8'),
    })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isIsolatedAcademyTest() || !isLocalRequest(request)) return unavailable()

  try {
    const body = await request.text()
    if (body.length > 4096) {
      return new NextResponse('İstek çok büyük.', {
        status: 413,
        headers: baseHeaders('text/plain; charset=utf-8'),
      })
    }

    const upstream = await fetch(`${ISOLATED_TEST_ORIGIN}${LOGIN_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: request.headers.get('cookie') ?? '',
        Origin: ISOLATED_TEST_ORIGIN,
        Referer: `${ISOLATED_TEST_ORIGIN}${LOGIN_PATH}`,
      },
      body,
      cache: 'no-store',
      redirect: 'manual',
    })

    const signedIn = upstream.status >= 300 && upstream.status < 400
    const response = signedIn
      ? NextResponse.redirect(
          new URL(safeAuthNext(request.cookies.get(NEXT_COOKIE)?.value, '/arena/kule'), request.url),
          303,
        )
      : new NextResponse(await upstream.text(), {
          status: upstream.status,
          headers: baseHeaders(upstream.headers.get('content-type') ?? 'text/plain; charset=utf-8'),
        })

    response.cookies.set(NEXT_COOKIE, '', {
      httpOnly: true,
      sameSite: 'strict',
      path: LOGIN_PATH,
      maxAge: 0,
    })
    // Keep the Supabase session cookies produced by the isolated entry after
    // clearing our local return-path cookie.
    copyUpstreamCookies(upstream, response)
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
    return response
  } catch {
    return new NextResponse('İzole test girişi tamamlanamadı.', {
      status: 503,
      headers: baseHeaders('text/plain; charset=utf-8'),
    })
  }
}
