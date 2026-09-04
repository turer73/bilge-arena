import { NextResponse, type NextRequest } from 'next/server'

import {
  getTytSocialPolicyResponseSchema,
  setTytSocialPolicyRequestSchema,
  setTytSocialPolicyResponseSchema,
  TYT_SOCIAL_POLICY_NOTICE_VERSION,
} from '@/lib/exam-policy/tyt-social-contract'
import { createClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/utils/client-ip'
import { createRateLimiter, type RateLimitResult } from '@/lib/utils/rate-limit'
import { isTytSocialV2LearnerEnabled } from '@/lib/feature-flags/tyt-social-v2-server'

const ipLimiter = createRateLimiter('tyt-social-exam-policy-ip', 30, 60_000)
const userLimiter = createRateLimiter('tyt-social-exam-policy-user', 12, 60_000)

type AuthorizedRequest =
  | { response: NextResponse }
  | { cookieClient: Awaited<ReturnType<typeof createClient>> }

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

async function authorizeAndRateLimit(request: NextRequest): Promise<AuthorizedRequest> {
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return { response: noStoreJson({ error: 'Yetkisiz' }, 401) }

  const ipLimit = await ipLimiter.check(getClientIp(request.headers))
  if (!ipLimit.success) return { response: rateLimitFailure(ipLimit) }

  const userLimit = await userLimiter.check(user.id)
  if (!userLimit.success) return { response: rateLimitFailure(userLimit) }

  return { cookieClient }
}

function rpcFailureStatus(error: { code?: string; message?: string }): 400 | 401 | 429 | 503 {
  if (error.code === '42501') return 401
  if (error.code === '22023') return 400

  // Migration 205 enforces the per-user 15-second and six-per-day write cap.
  // Its explicit rate-limit error is safe to surface only as a generic 429.
  return error.code === '55000'
    && error.message === 'TYT Social policy selection rate limit exceeded'
    ? 429
    : 503
}

export async function GET(request: NextRequest) {
  if (!isTytSocialV2LearnerEnabled()) {
    return noStoreJson({ error: 'TYT Sosyal V2 akışı henüz etkin değil' }, 503)
  }
  try {
    const authorized = await authorizeAndRateLimit(request)
    if ('response' in authorized) return authorized.response

    const { data, error } = await authorized.cookieClient.rpc('get_my_tyt_social_exam_policy')
    if (error) return noStoreJson({ error: 'Politika alınamadı' }, rpcFailureStatus(error))

    const parsed = getTytSocialPolicyResponseSchema.safeParse(data)
    if (!parsed.success) return noStoreJson({ error: 'Politika alınamadı' }, 503)

    return noStoreJson(parsed.data)
  } catch {
    return noStoreJson({ error: 'Politika alınamadı' }, 503)
  }
}

export async function PUT(request: NextRequest) {
  if (!isTytSocialV2LearnerEnabled()) {
    return noStoreJson({ error: 'TYT Sosyal V2 akışı henüz etkin değil' }, 503)
  }
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return noStoreJson({ error: 'Geçersiz istek' }, 400)
  }

  const requestBody = setTytSocialPolicyRequestSchema.safeParse(raw)
  if (!requestBody.success) return noStoreJson({ error: 'Geçersiz istek' }, 400)
  if (request.headers.get('x-idempotency-key') !== requestBody.data.requestId) {
    return noStoreJson({ error: 'Geçersiz istek' }, 400)
  }

  try {
    const authorized = await authorizeAndRateLimit(request)
    if ('response' in authorized) return authorized.response

    const { data, error } = await authorized.cookieClient.rpc('set_my_tyt_social_exam_policy', {
      p_variant: requestBody.data.variant,
      p_notice_version: TYT_SOCIAL_POLICY_NOTICE_VERSION,
      p_request_id: requestBody.data.requestId,
    })
    if (error) {
      const status = rpcFailureStatus(error)
      return noStoreJson(
        {
          error: status === 400
            ? 'Geçersiz istek'
            : status === 401
              ? 'Yetkisiz'
              : status === 429
                ? 'Çok fazla istek'
                : 'Politika kaydedilemedi',
        },
        status,
      )
    }

    const parsed = setTytSocialPolicyResponseSchema.safeParse(data)
    if (!parsed.success) return noStoreJson({ error: 'Politika kaydedilemedi' }, 503)

    return noStoreJson(parsed.data)
  } catch {
    return noStoreJson({ error: 'Politika kaydedilemedi' }, 503)
  }
}
