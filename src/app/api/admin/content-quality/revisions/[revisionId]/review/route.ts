import { z } from 'zod'
import { requireContentGovernanceContext, contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceWriteLimiter } from '@/lib/content-governance/rate-limits'
import { contentGovernanceRpcStatus, contentNoStoreJson, revisionReviewInputSchema, revisionReviewResultSchema } from '@/lib/content-governance/server-contract'
export async function POST(request: Request, { params }: { params: Promise<{ revisionId: string }> }) {
  // Determine the required scope without producing a validation response before
  // the rollout/auth gate. An invalid stage falls back to an ordinary admin scope.
  const raw = await request.json().catch(() => null) as { stage?: unknown } | null
  const permission = raw?.stage === 2 ? 'content.review.stage2' : 'content.review.stage1'
  const context = await requireContentGovernanceContext(request, contentGovernanceWriteLimiter, permission)
  if (!context.ok) return context.response
  const id = z.string().uuid().safeParse((await params).revisionId); const body = revisionReviewInputSchema.safeParse(raw)
  if (!id.success || !body.success) return contentNoStoreJson({ error: 'Geçersiz inceleme isteği' }, { status: 400 })
  const { data, error } = await contentRpc(context.admin, 'review_question_content_revision', { p_user_id: context.userId, p_revision_id: id.data, p_stage: body.data.stage, p_decision: body.data.decision, p_rationale: body.data.rationale, p_request_id: body.data.requestId })
  if (error) return contentNoStoreJson({ error: 'İnceleme kaydedilemedi' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = revisionReviewResultSchema.safeParse(data); return result.success ? contentNoStoreJson(result.data) : contentNoStoreJson({ error: 'İnceleme kaydedilemedi' }, { status: 500 })
}
