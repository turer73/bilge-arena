import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { buildMockStrategyAnalysis } from '@/lib/mock-strategy/analysis'
import { mockStrategyPublicResponseSchema } from '@/lib/mock-strategy/public-contract'
import {
  mockStrategyEvidenceResultSchema,
  mockStrategyNoStoreJson,
  mockStrategyRpcStatus,
} from '@/lib/mock-strategy/server-contract'
import { mockStrategyLifecycleLimiter } from '@/lib/mock-strategy/rate-limits'

const querySchema = z.object({ attemptId: z.string().uuid() }).strict()

export async function GET(request: Request) {
  if (process.env.MOCK_STRATEGY_ENABLED !== 'true') {
    return mockStrategyNoStoreJson({ error: 'Strateji servisi devre dışı' }, { status: 503 })
  }
  const params = Object.fromEntries(new URL(request.url).searchParams.entries())
  const parsed = querySchema.safeParse(params)
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
  const { data, error } = await admin.rpc('get_verified_exam_strategy_evidence', {
    p_attempt_id: parsed.data.attemptId,
    p_user_id: user.id,
  })
  if (error) {
    return mockStrategyNoStoreJson(
      { error: 'Strateji analizi alınamadı' },
      { status: mockStrategyRpcStatus(error.code) },
    )
  }
  const evidence = mockStrategyEvidenceResultSchema.safeParse(data)
  if (!evidence.success) {
    return mockStrategyNoStoreJson({ error: 'Strateji analizi alınamadı' }, { status: 500 })
  }

  const analysis = evidence.data.variant === 'treatment'
    ? buildMockStrategyAnalysis({
        plannedCount: evidence.data.plannedCount,
        startedAt: evidence.data.startedAt,
        deadlineAt: evidence.data.deadlineAt,
        items: evidence.data.items,
      })
    : null
  const response = mockStrategyPublicResponseSchema.safeParse({
    experiment: {
      key: evidence.data.experimentKey,
      revision: evidence.data.revision,
      variant: evidence.data.variant,
    },
    analysis,
  })
  if (!response.success) {
    return mockStrategyNoStoreJson({ error: 'Strateji analizi alınamadı' }, { status: 500 })
  }
  return mockStrategyNoStoreJson(response.data)
}
