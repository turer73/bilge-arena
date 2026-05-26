import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { z } from 'zod'
import { PROFILE_FRAMES } from '@/lib/constants/profile-frames'

const ipLimiter = createRateLimiter('frame-purchase-ip', 20, 60_000)
const userLimiter = createRateLimiter('frame-purchase-user', 10, 60_000)

const purchaseSchema = z.object({
  frameId: z.string().min(1).max(32),
})

/**
 * POST /api/profile/frames/purchase
 *
 * Kullanıcı coin harcayarak bir profil çerçevesi satın alır.
 * Body: { frameId: string }
 *
 * Akış:
 * 1. Rate limit (IP + user)
 * 2. Auth check
 * 3. frameId doğrulama — coinCost tanımlı olmalı
 * 4. Zaten sahip mi kontrol
 * 5. Coin bakiyesi yeterli mi
 * 6. spend_coins RPC (atomik)
 * 7. owned_frames array'ine ekle
 * 8. Güncel profil ver
 */
export async function POST(request: NextRequest) {
  // 1) IP rate limit
  const ip = getClientIp(request.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Çok fazla istek' },
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
    return NextResponse.json({ error: 'Çok hızlı istek' }, { status: 429 })
  }

  // 4) Body doğrulama
  const body = await request.json()
  const parsed = purchaseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'frameId gerekli' }, { status: 400 })
  }
  const { frameId } = parsed.data

  // 5) Çerçeve tanımını kontrol et — coinCost tanımlı olmalı
  const frameDef = PROFILE_FRAMES.find((f) => f.id === frameId)
  if (!frameDef) {
    return NextResponse.json({ error: 'Geçersiz çerçeve' }, { status: 404 })
  }
  if (frameDef.coinCost === undefined) {
    return NextResponse.json({ error: 'Bu çerçeve ücretsiz, satın almaya gerek yok' }, { status: 400 })
  }

  const svc = createServiceRoleClient()

  // 6) Mevcut profil: owned_frames + coin_balance
  const { data: prof, error: profErr } = await svc
    .from('profiles')
    .select('coin_balance, owned_frames')
    .eq('id', user.id)
    .single()

  if (profErr || !prof) {
    return NextResponse.json({ error: 'Profil bulunamadı' }, { status: 404 })
  }

  // 7) Zaten sahip mi?
  if ((prof.owned_frames as string[]).includes(frameId)) {
    return NextResponse.json({ error: 'Bu çerçeveye zaten sahipsiniz' }, { status: 400 })
  }

  // 8) Yeterli coin var mı?
  if ((prof.coin_balance ?? 0) < frameDef.coinCost) {
    return NextResponse.json(
      { error: `Yetersiz coin (gerekli: ${frameDef.coinCost}, bakiye: ${prof.coin_balance ?? 0})` },
      { status: 402 },
    )
  }

  // 9) Coin harca (atomik RPC)
  const { error: spendErr } = await svc.rpc('spend_coins', {
    p_user_id: user.id,
    p_amount: frameDef.coinCost,
  })
  if (spendErr) {
    console.error('[FramePurchase] spend_coins hatası:', spendErr.message)
    // spend_coins RAISE EXCEPTION "Yetersiz bakiye" durumunda hata döner
    return NextResponse.json({ error: 'Coin harcama başarısız' }, { status: 402 })
  }

  // 10) owned_frames'e ekle (array_append)
  const { data: updated, error: updateErr } = await svc
    .from('profiles')
    .update({
      owned_frames: [...(prof.owned_frames as string[]), frameId],
    })
    .eq('id', user.id)
    .select('coin_balance, owned_frames')
    .single()

  if (updateErr || !updated) {
    console.error('[FramePurchase] owned_frames güncelleme hatası:', updateErr?.message)
    // Coin harcandı ama çerçeve eklenmedi — kritik hata, loglayıp devam et
    return NextResponse.json({ error: 'Çerçeve eklenemedi' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    frameId,
    coin_balance: updated.coin_balance,
    owned_frames: updated.owned_frames,
  })
}
