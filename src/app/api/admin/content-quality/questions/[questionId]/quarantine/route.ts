import { z } from 'zod'
import { requireContentGovernanceContext, contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceWriteLimiter } from '@/lib/content-governance/rate-limits'
import { contentGovernanceRpcStatus, contentNoStoreJson, quarantineInputSchema, quarantineResultSchema } from '@/lib/content-governance/server-contract'
export async function POST(request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const context = await requireContentGovernanceContext(request, contentGovernanceWriteLimiter, 'content.corrections.apply'); if (!context.ok) return context.response
  const id = z.string().uuid().safeParse((await params).questionId), body = quarantineInputSchema.safeParse(await request.json().catch(() => null))
  if (!id.success || !body.success) return contentNoStoreJson({ error: 'Geçersiz karantina isteği' }, { status: 400 })
  const { data, error } = await contentRpc(context.admin, 'quarantine_question_content', { p_user_id: context.userId, p_question_id: id.data, p_reason: body.data.reason, p_request_id: body.data.requestId })
  if (error) return contentNoStoreJson({ error: 'Soru karantinaya alınamadı' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = quarantineResultSchema.safeParse(data); return result.success ? contentNoStoreJson(result.data) : contentNoStoreJson({ error: 'Soru karantinaya alınamadı' }, { status: 500 })
}
