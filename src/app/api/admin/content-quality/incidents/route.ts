import { requireContentGovernanceContext, contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceWriteLimiter } from '@/lib/content-governance/rate-limits'
import { contentGovernanceRpcStatus, contentNoStoreJson, incidentCreateInputSchema, incidentCreateResultSchema } from '@/lib/content-governance/server-contract'
export async function POST(request: Request) {
  const context = await requireContentGovernanceContext(request, contentGovernanceWriteLimiter, 'content.corrections.apply'); if (!context.ok) return context.response
  const body = incidentCreateInputSchema.safeParse(await request.json().catch(() => null)); if (!body.success) return contentNoStoreJson({ error: 'Geçersiz hata olayı' }, { status: 400 })
  const { data, error } = await contentRpc(context.admin, 'create_question_error_incident', { p_user_id: context.userId, p_question_id: body.data.questionId, p_erroneous_revision_id: body.data.revisionId, p_corrected_revision_id: body.data.correctedRevisionId, p_error_type: body.data.errorType, p_request_id: body.data.requestId })
  if (error) return contentNoStoreJson({ error: 'Hata olayı oluşturulamadı' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = incidentCreateResultSchema.safeParse(data); return result.success ? contentNoStoreJson(result.data, { status: 201 }) : contentNoStoreJson({ error: 'Hata olayı oluşturulamadı' }, { status: 500 })
}
