import { z } from 'zod'
import { requireContentGovernanceContext, contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceWriteLimiter } from '@/lib/content-governance/rate-limits'
import {
  contentGovernanceRpcStatus,
  contentNoStoreJson,
  revisionOutcomesInputSchema,
  revisionCreateResultSchema,
} from '@/lib/content-governance/server-contract'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ revisionId: string }> },
) {
  const context = await requireContentGovernanceContext(
    request,
    contentGovernanceWriteLimiter,
    'content.prepare',
  )
  if (!context.ok) return context.response
  const revisionId = z.string().uuid().safeParse((await params).revisionId)
  const body = revisionOutcomesInputSchema.safeParse(await request.json().catch(() => null))
  if (!revisionId.success || !body.success) {
    return contentNoStoreJson({ error: 'Geçersiz kazanım eşleme isteği' }, { status: 400 })
  }
  const { data, error } = await contentRpc(context.admin, 'set_question_revision_outcomes', {
    p_user_id: context.userId,
    p_revision_id: revisionId.data,
    p_outcomes: body.data.outcomes,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return contentNoStoreJson(
      { error: 'Kazanım eşlemesi kaydedilemedi' },
      { status: contentGovernanceRpcStatus(error.code) },
    )
  }
  const result = revisionCreateResultSchema.safeParse(data)
  return result.success
    ? contentNoStoreJson(result.data)
    : contentNoStoreJson({ error: 'Kazanım eşlemesi kaydedilemedi' }, { status: 500 })
}
