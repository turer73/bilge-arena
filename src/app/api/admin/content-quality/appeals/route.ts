import { z } from 'zod'
import { requireContentGovernanceContext, contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceReadLimiter } from '@/lib/content-governance/rate-limits'
import { appealAdminQueueSchema, contentGovernanceRpcStatus, contentNoStoreJson } from '@/lib/content-governance/server-contract'

const querySchema = z.object({
  status: z.enum(['submitted', 'acknowledged', 'investigating', 'resolved', 'rejected', 'withdrawn']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).default(''),
}).strict()

export async function GET(request: Request) {
  const context = await requireContentGovernanceContext(request, contentGovernanceReadLimiter, 'content.appeals.manage')
  if (!context.ok) return context.response
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return contentNoStoreJson({ error: 'Geçersiz itiraz kuyruğu sorgusu' }, { status: 400 })
  const { data, error } = await contentRpc(context.admin, 'get_question_appeal_queue', {
    p_user_id: context.userId,
    p_status: parsed.data.status ?? null,
    p_limit: parsed.data.limit,
    p_cursor: parsed.data.cursor,
  })
  if (error) return contentNoStoreJson({ error: 'İtiraz kuyruğu alınamadı' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = appealAdminQueueSchema.safeParse(data)
  return result.success ? contentNoStoreJson(result.data) : contentNoStoreJson({ error: 'İtiraz kuyruğu alınamadı' }, { status: 500 })
}
