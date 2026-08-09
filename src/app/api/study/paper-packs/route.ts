import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { trDayString } from '@/lib/utils/tr-date'
import { paperPackIssueLimiter } from '@/lib/paper-mode/rate-limits'
import {
  paperPackCreateInputSchema,
  paperPackIssueResultSchema,
  paperPackRpcStatus,
  privateNoStoreJson,
} from '@/lib/paper-mode/server-contract'

export async function POST(request: Request) {
  if (process.env.PAPER_MODE_ENABLED !== 'true') {
    return privateNoStoreJson({ error: 'Kağıt modu devre dışı' }, { status: 503 })
  }

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return privateNoStoreJson({ error: 'Yetkisiz' }, { status: 401 })

  const rateLimit = await paperPackIssueLimiter.check(user.id)
  if (!rateLimit.success) {
    return privateNoStoreJson(
      { error: 'Çok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter ?? 60) } },
    )
  }

  const body = paperPackCreateInputSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return privateNoStoreJson({ error: 'Geçersiz istek' }, { status: 400 })

  const admin = createServiceRoleClient()
  let query = admin
    .from('daily_plan')
    .select('id')
    .eq('user_id', user.id)
    .eq('game', body.data.game)
    .eq('plan_date', trDayString())
  query = body.data.examRef === null
    ? query.is('exam_ref', null)
    : query.eq('exam_ref', body.data.examRef)

  const { data: plan, error: planError } = await query.maybeSingle()
  if (planError) {
    return privateNoStoreJson({ error: 'Günlük plan alınamadı' }, { status: 500 })
  }
  if (!plan) return privateNoStoreJson({ error: 'Bugünün planı bulunamadı' }, { status: 404 })

  const { data, error } = await admin.rpc('issue_paper_study_pack', {
    p_user_id: user.id,
    p_plan_id: plan.id,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return privateNoStoreJson(
      { error: 'Kağıt paketi hazırlanamadı' },
      { status: paperPackRpcStatus(error.code) },
    )
  }

  const result = paperPackIssueResultSchema.safeParse(data)
  if (!result.success) {
    return privateNoStoreJson({ error: 'Kağıt paketi hazırlanamadı' }, { status: 500 })
  }
  return privateNoStoreJson(result.data)
}
