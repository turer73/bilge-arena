import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { z } from 'zod'
import { getDecorationById } from '@/lib/constants/avatar-decorations'

const ipLimiter = createRateLimiter('decoration-purchase-ip', 20, 60_000)
const userLimiter = createRateLimiter('decoration-purchase-user', 10, 60_000)

const purchaseSchema = z.object({
  decorationId: z.string().min(1).max(32),
})

/**
 * POST /api/profile/avatar-decorations/purchase
 *
 * Coin karşılığı avatar süsü satın alma — nameplate purchase deseninin aynası.
 * Atomik purchase_avatar_decoration RPC (migration 069): ownership + bakiye +
 * debit + append TEK UPDATE (TOCTOU'ya kapalı). Satın alma uygulamaz — seçim
 * /select ile ayrı (DB selected_avatar_decorations, çoklu).
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
    return NextResponse.json({ error: 'decorationId gerekli' }, { status: 400 })
  }
  const { decorationId } = parsed.data

  const decoDef = getDecorationById(decorationId)
  if (!decoDef) {
    return NextResponse.json({ error: 'Geçersiz süs' }, { status: 404 })
  }
  if (decoDef.coinCost === undefined) {
    return NextResponse.json({ error: 'Bu süs ücretsiz, satın almaya gerek yok' }, { status: 400 })
  }

  const svc = createServiceRoleClient()
  const { data: rows, error: rpcErr } = await svc.rpc('purchase_avatar_decoration', {
    p_user_id: user.id,
    p_decoration_id: decorationId,
    p_cost: decoDef.coinCost,
  })

  if (rpcErr) {
    console.error('[DecorationPurchase] purchase_avatar_decoration hatası:', rpcErr.message)
    return NextResponse.json({ error: 'Satın alma başarısız' }, { status: 500 })
  }

  // 0 satır = ya zaten sahip ya yetersiz coin — ayırt etmek için profili oku
  const result = Array.isArray(rows) ? rows[0] : rows
  if (!result) {
    const { data: prof } = await svc
      .from('profiles')
      .select('coin_balance, owned_avatar_decorations')
      .eq('id', user.id)
      .single()

    if (prof && ((prof.owned_avatar_decorations as string[]) ?? []).includes(decorationId)) {
      return NextResponse.json({ error: 'Bu süse zaten sahipsiniz' }, { status: 400 })
    }
    return NextResponse.json(
      { error: `Yetersiz coin (gerekli: ${decoDef.coinCost}, bakiye: ${prof?.coin_balance ?? 0})` },
      { status: 402 },
    )
  }

  return NextResponse.json({
    success: true,
    decorationId,
    coin_balance: result.new_balance,
    owned_avatar_decorations: result.new_owned,
  })
}
