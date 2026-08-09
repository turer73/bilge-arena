import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  socialLeagueFormationResultSchema,
  socialLeagueNoStoreJson,
  socialLeagueRpcStatus,
} from '@/lib/social-league/server-contract'
import { formationRequestId, getIstanbulWeekStart } from '@/lib/social-league/weekly-formation'

export async function GET(request: Request) {
  if (process.env.SOCIAL_LEAGUE_ENABLED !== 'true') {
    return socialLeagueNoStoreJson({ error: 'Haftalık lig servisi devre dışı' }, { status: 503 })
  }

  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return socialLeagueNoStoreJson({ error: 'CRON_SECRET ayarlanmamış' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return socialLeagueNoStoreJson({ error: 'Yetkisiz' }, { status: 401 })
  }

  const weekStart = getIstanbulWeekStart()
  const admin = createServiceRoleClient()
  const { data, error } = await admin.rpc('form_weekly_learning_leagues', {
    p_week_start: weekStart,
    p_request_id: formationRequestId(weekStart),
  })
  if (error) {
    return socialLeagueNoStoreJson(
      { error: 'Haftalık lig oluşturulamadı' },
      { status: socialLeagueRpcStatus(error.code) },
    )
  }

  const result = socialLeagueFormationResultSchema.safeParse(data)
  if (!result.success) {
    return socialLeagueNoStoreJson({ error: 'Haftalık lig oluşturulamadı' }, { status: 500 })
  }
  return socialLeagueNoStoreJson(result.data)
}
