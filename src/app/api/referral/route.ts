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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  // Kendi kodunu al
  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('id', user.id)
    .single()

  // Kac kisi davet etti
  const { count } = await supabase
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const rl = await referralLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const parsed = referralApplySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Gecersiz kod' }, { status: 400 })
  const { code } = parsed.data

  // Kendi kodunu kullanamaz
  const { data: myProfile } = await supabase
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

  // Kodu bul
  const { data: referrer } = await supabase
    .from('profiles')
    .select('id')
    .eq('referral_code', code.toUpperCase())
    .single()

  if (!referrer) {
    return NextResponse.json({ error: 'Gecersiz davet kodu' }, { status: 404 })
  }

  const svc = createServiceRoleClient()

  // referred_by guncelle
  await svc.from('profiles').update({ referred_by: referrer.id }).eq('id', user.id)

  // Odul kaydi
  const { error } = await svc
    .from('referral_rewards')
    .insert({ referrer_id: referrer.id, referred_id: user.id, xp_awarded: REFERRAL_XP })

  if (error) {
    return NextResponse.json({ error: 'Odul kaydi basarisiz' }, { status: 500 })
  }

  // Her iki tarafa XP ver
  await svc.rpc('increment_xp', { p_user_id: referrer.id, p_amount: REFERRAL_XP })
  await svc.rpc('increment_xp', { p_user_id: user.id, p_amount: REFERRAL_XP })

  // XP log kaydi
  await svc.from('xp_log').insert([
    { user_id: referrer.id, amount: REFERRAL_XP, reason: 'referral' },
    { user_id: user.id, amount: REFERRAL_XP, reason: 'referral' },
  ])

  return NextResponse.json({ status: 'claimed', xpAwarded: REFERRAL_XP })
}
