import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getClientIp } from '@/lib/utils/client-ip'
import { createRateLimiter, type RateLimitResult } from '@/lib/utils/rate-limit'
import {
  issueVerifiedTytSocialOfficialSection,
  toPublicVerifiedQuestions,
} from '@/lib/verified-attempts'

const requestSchema = z.object({ requestId: z.uuid() }).strict()
const ipLimiter = createRateLimiter('tyt-social-section-ip', 30, 60_000)
const userLimiter = createRateLimiter('tyt-social-section-user', 8, 60_000)

function noStoreJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  })
}

function rateLimitFailure(result: RateLimitResult) {
  const unavailable = result.reason === 'backend_unavailable'
  return noStoreJson(
    { error: unavailable ? 'Güvenlik servisi geçici olarak kullanılamıyor' : 'Çok fazla istek' },
    unavailable ? 503 : 429,
    { 'Retry-After': String(result.retryAfter ?? 60) },
  )
}

/**
 * Mutation-capable official-section issuance is POST-only so the global
 * Origin/CSRF guard applies. The actor always comes from the verified cookie.
 */
export async function POST(request: NextRequest) {
  const ipLimit = await ipLimiter.check(getClientIp(request.headers))
  if (!ipLimit.success) return rateLimitFailure(ipLimit)

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return noStoreJson({ error: 'Geçersiz istek' }, 400)
  }
  const body = requestSchema.safeParse(raw)
  if (
    !body.success
    || request.headers.get('x-idempotency-key') !== body.data.requestId
  ) return noStoreJson({ error: 'Geçersiz istek' }, 400)

  try {
    const cookieClient = await createClient()
    const { data: { user } } = await cookieClient.auth.getUser()
    if (!user) return noStoreJson({ error: 'Yetkisiz' }, 401)

    const userLimit = await userLimiter.check(user.id)
    if (!userLimit.success) return rateLimitFailure(userLimit)

    const attempt = await issueVerifiedTytSocialOfficialSection(
      createServiceRoleClient(),
      { userId: user.id, requestId: body.data.requestId },
    )
    const publicQuestions = toPublicVerifiedQuestions(attempt.questionSnapshots)
    if (publicQuestions.length !== 20) throw new Error('tyt_social_section_issue_failed')

    return noStoreJson({
      questions: publicQuestions,
      reviewQuestions: [],
      attemptId: attempt.attemptId,
      expiresAt: attempt.expiresAt,
    })
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : ''
    if (reason === 'tyt_social_section_setup_required') {
      return noStoreJson({
        error: 'TYT Sosyal cevaplama düzeni seçilmelidir',
        code: 'TYT_SOCIAL_POLICY_REQUIRED',
      }, 409)
    }
    if (reason === 'tyt_social_section_conflict') {
      return noStoreJson({
        error: 'TYT Sosyal bölüm isteği önceki istekle uyuşmuyor',
        code: 'TYT_SOCIAL_REQUEST_CONFLICT',
      }, 409)
    }
    if (reason === 'tyt_social_section_expired') {
      return noStoreJson({
        error: 'TYT Sosyal bölüm isteğinin süresi doldu',
        code: 'TYT_SOCIAL_REQUEST_EXPIRED',
      }, 410)
    }
    if (reason === 'tyt_social_section_unavailable') {
      return noStoreJson(
        {
          error: 'TYT Sosyal resmî bölümü henüz hazır değil',
          code: 'TYT_SOCIAL_SECTION_UNAVAILABLE',
        },
        503,
        { 'Retry-After': '60' },
      )
    }
    console.error('[/api/questions/tyt-social-section] issuance failed')
    return noStoreJson({
      error: 'Deneme başlatılamadı',
      code: 'TYT_SOCIAL_SECTION_FAILED',
    }, 500)
  }
}
