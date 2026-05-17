import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { isValidUuid } from '@/lib/utils/uuid'

const ipLimiter = createRateLimiter('comments-like-ip', 60, 60_000)
const userLimiter = createRateLimiter('comments-like-user', 30, 60_000)

// Klipper review P1: UUID validation ortak helper'a tasindi (B3 strict regex)

/**
 * POST /api/comments/[id]/like   -> like ekle
 * DELETE /api/comments/[id]/like -> like kaldir
 *
 * Madde 9 #8: client INSERT/DELETE yerine proxy.
 *
 * Auth zorunlu. Ownership user.id ile zorlanir (her kullanici sadece kendi
 * like'ini ekler/siler). Idempotent — ayni like'i tekrar eklemek 409 yerine
 * 200 doner (UI tarafindan optimistic update kolay olsun).
 *
 * Rate limit: IP 60/dk + user 30/dk
 */

async function checkLimits(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return {
      block: NextResponse.json(
        { error: 'Cok fazla istek' },
        { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
      ),
    }
  }

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) {
    return { block: NextResponse.json({ error: 'Yetkisiz' }, { status: 401 }) }
  }

  const userRl = await userLimiter.check(user.id)
  if (!userRl.success) {
    return { block: NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 }) }
  }

  return { user }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const check = await checkLimits(request)
  if (check.block) return check.block

  const { id } = await params
  if (!id || !isValidUuid(id)) {
    return NextResponse.json({ error: 'id gecersiz' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  // Idempotent: ON CONFLICT DO NOTHING benzeri davranis — upsert
  const { error } = await admin
    .from('comment_likes')
    .upsert(
      { user_id: check.user.id, comment_id: id },
      { onConflict: 'user_id,comment_id', ignoreDuplicates: true },
    )

  if (error) {
    console.error('[/api/comments/[id]/like POST] error:', error.code)
    return NextResponse.json({ error: 'Like eklenemedi' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const check = await checkLimits(request)
  if (check.block) return check.block

  const { id } = await params
  if (!id || !isValidUuid(id)) {
    return NextResponse.json({ error: 'id gecersiz' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const { error } = await admin
    .from('comment_likes')
    .delete()
    .eq('user_id', check.user.id)
    .eq('comment_id', id)

  if (error) {
    console.error('[/api/comments/[id]/like DELETE] error:', error.code)
    return NextResponse.json({ error: 'Like kaldirilamadi' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
