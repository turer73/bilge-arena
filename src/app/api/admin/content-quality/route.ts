import { z } from 'zod'
import { requireContentGovernanceContext, contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceReadLimiter } from '@/lib/content-governance/rate-limits'
import { contentGovernanceRpcStatus, contentNoStoreJson, queueSchema, revisionSchema } from '@/lib/content-governance/server-contract'

const querySchema = z.object({
  status: z.enum(['draft', 'stage1_approved', 'stage2_approved', 'published', 'rejected', 'superseded']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().max(500).default(''),
  revisionId: z.string().uuid().optional(), questionId: z.string().uuid().optional(),
}).strict().refine((value) => !(value.revisionId && value.questionId))
export async function GET(request: Request) {
  const context = await requireContentGovernanceContext(request, contentGovernanceReadLimiter, [
    'content.prepare', 'content.review.stage1', 'content.review.stage2', 'content.publish',
    'content.appeals.manage', 'content.corrections.apply', 'content.psychometrics.refresh',
  ])
  if (!context.ok) return context.response
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return contentNoStoreJson({ error: 'Geçersiz kalite sorgusu' }, { status: 400 })
  const { revisionId, questionId, ...input } = parsed.data
  const rpc = revisionId ? 'get_question_content_revision' : questionId ? 'get_published_question_content_revision' : 'get_question_content_governance_queue'
  const args = revisionId
    ? { p_user_id: context.userId, p_revision_id: revisionId }
    : questionId
      ? { p_user_id: context.userId, p_question_id: questionId }
      : { p_user_id: context.userId, p_status: input.status ?? null, p_limit: input.limit, p_cursor: input.cursor }
  const { data, error } = await contentRpc(context.admin, rpc, args)
  if (error) return contentNoStoreJson({ error: 'Kalite verisi alınamadı' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = (revisionId || questionId ? revisionSchema : queueSchema).safeParse(data)
  return result.success ? contentNoStoreJson(result.data) : contentNoStoreJson({ error: 'Kalite verisi alınamadı' }, { status: 500 })
}
