import { NextResponse } from 'next/server'

import {
  createLegalConsentIntentToken,
  LEGAL_CONSENT_INTENT_COOKIE,
  LEGAL_CONSENT_INTENT_TTL_SECONDS,
} from '@/lib/legal-consent/server'
import { getClientIp } from '@/lib/utils/client-ip'
import { createRateLimiter } from '@/lib/utils/rate-limit'

const intentLimiter = createRateLimiter('legal-consent-intent', 5, 60_000)

function json(body: unknown, status = 200, retryAfter?: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}),
    },
  })
}

export async function POST(request: Request) {
  const ip = getClientIp(request.headers)
  const limit = await intentLimiter.check(ip === 'unknown' ? 'anonymous' : ip)
  if (!limit.success) {
    const unavailable = limit.reason === 'backend_unavailable'
    return json(
      { ok: false },
      unavailable ? 503 : 429,
      limit.retryAfter ?? 60,
    )
  }

  const token = createLegalConsentIntentToken()
  if (!token) return json({ ok: false }, 503, 60)
  const response = json({ ok: true, token })
  response.cookies.set(LEGAL_CONSENT_INTENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth/callback',
    maxAge: LEGAL_CONSENT_INTENT_TTL_SECONDS,
  })
  return response
}
