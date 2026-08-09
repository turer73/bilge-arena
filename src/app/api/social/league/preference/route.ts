import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { socialLeaguePreferenceLimiter } from '@/lib/social-league/rate-limits'
import {
  socialLeagueNoStoreJson,
  socialLeaguePreferenceResultSchema,
  socialLeagueRpcStatus,
} from '@/lib/social-league/server-contract'

const requestSchema = z.object({
  optedIn: z.boolean(),
  requestId: z.string().uuid(),
}).strict()

export async function POST(request: Request) {
  if (process.env.SOCIAL_LEAGUE_ENABLED !== 'true') {
    return socialLeagueNoStoreJson({ error: 'Haftalık lig servisi devre dışı' }, { status: 503 })
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return socialLeagueNoStoreJson({ error: 'Geçersiz istek' }, { status: 400 })
  }

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return socialLeagueNoStoreJson({ error: 'Yetkisiz' }, { status: 401 })

  const rateLimit = await socialLeaguePreferenceLimiter.check(user.id)
  if (!rateLimit.success) {
    return socialLeagueNoStoreJson(
      { error: 'Çok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter ?? 60) } },
    )
  }

  const admin = createServiceRoleClient()
  const { data, error } = await admin.rpc('set_weekly_learning_league_preference', {
    p_user_id: user.id,
    p_opted_in: parsed.data.optedIn,
    p_request_id: parsed.data.requestId,
  })
  if (error) {
    return socialLeagueNoStoreJson(
      { error: 'Lig tercihi kaydedilemedi' },
      { status: socialLeagueRpcStatus(error.code) },
    )
  }

  const result = socialLeaguePreferenceResultSchema.safeParse(data)
  if (!result.success) {
    return socialLeagueNoStoreJson({ error: 'Lig tercihi kaydedilemedi' }, { status: 500 })
  }
  return socialLeagueNoStoreJson(result.data)
}
