import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getClientIp } from '@/lib/utils/client-ip'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import type { Json } from '@/types/database.generated'

const consentLimiter = createRateLimiter('consent-log', 10, 60_000)

const consentSchema = z.object({
  type: z.literal('cookie'),
  value: z.object({
    essential: z.literal(true),
    analytics: z.boolean(),
  }).strict(),
}).strict()

const COOKIE_POLICY_VERSION = 'cookie-policy@2026-05-17-v1'

function isJson(value: unknown): value is Json {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) return true
  if (Array.isArray(value)) return value.every(isJson)
  if (typeof value === 'object') {
    return Object.values(value).every((entry) => isJson(entry))
  }
  return false
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store', ...headers },
  })
}

export async function POST(request: Request) {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return json({ ok: false }, 400)
  }

  const parsed = consentSchema.safeParse(raw)
  if (!parsed.success || !isJson(parsed.data.value)) {
    return json({ ok: false }, 400)
  }

  const serialized = JSON.stringify(parsed.data.value)
  if (serialized.length > 4096) {
    return json({ ok: false }, 413)
  }

  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  const ip = getClientIp(request.headers)
  const limiterKey = user?.id ?? (ip === 'unknown' ? 'anonymous' : ip)
  const limit = await consentLimiter.check(limiterKey)
  if (!limit.success) {
    const unavailable = limit.reason === 'backend_unavailable'
    return json(
      { ok: false },
      unavailable ? 503 : 429,
      { 'Retry-After': String(limit.retryAfter ?? 60) },
    )
  }

  const value: Json = {
    ...parsed.data.value,
    policyVersion: COOKIE_POLICY_VERSION,
    source: 'cookie_banner',
  }
  const { error } = await createServiceRoleClient().from('consent_logs').insert({
    user_id: user?.id ?? null,
    consent_type: parsed.data.type,
    consent_value: value,
    ip_address: ip === 'unknown' ? null : ip,
    user_agent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
  })
  if (error) return json({ ok: false }, 500)

  return json({ ok: true })
}
