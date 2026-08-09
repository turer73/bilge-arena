import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { mockStrategyNoStoreJson, mockStrategyRpcStatus } from '@/lib/mock-strategy/server-contract'
import { mockStrategyLifecycleLimiter } from '@/lib/mock-strategy/rate-limits'

const requestSchema = z.object({
  attemptId: z.string().uuid(),
  revision: z.number().int().positive(),
  requestId: z.string().uuid(),
}).strict()

export async function POST(request: Request) {
  if (process.env.MOCK_STRATEGY_ENABLED !== 'true') {
    return mockStrategyNoStoreJson({ error: 'Strateji servisi devre dışı' }, { status: 503 })
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return mockStrategyNoStoreJson({ error: 'Geçersiz istek' }, { status: 400 })

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return mockStrategyNoStoreJson({ error: 'Yetkisiz' }, { status: 401 })
  const rateLimit = await mockStrategyLifecycleLimiter.check(user.id)
  if (!rateLimit.success) {
    return mockStrategyNoStoreJson(
      { error: 'Çok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter ?? 60) } },
    )
  }

  const admin = createServiceRoleClient()
  const { error } = await admin.rpc('record_verified_exam_exposure', {
    p_attempt_id: parsed.data.attemptId,
    p_user_id: user.id,
    p_experiment_key: 'mock_strategy_analysis_v1',
    p_revision: parsed.data.revision,
    p_request_id: parsed.data.requestId,
  })
  if (error) {
    return mockStrategyNoStoreJson(
      { error: 'Gösterim kaydedilemedi' },
      { status: mockStrategyRpcStatus(error.code) },
    )
  }
  return mockStrategyNoStoreJson({ recorded: true })
}
