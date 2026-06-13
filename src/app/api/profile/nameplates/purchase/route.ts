import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { z } from 'zod'
import { PROFILE_NAMEPLATES } from '@/lib/constants/profile-nameplates'

const ipLimiter = createRateLimiter('nameplate-purchase-ip', 20, 60_000)
const userLimiter = createRateLimiter('nameplate-purchase-user', 10, 60_000)

const purchaseSchema = z.object({
  nameplateId: z.string().min(1).max(32),
})

/**
 * POST /api/profile/nameplates/purchase
 *
 * Coin karşılığı isim paneli satın alma — frames/backgrounds purchase deseninin
 * aynası. Atomik purchase_nameplate RPC (migration 067): ownership + bakiye +
 * debit + append TEK UPDATE (TOCTOU'ya kapalı). Satın alma uygulamaz — seçim
 * /select ile ayrı (DB selected_nameplate).
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
    return NextResponse.json({ error: 'nameplateId gerekli' }, { status: 400 })
  }
  const { nameplateId } = parsed.data

  const npDef = PROFILE_NAMEPLATES.find((n) => n.id === nameplateId)
  if (!npDef) {
    return NextResponse.json({ error: 'Geçersiz panel' }, { status: 404 })
  }
  if (npDef.coinCost === undefined) {
    return NextResponse.json({ error: 'Bu panel ücretsiz, satın almaya gerek yok' }, { status: 400 })
  }

  const svc = createServiceRoleClient()
  const { data: rows, error: rpcErr } = await svc.rpc('purchase_nameplate', {
    p_user_id: user.id,
    p_nameplate_id: nameplateId,
    p_cost: npDef.coinCost,
  })

  if (rpcErr) {
    console.error('[NameplatePurchase] purchase_nameplate hatası:', rpcErr.message)
    return NextResponse.json({ error: 'Satın alma başarısız' }, { status: 500 })
  }

  // 0 satır = ya zaten sahip ya yetersiz coin — ayırt etmek için profili oku
  const result = Array.isArray(rows) ? rows[0] : rows
  if (!result) {
    const { data: prof } = await svc
      .from('profiles')
      .select('coin_balance, owned_nameplates')
      .eq('id', user.id)
      .single()

    if (prof && (prof.owned_nameplates as string[]).includes(nameplateId)) {
      return NextResponse.json({ error: 'Bu panele zaten sahipsiniz' }, { status: 400 })
    }
    return NextResponse.json(
      { error: `Yetersiz coin (gerekli: ${npDef.coinCost}, bakiye: ${prof?.coin_balance ?? 0})` },
      { status: 402 },
    )
  }

  return NextResponse.json({
    success: true,
    nameplateId,
    coin_balance: result.new_balance,
    owned_nameplates: result.new_owned,
  })
}
