import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { z } from 'zod'
import { PROFILE_BACKGROUNDS } from '@/lib/constants/profile-backgrounds'

const ipLimiter = createRateLimiter('background-purchase-ip', 20, 60_000)
const userLimiter = createRateLimiter('background-purchase-user', 10, 60_000)

const purchaseSchema = z.object({
  backgroundId: z.string().min(1).max(40),
})

/**
 * POST /api/profile/backgrounds/purchase
 *
 * Coin karşılığı profil arka planı satın alma — frames/purchase deseninin
 * birebir aynası. Atomik purchase_background RPC (migration 063):
 * ownership + bakiye + debit + append TEK UPDATE (TOCTOU'ya kapalı).
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
    return NextResponse.json({ error: 'backgroundId gerekli' }, { status: 400 })
  }
  const { backgroundId } = parsed.data

  const bgDef = PROFILE_BACKGROUNDS.find((b) => b.id === backgroundId)
  if (!bgDef) {
    return NextResponse.json({ error: 'Geçersiz arka plan' }, { status: 404 })
  }
  if (bgDef.coinCost === undefined) {
    return NextResponse.json({ error: 'Bu arka plan ücretsiz, satın almaya gerek yok' }, { status: 400 })
  }

  const svc = createServiceRoleClient()
  const { data: rows, error: rpcErr } = await svc.rpc('purchase_background', {
    p_user_id: user.id,
    p_background_id: backgroundId,
    p_cost: bgDef.coinCost,
  })

  if (rpcErr) {
    console.error('[BackgroundPurchase] purchase_background hatası:', rpcErr.message)
    return NextResponse.json({ error: 'Satın alma başarısız' }, { status: 500 })
  }

  // 0 satır = ya zaten sahip ya yetersiz coin — ayırt etmek için profili oku
  const result = Array.isArray(rows) ? rows[0] : rows
  if (!result) {
    const { data: prof } = await svc
      .from('profiles')
      .select('coin_balance, owned_backgrounds')
      .eq('id', user.id)
      .single()

    if (prof && (prof.owned_backgrounds as string[]).includes(backgroundId)) {
      return NextResponse.json({ error: 'Bu arka plana zaten sahipsiniz' }, { status: 400 })
    }
    return NextResponse.json(
      { error: `Yetersiz coin (gerekli: ${bgDef.coinCost}, bakiye: ${prof?.coin_balance ?? 0})` },
      { status: 402 },
    )
  }

  return NextResponse.json({
    success: true,
    backgroundId,
    coin_balance: result.new_balance,
    owned_backgrounds: result.new_owned,
  })
}
