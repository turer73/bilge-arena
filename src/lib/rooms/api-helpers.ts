/**
 * Bilge Arena Oda Sistemi: API route helpers (DRY)
 * Sprint 1 PR3b/c + 2026-05-03 rate limit hardening
 *
 * 8 endpoint (start, join, leave, cancel, kick, submit, reveal, advance)
 * ortak pattern'i yakalar:
 *   1. IP rate limit ONCE (Codex PR #78 P1: anon flood Supabase auth quota
 *      tuketmesin — auth.getUser BEFORE rate limit memory anti-pattern)
 *   2. createClient() (Panola Supabase) auth.getUser() validate
 *   3. User-id rate limit (cift kalkan, NAT abuse tolerance)
 *   4. auth.getSession() ile JWT extract
 *   5. callRpc() ile bilge-arena PostgREST RPC
 *   6. toResponse() error / NextResponse OK
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/utils/client-ip'

interface RateLimiterCheck {
  check: (key: string) => Promise<{ success: boolean; retryAfter?: number }>
}

/**
 * Auth + JWT extract. Discriminated union pattern (RpcResult ile uyumlu).
 *
 * Kullanim:
 *   const auth = await getAuthAndJwt()
 *   if (!auth.ok) return auth.response
 *   // auth.userId, auth.jwt
 */
export async function getAuthAndJwt(): Promise<
  | { ok: true; userId: string; jwt: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Yetkisiz', code: 'P0001' },
        { status: 401 },
      ),
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'JWT alinamadi (session expired?)', code: 'P0001' },
        { status: 401 },
      ),
    }
  }

  return { ok: true, userId: user.id, jwt: session.access_token }
}

/**
 * Body parse + Zod validate, error response donerse early-return.
 *
 * Kullanim:
 *   const validated = await parseBody(req, mySchema)
 *   if (!validated.ok) return validated.response
 *   // validated.data (typed)
 */
export async function parseBody<T>(
  req: Request,
  schema: { safeParse: (input: unknown) => { success: boolean; data?: T; error?: { issues: { message: string }[] } } },
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Gecersiz JSON', code: 'BAD_JSON' },
        { status: 400 },
      ),
    }
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success || !parsed.data) {
    const issues =
      parsed.error?.issues.map((i) => i.message).join(', ') ?? 'Validation hatasi'
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Validation: ${issues}`, code: 'VALIDATION' },
        { status: 400 },
      ),
    }
  }

  return { ok: true, data: parsed.data }
}

/**
 * IP-first auth + cift kalkan rate limit + JWT extract.
 *
 * Memory pattern: feedback_dual_rate_limit_pattern + feedback_auth_lookup_after_rate_limit
 * + feedback_xff_anti_spoof_helper
 *
 * Order:
 *   1. IP rate limit ONCE (cf-connecting-ip > x-real-ip > XFF rightmost)
 *      - Anon flood'da Supabase auth.getUser() quota tuketmesin
 *   2. auth.getUser() — 401 disinda devam
 *   3. User-id rate limit (auth varsa, cift kalkan NAT abuse tolerance)
 *   4. auth.getSession() — JWT extract
 *
 * Threshold ornegi: ipLimiter 4x userLimiter (NAT toleransi).
 *
 * Kullanim:
 *   const ipLimiter = createRateLimiter('rooms-submit-ip', 240, 60_000)
 *   const userLimiter = createRateLimiter('rooms-submit-user', 60, 60_000)
 *   const auth = await getAuthRateLimited(req, ipLimiter, userLimiter)
 *   if (!auth.ok) return auth.response
 */
export async function getAuthRateLimited(
  req: Request,
  ipLimiter: RateLimiterCheck,
  userLimiter: RateLimiterCheck,
): Promise<
  | { ok: true; userId: string; jwt: string }
  | { ok: false; response: NextResponse }
> {
  // 1. IP rate limit ONCE — anon flood Supabase auth quota tuketmesin
  const ip = getClientIp(req.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Cok hizli istek', code: 'RATE_LIMIT' },
        {
          status: 429,
          headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) },
        },
      ),
    }
  }

  // 2. Auth check
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Yetkisiz', code: 'P0001' },
        { status: 401 },
      ),
    }
  }

  // 3. User-id rate limit (cift kalkan)
  const userRl = await userLimiter.check(user.id)
  if (!userRl.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Cok hizli istek', code: 'RATE_LIMIT' },
        {
          status: 429,
          headers: { 'Retry-After': String(userRl.retryAfter ?? 60) },
        },
      ),
    }
  }

  // 4. JWT extract
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'JWT alinamadi (session expired?)', code: 'P0001' },
        { status: 401 },
      ),
    }
  }

  return { ok: true, userId: user.id, jwt: session.access_token }
}

/**
 * Empty-body POST handler (rooms/{id}/start, /leave, /reveal, /advance).
 * Zod parse atlanir, sadece room_id path'ten alinir.
 */
export async function parseEmptyBody(req: Request): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  // Body bos veya {} olabilir, parse hatasi tolere et
  try {
    const text = await req.text()
    if (text.length > 0 && text !== '{}') {
      // body var ama beklenmeyen — strict tutmuyoruz, sadece warn
    }
  } catch {
    // ignore
  }
  return { ok: true }
}
