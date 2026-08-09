import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { socialLeagueReadLimiter } from '@/lib/social-league/rate-limits'
import {
  learningSpotlightsResultSchema,
  socialLeagueNoStoreJson,
  socialLeagueRpcStatus,
} from '@/lib/social-league/server-contract'

export async function GET() {
  if (process.env.SOCIAL_LEAGUE_ENABLED !== 'true'
    || process.env.SOCIAL_SPOTLIGHTS_ENABLED !== 'true') {
    return socialLeagueNoStoreJson(
      { error: 'Öğrenme spotları servisi devre dışı' },
      { status: 503 },
    )
  }

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return socialLeagueNoStoreJson({ error: 'Yetkisiz' }, { status: 401 })

  const rateLimit = await socialLeagueReadLimiter.check(user.id)
  if (!rateLimit.success) {
    return socialLeagueNoStoreJson(
      { error: 'Çok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter ?? 60) } },
    )
  }

  const admin = createServiceRoleClient()
  const { data, error } = await admin.rpc('get_my_weekly_learning_spotlights', {
    p_user_id: user.id,
  })
  if (error) {
    return socialLeagueNoStoreJson(
      { error: 'Öğrenme spotları alınamadı' },
      { status: socialLeagueRpcStatus(error.code) },
    )
  }

  const result = learningSpotlightsResultSchema.safeParse(data)
  if (!result.success) {
    return socialLeagueNoStoreJson({ error: 'Öğrenme spotları alınamadı' }, { status: 500 })
  }
  return socialLeagueNoStoreJson(result.data)
}
