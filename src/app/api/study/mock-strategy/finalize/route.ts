import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { mockStrategyNoStoreJson, mockStrategyRpcStatus } from '@/lib/mock-strategy/server-contract'
import { mockStrategyLifecycleLimiter } from '@/lib/mock-strategy/rate-limits'

const requestSchema = z.object({
  attemptId: z.string().uuid(),
  sessionId: z.string().uuid(),
  requestId: z.string().uuid(),
}).strict()

const resultSchema = z.object({
  sessionId: z.string().uuid(),
  finalizedAt: z.string().datetime({ offset: true }),
  replayed: z.boolean(),
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
  const { data, error } = await admin.rpc('finalize_verified_exam_attempt', {
    p_attempt_id: parsed.data.attemptId,
    p_user_id: user.id,
    p_request_id: parsed.data.requestId,
  })
  if (error) {
    return mockStrategyNoStoreJson(
      { error: 'Strateji analizi tamamlanamadı' },
      { status: mockStrategyRpcStatus(error.code) },
    )
  }
  const result = resultSchema.safeParse(data)
  if (!result.success || result.data.sessionId !== parsed.data.sessionId) {
    return mockStrategyNoStoreJson({ error: 'Strateji analizi tamamlanamadı' }, { status: 409 })
  }
  return mockStrategyNoStoreJson({ finalized: true, replayed: result.data.replayed })
}
