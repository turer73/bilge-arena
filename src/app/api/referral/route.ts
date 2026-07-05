import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { referralApplySchema } from '@/lib/validations/schemas'

const REFERRAL_XP = 100 // Davet eden ve edilen icin
const referralLimiter = createRateLimiter('referral-apply', 3, 60_000)

/**
 * GET /api/referral — Kendi referral kodunu ve istatistiklerini al
 * POST /api/referral — Referral kodu uygula (yeni kayit sonrasi)
 */

export async function GET() {
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  // Mig 049 prereq: profiles authenticated REVOKE'a hazirlik
  const svc = createServiceRoleClient()

  // Kendi kodunu al
  const { data: profile } = await svc
    .from('profiles')
    .select('referral_code')
    .eq('id', user.id)
    .single()

  // Kac kisi davet etti
  const { count } = await svc
    .from('referral_rewards')
    .select('*', { count: 'exact', head: true })
    .eq('referrer_id', user.id)

  return NextResponse.json({
    code: profile?.referral_code || null,
    totalReferred: count || 0,
    xpPerReferral: REFERRAL_XP,
  })
}

export async function POST(req: Request) {
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const rl = await referralLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const parsed = referralApplySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Gecersiz kod' }, { status: 400 })
  const { code } = parsed.data

  // Mig 049 prereq: profiles authenticated REVOKE'a hazirlik
  const svc = createServiceRoleClient()

  // Kendi kodunu kullanamaz — sadece kendi profili (auth.uid() guard)
  const { data: myProfile } = await svc
    .from('profiles')
    .select('referral_code, referred_by')
    .eq('id', user.id)
    .single()

  if (myProfile?.referral_code === code.toUpperCase()) {
    return NextResponse.json({ error: 'Kendi kodunu kullanamazsin' }, { status: 400 })
  }

  // Zaten bir referral kullanmis mi
  if (myProfile?.referred_by) {
    return NextResponse.json({ error: 'Zaten bir davet kodu kullandin' }, { status: 409 })
  }

  // Kodu bul — referrer arama icin profiles SELECT (referral_code public lookup)
  const { data: referrer } = await svc
    .from('profiles')
    .select('id')
    .eq('referral_code', code.toUpperCase())
    .single()

  if (!referrer) {
    return NextResponse.json({ error: 'Gecersiz davet kodu' }, { status: 404 })
  }

  // TOCTOU fix: referred_by'i ATOMIK set — yalniz henuz null'sa. Iki farkli
  // gecerli kodla eszamanlı 2 istek ikisi de snapshot'ta null gorup cift-XP
  // aliyordu (UNIQUE(referrer_id,referred_id) farkli referrer'da bloklamaz).
  // Kosullu UPDATE + rows-affected kontrolu (daily-login deseni) tek-kazanan.
  const { data: claimed } = await svc
    .from('profiles')
    .update({ referred_by: referrer.id })
    .eq('id', user.id)
    .is('referred_by', null)
    .select('id')

  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: 'Zaten bir davet kodu kullandin' }, { status: 409 })
  }

  // Odul kaydi
  const { error } = await svc
    .from('referral_rewards')
    .insert({ referrer_id: referrer.id, referred_id: user.id, xp_awarded: REFERRAL_XP })

  if (error) {
    return NextResponse.json({ error: 'Odul kaydi basarisiz' }, { status: 500 })
  }

  // Her iki tarafa XP ver (xp_log + seviye increment_xp icinde yazilir)
  await svc.rpc('increment_xp', { p_user_id: referrer.id, p_amount: REFERRAL_XP, p_reason: 'referral' })
  await svc.rpc('increment_xp', { p_user_id: user.id, p_amount: REFERRAL_XP, p_reason: 'referral' })

  return NextResponse.json({ status: 'claimed', xpAwarded: REFERRAL_XP })
}
