import { z } from 'zod'
import { requireContentGovernanceContext, contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceWriteLimiter } from '@/lib/content-governance/rate-limits'
import { contentGovernanceRpcStatus, contentNoStoreJson, incidentApplyResultSchema, requestIdInputSchema } from '@/lib/content-governance/server-contract'
export async function POST(request: Request, { params }: { params: Promise<{ incidentId: string }> }) {
  const context = await requireContentGovernanceContext(request, contentGovernanceWriteLimiter, 'content.corrections.apply'); if (!context.ok) return context.response
  const id = z.string().uuid().safeParse((await params).incidentId), body = requestIdInputSchema.safeParse(await request.json().catch(() => null))
  if (!id.success || !body.success) return contentNoStoreJson({ error: 'Geçersiz düzeltme isteği' }, { status: 400 })
  const { data, error } = await contentRpc(context.admin, 'apply_question_result_corrections', { p_user_id: context.userId, p_incident_id: id.data, p_request_id: body.data.requestId })
  if (error) return contentNoStoreJson({ error: 'Düzeltme uygulanamadı' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = incidentApplyResultSchema.safeParse(data); return result.success ? contentNoStoreJson(result.data) : contentNoStoreJson({ error: 'Düzeltme uygulanamadı' }, { status: 500 })
}
