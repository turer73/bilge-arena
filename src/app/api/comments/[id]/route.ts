import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { isValidUuid } from '@/lib/utils/uuid'

const ipLimiter = createRateLimiter('comments-delete-ip', 30, 60_000)
const userLimiter = createRateLimiter('comments-delete-user', 10, 60_000)

// Klipper review P1: UUID validation ortak helper'a tasindi (B3 strict regex)

/**
 * DELETE /api/comments/[id]
 *
 * Sadece kendi yorumunu soft delete eder (is_deleted = true).
 * Madde 9 #8: client UPDATE yerine proxy.
 *
 * Auth zorunlu + ownership check (auth.uid() = user_id filter).
 * Rate limit: IP 30/dk + user 10/dk
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1) IP rate limit
  const ip = getClientIp(request.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  // 2) Auth
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  // 3) User rate limit
  const userRl = await userLimiter.check(user.id)
  if (!userRl.success) {
    return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })
  }

  // 4) Param validation
  const { id } = await params
  if (!id || !isValidUuid(id)) {
    return NextResponse.json({ error: 'id gecersiz' }, { status: 400 })
  }

  // 5) Soft delete — sadece kendi yorumu
  const admin = createServiceRoleClient()
  const { error, count } = await admin
    .from('comments')
    .update({ is_deleted: true }, { count: 'exact' })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('[/api/comments DELETE] error:', error.code)
    return NextResponse.json({ error: 'Silme basarisiz' }, { status: 500 })
  }

  if (count === 0) {
    // Yorum yok veya kullanicinin degil
    return NextResponse.json({ error: 'Yorum bulunamadi' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
