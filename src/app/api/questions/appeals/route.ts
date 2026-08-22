import { requireContentGovernanceContext, contentRpc } from '@/lib/content-governance/route-context'
import { contentAppealWriteLimiter, contentGovernanceReadLimiter } from '@/lib/content-governance/rate-limits'
import { appealListSchema, appealSubmitInputSchema, appealSubmitResultSchema, contentGovernanceRpcStatus, contentNoStoreJson } from '@/lib/content-governance/server-contract'

export async function GET(request: Request) {
  const context = await requireContentGovernanceContext(request, contentGovernanceReadLimiter)
  if (!context.ok) return context.response
  const { data, error } = await contentRpc(context.admin, 'get_my_question_appeals', { p_user_id: context.userId })
  if (error) return contentNoStoreJson({ error: 'İtirazlar alınamadı' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = appealListSchema.safeParse(data)
  return result.success ? contentNoStoreJson(result.data) : contentNoStoreJson({ error: 'İtirazlar alınamadı' }, { status: 500 })
}

export async function POST(request: Request) {
  const context = await requireContentGovernanceContext(request, contentAppealWriteLimiter)
  if (!context.ok) return context.response
  const body = appealSubmitInputSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return contentNoStoreJson({ error: 'Geçersiz itiraz isteği' }, { status: 400 })
  const { data, error } = await contentRpc(context.admin, 'submit_question_appeal_v2', {
    p_user_id: context.userId,
    p_question_id: body.data.questionId,
    p_session_answer_id: body.data.sessionAnswerId,
    p_attempt_id: body.data.attemptId,
    p_reason: body.data.reason,
    p_description: body.data.explanation,
    p_request_id: body.data.requestId,
  })
  if (error?.code === '23505') {
    return contentNoStoreJson({ status: 'submitted', replayed: true }, { status: 200 })
  }
  if (error) return contentNoStoreJson({ error: 'İtiraz gönderilemedi' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = appealSubmitResultSchema.safeParse(data)
  return result.success
    ? contentNoStoreJson(result.data, { status: result.data.replayed ? 200 : 201 })
    : contentNoStoreJson({ error: 'İtiraz gönderilemedi' }, { status: 500 })
}
