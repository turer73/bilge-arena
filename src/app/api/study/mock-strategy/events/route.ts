import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { mockStrategyNoStoreJson, mockStrategyRpcStatus } from '@/lib/mock-strategy/server-contract'
import { mockStrategyEventLimiter } from '@/lib/mock-strategy/rate-limits'

const requestSchema = z.object({
  attemptId: z.string().uuid(),
  clientEventId: z.string().uuid(),
  sequence: z.number().int().positive().max(201),
  position: z.number().int().min(0).max(99),
  eventType: z.literal('question_opened'),
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
  const rateLimit = await mockStrategyEventLimiter.check(user.id)
  if (!rateLimit.success) {
    return mockStrategyNoStoreJson(
      { error: 'Çok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter ?? 60) } },
    )
  }

  const admin = createServiceRoleClient()
  const { error } = await admin.rpc('record_verified_exam_strategy_event', {
    p_attempt_id: parsed.data.attemptId,
    p_user_id: user.id,
    p_client_event_id: parsed.data.clientEventId,
    p_sequence: parsed.data.sequence,
    p_position: parsed.data.position,
    p_event_type: parsed.data.eventType,
  })
  if (error) {
    return mockStrategyNoStoreJson(
      { error: 'Olay kaydedilemedi' },
      { status: mockStrategyRpcStatus(error.code) },
    )
  }
  return mockStrategyNoStoreJson({ recorded: true })
}
