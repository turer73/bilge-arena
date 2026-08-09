import { z } from 'zod'
import { requireContentGovernanceContext, contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceWriteLimiter } from '@/lib/content-governance/rate-limits'
import { contentGovernanceRpcStatus, contentNoStoreJson, psychometricRefreshInputSchema, psychometricResultSchema } from '@/lib/content-governance/server-contract'

export async function POST(request: Request, { params }: { params: Promise<{ revisionId: string }> }) {
  const context = await requireContentGovernanceContext(request, contentGovernanceWriteLimiter, 'content.psychometrics.refresh')
  if (!context.ok) return context.response
  const revisionId = z.string().uuid().safeParse((await params).revisionId)
  const body = psychometricRefreshInputSchema.safeParse(await request.json().catch(() => null))
  if (!revisionId.success || !body.success) return contentNoStoreJson({ error: 'Geçersiz psikometri penceresi' }, { status: 400 })
  const { data, error } = await contentRpc(context.admin, 'materialize_question_revision_psychometrics', {
    p_user_id: context.userId,
    p_revision_id: revisionId.data,
    p_window_start: body.data.windowStart,
    p_window_end: body.data.windowEnd,
    p_request_id: body.data.requestId,
  })
  if (error) return contentNoStoreJson({ error: 'Psikometri yenilenemedi' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = psychometricResultSchema.safeParse(data)
  return result.success ? contentNoStoreJson(result.data) : contentNoStoreJson({ error: 'Psikometri yenilenemedi' }, { status: 500 })
}
