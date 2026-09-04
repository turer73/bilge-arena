import { contentGovernanceRpcStatus, contentNoStoreJson } from '@/lib/content-governance/server-contract'
import { requireTytSocialExamRoleContext, tytSocialExamRoleRpc } from '../context'
import { examRoleResultSchema, prepareExamRoleInputSchema } from '../contracts'

export async function POST(request: Request) {
  const context = await requireTytSocialExamRoleContext(request, 'content.prepare')
  if (!context.ok) return context.response

  const body = prepareExamRoleInputSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) {
    return contentNoStoreJson({ error: 'Geçersiz exam-role hazırlık isteği' }, { status: 400 })
  }
  if (request.headers.get('X-Idempotency-Key') !== body.data.requestId) {
    return contentNoStoreJson({ error: 'Geçersiz exam-role hazırlık isteği' }, { status: 400 })
  }

  let data: unknown
  let error: { code?: string } | null
  try {
    ({ data, error } = await tytSocialExamRoleRpc(context.client, 'prepare_tyt_social_exam_role', {
      p_actor_user_id: context.userId,
      p_revision_id: body.data.revisionId,
      p_exam_role: body.data.examRole,
      p_rationale: body.data.rationale,
      p_request_id: body.data.requestId,
    }))
  } catch {
    return contentNoStoreJson({ error: 'Exam-role hazırlığı kaydedilemedi' }, { status: 500 })
  }
  if (error) return contentNoStoreJson({ error: 'Exam-role hazırlığı kaydedilemedi' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = examRoleResultSchema.safeParse(data)
  return result.success
    ? contentNoStoreJson(result.data)
    : contentNoStoreJson({ error: 'Exam-role hazırlığı kaydedilemedi' }, { status: 500 })
}
