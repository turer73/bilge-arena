import { z } from 'zod'
import { requireContentGovernanceContext, contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceWriteLimiter } from '@/lib/content-governance/rate-limits'
import { appealResolveInputSchema, appealResolveResultSchema, contentGovernanceRpcStatus, contentNoStoreJson } from '@/lib/content-governance/server-contract'
export async function POST(request: Request, { params }: { params: Promise<{ appealId: string }> }) {
  const context = await requireContentGovernanceContext(request, contentGovernanceWriteLimiter, 'content.appeals.manage'); if (!context.ok) return context.response
  const id = z.string().uuid().safeParse((await params).appealId), body = appealResolveInputSchema.safeParse(await request.json().catch(() => null))
  if (!id.success || !body.success) return contentNoStoreJson({ error: 'Geçersiz itiraz kararı' }, { status: 400 })
  const { data, error } = await contentRpc(context.admin, 'resolve_question_appeal', { p_user_id: context.userId, p_appeal_id: id.data, p_status: body.data.status, p_public_message: body.data.publicMessage, p_internal_note: body.data.internalNote, p_request_id: body.data.requestId })
  if (error) return contentNoStoreJson({ error: 'İtiraz çözülemedi' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = appealResolveResultSchema.safeParse(data); return result.success ? contentNoStoreJson(result.data) : contentNoStoreJson({ error: 'İtiraz çözülemedi' }, { status: 500 })
}
