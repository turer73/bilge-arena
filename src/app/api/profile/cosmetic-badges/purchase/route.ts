import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { z } from 'zod'

const ipLimiter = createRateLimiter('badge-purchase-ip', 20, 60_000)
const userLimiter = createRateLimiter('badge-purchase-user', 10, 60_000)

const purchaseSchema = z.object({
  badgeId: z.string().min(1).max(40),
})

/**
 * POST /api/profile/cosmetic-badges/purchase
 *
 * Coin'le kozmetik rozet satın alma. Rozetlerin tümü DB'de (cosmetic_badges);
 * fiyat oradan okunur (yalnız yayında olanlar). Atomik purchase_cosmetic_badge
 * RPC (migration 068). backgrounds video purchase deseninin aynası.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Çok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const userRl = await userLimiter.check(user.id)
  if (!userRl.success) {
    return NextResponse.json({ error: 'Çok hızlı istek' }, { status: 429 })
  }

  const body = await request.json()
  const parsed = purchaseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'badgeId gerekli' }, { status: 400 })
  }
  const { badgeId } = parsed.data

  const svc = createServiceRoleClient()

  // Fiyat DB'den (yalnız yayında olan rozet satın alınabilir)
  const { data: badge } = await svc
    .from('cosmetic_badges')
    .select('coin_cost, is_published')
    .eq('slug', badgeId)
    .maybeSingle()
  if (!badge || !badge.is_published) {
    return NextResponse.json({ error: 'Geçersiz rozet' }, { status: 404 })
  }

  const { data: rows, error: rpcErr } = await svc.rpc('purchase_cosmetic_badge', {
    p_user_id: user.id,
    p_badge_id: badgeId,
    p_cost: badge.coin_cost,
  })

  if (rpcErr) {
    console.error('[BadgePurchase] purchase_cosmetic_badge hatası:', rpcErr.message)
    return NextResponse.json({ error: 'Satın alma başarısız' }, { status: 500 })
  }

  // 0 satır = zaten sahip ya da yetersiz coin
  const result = Array.isArray(rows) ? rows[0] : rows
  if (!result) {
    const { data: prof } = await svc
      .from('profiles')
      .select('coin_balance, owned_cosmetic_badges')
      .eq('id', user.id)
      .single()

    if (prof && (prof.owned_cosmetic_badges as string[]).includes(badgeId)) {
      return NextResponse.json({ error: 'Bu rozete zaten sahipsiniz' }, { status: 400 })
    }
    return NextResponse.json(
      { error: `Yetersiz coin (gerekli: ${badge.coin_cost}, bakiye: ${prof?.coin_balance ?? 0})` },
      { status: 402 },
    )
  }

  return NextResponse.json({
    success: true,
    badgeId,
    coin_balance: result.new_balance,
    owned_cosmetic_badges: result.new_owned,
  })
}
