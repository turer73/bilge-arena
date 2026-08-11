import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import {
  ACTIVATION_REWARD_COOKIE,
  claimActivationReward,
  readActivationRewardCookie,
} from '@/lib/activation/server-reward'

const claimLimiter = createRateLimiter('activation-reward-claim', 5, 60_000)

/** OAuth callback'teki geçici altyapı hataları için idempotent ödül retry'si. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const rateLimit = await claimLimiter.check(user.id)
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Çok hızlı istek' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter ?? 60) } },
    )
  }

  const rewardToken = readActivationRewardCookie(request.headers.get('cookie'))
  if (!rewardToken) return new NextResponse(null, { status: 204 })

  try {
    const reward = await claimActivationReward(createServiceRoleClient(), user.id, rewardToken)
    if (!reward) {
      return NextResponse.json({ error: 'Ödül henüz doğrulanamadı' }, { status: 409 })
    }

    const response = NextResponse.json(reward, { headers: { 'Cache-Control': 'no-store' } })
    response.cookies.delete(ACTIVATION_REWARD_COOKIE)
    return response
  } catch (error) {
    console.error('[ActivationReward] retry başarısız:', (error as Error).message)
    return NextResponse.json(
      { error: 'Ödül geçici olarak uygulanamadı' },
      { status: 503, headers: { 'Retry-After': '15' } },
    )
  }
}
