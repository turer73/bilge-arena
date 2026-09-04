import { contentGovernanceRpcStatus, contentNoStoreJson } from '@/lib/content-governance/server-contract'
import { requireTytSocialExamRoleContext, tytSocialExamRoleRpc } from '../context'
import { examRoleResultSchema, reviewExamRoleInputSchema } from '../contracts'

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null) as { stage?: unknown } | null
  const permission = raw?.stage === 2 ? 'content.review.stage2' : 'content.review.stage1'
  const context = await requireTytSocialExamRoleContext(request, permission)
  if (!context.ok) return context.response

  const body = reviewExamRoleInputSchema.safeParse(raw)
  if (!body.success) {
    return contentNoStoreJson({ error: 'Geçersiz exam-role inceleme isteği' }, { status: 400 })
  }
  if (request.headers.get('X-Idempotency-Key') !== body.data.requestId) {
    return contentNoStoreJson({ error: 'Geçersiz exam-role inceleme isteği' }, { status: 400 })
  }

  let data: unknown
  let error: { code?: string } | null
  try {
    ({ data, error } = await tytSocialExamRoleRpc(context.client, 'review_tyt_social_exam_role', {
      p_actor_user_id: context.userId,
      p_candidate_id: body.data.candidateId,
      p_stage: body.data.stage,
      p_decision: body.data.decision,
      p_rationale: body.data.rationale,
      p_request_id: body.data.requestId,
    }))
  } catch {
    return contentNoStoreJson({ error: 'Exam-role incelemesi kaydedilemedi' }, { status: 500 })
  }
  if (error) return contentNoStoreJson({ error: 'Exam-role incelemesi kaydedilemedi' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = examRoleResultSchema.safeParse(data)
  return result.success
    ? contentNoStoreJson(result.data)
    : contentNoStoreJson({ error: 'Exam-role incelemesi kaydedilemedi' }, { status: 500 })
}
